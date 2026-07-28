// POST /functions/v1/auth-verify
// body: { walletAddress: string, signedMessage: string (base64) } -> { token: string }
import { Buffer } from 'node:buffer';
import { Keypair, StrKey } from 'npm:@stellar/stellar-sdk@12';
import { createSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { mintWalletToken } from '../_shared/jwt.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Use POST', 405);
  }

  let body: { walletAddress?: string; signedMessage?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Request body must be JSON', 400);
  }

  const { walletAddress, signedMessage } = body;
  if (!walletAddress || !StrKey.isValidEd25519PublicKey(walletAddress) || !signedMessage) {
    return errorResponse('invalid_body', 'walletAddress and signedMessage are required', 400);
  }

  const supabase = createSupabaseAdmin();

  const { data: nonceRow, error: fetchError } = await supabase
    .from('auth_nonces')
    .select('nonce, expires_at, used')
    .eq('wallet_address', walletAddress)
    .eq('used', false)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return errorResponse('nonce_lookup_failed', fetchError.message, 500);
  }
  if (!nonceRow) {
    return errorResponse('nonce_not_found', 'No pending challenge for this wallet', 401);
  }

  const expiresAt = new Date(nonceRow.expires_at);
  if (expiresAt.getTime() <= Date.now()) {
    return errorResponse('nonce_expired', 'Challenge has expired, request a new one', 401);
  }

  const message = `Sign in to TrustPay — nonce: ${nonceRow.nonce} — expires: ${expiresAt.toISOString()}`;

  let signatureValid: boolean;
  try {
    const keypair = Keypair.fromPublicKey(walletAddress);
    signatureValid = keypair.verify(
      Buffer.from(message, 'utf8'),
      Buffer.from(signedMessage, 'base64'),
    );
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return errorResponse('invalid_signature', 'Signature does not match wallet and challenge', 401);
  }

  // Single-use: mark the nonce consumed before issuing a token.
  const { error: updateError } = await supabase
    .from('auth_nonces')
    .update({ used: true })
    .eq('wallet_address', walletAddress)
    .eq('nonce', nonceRow.nonce);

  if (updateError) {
    return errorResponse('nonce_update_failed', updateError.message, 500);
  }

  // Ensure a users row exists for this wallet (service role bypasses RLS).
  await supabase
    .from('users')
    .upsert({ wallet_address: walletAddress }, { onConflict: 'wallet_address', ignoreDuplicates: true });

  const token = await mintWalletToken(walletAddress);
  return jsonResponse({ token });
});
