// RLS boundary tests against a real Postgres instance, exercised the same
// way PostgREST would: SET LOCAL ROLE authenticated + request.jwt.claims
// per "request". See supabase/tests/database/*.test.sql for the pgTAP
// equivalents these mirror (run those via `supabase test db` locally).
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, withTx } from './db.js';

const ALICE = 'GALICERLS0000000000000000000000000000000000000000000';
const BOB = 'GBOBRLS00000000000000000000000000000000000000000000';
const MALLORY = 'GMALLORYRLS000000000000000000000000000000000000000';

afterAll(async () => {
  await closePool();
});

describe('RLS: projects', () => {
  it('participants can read their project; a non-participant cannot', async () => {
    await withTx(async (tx) => {
      await tx.client.query(`insert into users (wallet_address) values ($1), ($2), ($3) on conflict do nothing`, [
        ALICE,
        BOB,
        MALLORY,
      ]);
      const { rows } = await tx.client.query(
        `insert into projects (escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address, confirmed)
         values (777001, 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2', $1, $2, 'p', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true)
         returning id`,
        [ALICE, BOB],
      );
      const projectId = rows[0].id as string;

      await tx.asWallet(ALICE);
      const asAlice = await tx.client.query('select id from projects where id = $1', [projectId]);
      expect(asAlice.rowCount).toBe(1);

      await tx.asWallet(BOB);
      const asBob = await tx.client.query('select id from projects where id = $1', [projectId]);
      expect(asBob.rowCount).toBe(1);

      await tx.asWallet(MALLORY);
      const asMallory = await tx.client.query('select id from projects where id = $1', [projectId]);
      expect(asMallory.rowCount).toBe(0);
    });
  });

  it('wallet A cannot create a project claiming wallet B as client_wallet', async () => {
    await withTx(async (tx) => {
      await tx.client.query(`insert into users (wallet_address) values ($1), ($2) on conflict do nothing`, [
        ALICE,
        MALLORY,
      ]);

      await tx.asWallet(MALLORY);
      await expect(
        tx.client.query(
          `insert into projects (escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address)
           values (777002, 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2', $1, $2, 'forged', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')`,
          [ALICE, MALLORY],
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });
});

describe('RLS: notifications', () => {
  it('wallet A cannot read or mark-read wallet B notifications', async () => {
    await withTx(async (tx) => {
      await tx.client.query(`insert into users (wallet_address) values ($1), ($2) on conflict do nothing`, [
        ALICE,
        BOB,
      ]);
      const { rows } = await tx.client.query(
        `insert into notifications (user_wallet, type, read) values ($1, 'milestone_funded', false) returning id`,
        [BOB],
      );
      const notificationId = rows[0].id as string;

      await tx.asWallet(ALICE);
      const readAsAlice = await tx.client.query('select id from notifications where id = $1', [notificationId]);
      expect(readAsAlice.rowCount).toBe(0);

      await tx.client.query('update notifications set read = true where id = $1', [notificationId]);

      await tx.asOwner();
      const stillUnread = await tx.client.query('select read from notifications where id = $1', [notificationId]);
      expect(stillUnread.rows[0].read).toBe(false);

      await tx.asWallet(BOB);
      await tx.client.query('update notifications set read = true where id = $1', [notificationId]);
      const nowRead = await tx.client.query('select read from notifications where id = $1', [notificationId]);
      expect(nowRead.rows[0].read).toBe(true);
    });
  });
});
