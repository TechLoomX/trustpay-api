// POST /functions/v1/auth-challenge
// body: { walletAddress: string } -> { message: string }
import { StrKey } from 'npm:@stellar/stellar-sdk@12';
import { createSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Use POST', 405);
  }

  let body: { walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('invalid_body', 'Request body must be JSON', 400);
  }

  const walletAddress = body.walletAddress;
  if (!walletAddress || !StrKey.isValidEd25519PublicKey(walletAddress)) {
    return errorResponse('invalid_wallet_address', 'walletAddress must be a valid Stellar public key', 400);
  }

  const nonce = crypto.randomUUID();
  // Round to whole seconds so the timestamp embedded in the signed message
  // round-trips exactly through Postgres' timestamptz column on verify.
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  expiresAt.setMilliseconds(0);

  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from('auth_nonces').insert({
    wallet_address: walletAddress,
    nonce,
    expires_at: expiresAt.toISOString(),
    used: false,
  });

  if (error) {
    return errorResponse('nonce_store_failed', error.message, 500);
  }

  const message = `Sign in to TrustPay — nonce: ${nonce} — expires: ${expiresAt.toISOString()}`;
  return jsonResponse({ message });
});
