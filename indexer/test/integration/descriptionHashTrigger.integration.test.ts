// Confirms the description_hash trigger (supabase/migrations/0001_initial_schema.sql)
// actually runs against a real Postgres, not just in the pgTAP suite.
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, withTx } from './db.js';

const CLIENT = 'GALICEHASH0000000000000000000000000000000000000000000';
const FREELANCER = 'GBOBHASH0000000000000000000000000000000000000000000';

async function seedProject(client: import('pg').PoolClient): Promise<string> {
  await client.query(`insert into users (wallet_address) values ($1), ($2) on conflict do nothing`, [
    CLIENT,
    FREELANCER,
  ]);
  const { rows } = await client.query(
    `insert into projects (escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address)
     values (888001, 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2', $1, $2, 'p', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
     returning id`,
    [CLIENT, FREELANCER],
  );
  return rows[0].id as string;
}

afterAll(async () => {
  await closePool();
});

describe('description_hash trigger', () => {
  it('rejects a milestone insert whose description_hash does not match sha256(long_description)', async () => {
    await withTx(async (tx) => {
      const projectId = await seedProject(tx.client);
      await expect(
        tx.client.query(
          `insert into milestones (project_id, index, amount, title, long_description, description_hash)
           values ($1, 0, '100', 'M0', 'the real text', 'not-the-real-hash')`,
          [projectId],
        ),
      ).rejects.toThrow(/description_hash does not match/);
    });
  });

  it('accepts a milestone insert whose description_hash matches', async () => {
    await withTx(async (tx) => {
      const projectId = await seedProject(tx.client);
      const { rowCount } = await tx.client.query(
        `insert into milestones (project_id, index, amount, title, long_description, description_hash)
         values ($1, 0, '100', 'M0', 'the real text', encode(digest('the real text', 'sha256'), 'hex'))`,
        [projectId],
      );
      expect(rowCount).toBe(1);
    });
  });
});
