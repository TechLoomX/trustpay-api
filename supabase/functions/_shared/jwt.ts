// Mints Supabase-compatible JWTs: signed with the project's JWT secret, with
// `role: authenticated` so PostgREST maps the request to the `authenticated`
// Postgres role, plus a custom `wallet_address` claim that RLS policies read
// via `auth.jwt() ->> 'wallet_address'`.
//
// The secret is read from WALLET_AUTH_JWT_SECRET, not SUPABASE_JWT_SECRET —
// `supabase secrets set` rejects any name starting with `SUPABASE_` (that
// prefix is reserved for the platform's own auto-injected vars). Its VALUE
// must still be the project's actual JWT secret (Dashboard -> Project
// Settings -> API -> JWT Settings) so PostgREST accepts the tokens this
// mints; only the env var *name* holding that value differs.
import { SignJWT } from 'npm:jose@5';

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24h

export async function mintWalletToken(walletAddress: string): Promise<string> {
  const secret = Deno.env.get('WALLET_AUTH_JWT_SECRET');
  if (!secret) {
    throw new Error('WALLET_AUTH_JWT_SECRET must be set');
  }
  const key = new TextEncoder().encode(secret);
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    role: 'authenticated',
    wallet_address: walletAddress,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(walletAddress)
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(key);
}
