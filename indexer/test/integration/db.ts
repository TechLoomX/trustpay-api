// Test helper for the integration suite. Each test gets one transaction
// (always rolled back, so tests never leave rows behind for each other);
// within it, fixtures are inserted as the unrestricted table owner and then
// `asWallet` switches the *same* transaction to the `authenticated` role
// with request.jwt.claims set, exactly as PostgREST does per-request — so
// RLS is exercised for real, not mocked.
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set to run the integration suite');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export interface TestTx {
  client: pg.PoolClient;
  /** Switches this transaction to `authenticated` with the given wallet's claims. */
  asWallet(walletAddress: string): Promise<void>;
  /** Switches this transaction back to the unrestricted table owner (for further fixture setup). */
  asOwner(): Promise<void>;
}

/** Runs `fn` inside one transaction that is always rolled back at the end. */
export async function withTx<T>(fn: (tx: TestTx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const tx: TestTx = {
    client,
    async asWallet(walletAddress: string) {
      await client.query('SET LOCAL ROLE authenticated');
      // SET doesn't accept bind parameters; set_config(..., true) is the
      // parameterized equivalent of SET LOCAL for a single transaction.
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ wallet_address: walletAddress, role: 'authenticated' }),
      ]);
    },
    async asOwner() {
      await client.query('RESET ROLE');
    },
  };
  try {
    await client.query('BEGIN');
    return await fn(tx);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
