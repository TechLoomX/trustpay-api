// Exercises eventHandlers.ts against a real Postgres schema (migrations +
// CI shims already applied — see scripts/ci/apply-migrations.sh), not the
// in-memory FakeStore used by the unit suite. Covers the "mocked event
// sequence funded -> submitted -> approved -> released correctly updates
// milestone status" and "escrow_created flips projects.confirmed" cases
// from the API spec's "Tests to Include".
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { processEvent } from '../../src/eventHandlers.js';
import type { RawContractEvent } from '../../src/types.js';
import { closePool, withTx } from './db.js';
import { PgStore } from './pgStore.js';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function event(name: string, value: unknown): RawContractEvent {
  return {
    id: randomUUID(),
    ledger: 100,
    ledgerClosedAt: new Date().toISOString(),
    contractId: 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2',
    topic: [name],
    value,
  };
}

afterAll(async () => {
  await closePool();
});

describe('event processing against real Postgres', () => {
  it('escrow_created confirms an existing unconfirmed project', async () => {
    await withTx(async (tx) => {
      const store = new PgStore(tx.client);
      const escrowId = 555001;

      await tx.client.query(
        `insert into users (wallet_address) values ($1), ($2) on conflict do nothing`,
        ['GALICEINTEGRATION000000000000000000000000000000000000', 'GBOBINTEGRATION0000000000000000000000000000000000000'],
      );
      const { rows } = await tx.client.query(
        `insert into projects (escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address, confirmed)
         values ($1, 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2',
                 'GALICEINTEGRATION000000000000000000000000000000000000',
                 'GBOBINTEGRATION0000000000000000000000000000000000000',
                 'Integration test project', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', false)
         returning id`,
        [escrowId],
      );
      const projectId = rows[0].id as string;

      await processEvent(
        store,
        event('escrow_created', {
          escrowId,
          clientWallet: 'GALICEINTEGRATION000000000000000000000000000000000000',
          freelancerWallet: 'GBOBINTEGRATION0000000000000000000000000000000000000',
          tokenAddress: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          milestones: [],
        }),
      );

      const { rows: after } = await tx.client.query('select confirmed from projects where id = $1', [projectId]);
      expect(after[0].confirmed).toBe(true);
    });
  });

  it('funded -> submitted -> approved -> released updates milestone status and notifies the right wallet each step', async () => {
    await withTx(async (tx) => {
      const store = new PgStore(tx.client);
      const escrowId = 555002;
      const clientWallet = 'GALICEINTEGRATION111111111111111111111111111111111111';
      const freelancerWallet = 'GBOBINTEGRATION11111111111111111111111111111111111111';

      await tx.client.query(`insert into users (wallet_address) values ($1), ($2) on conflict do nothing`, [
        clientWallet,
        freelancerWallet,
      ]);
      const { rows: projectRows } = await tx.client.query(
        `insert into projects (escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address, confirmed)
         values ($1, 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2', $2, $3, 'p', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', true)
         returning id`,
        [escrowId, clientWallet, freelancerWallet],
      );
      const projectId = projectRows[0].id as string;

      const description = 'Ship the thing';
      await tx.client.query(
        `insert into milestones (project_id, index, amount, title, long_description, description_hash, status)
         values ($1, 0, '100', 'M0', $2, $3, 'Pending')`,
        [projectId, description, sha256Hex(description)],
      );

      await processEvent(store, event('milestone_funded', { escrowId, milestoneIndex: 0 }));
      await processEvent(store, event('milestone_submitted', { escrowId, milestoneIndex: 0 }));
      await processEvent(store, event('milestone_approved', { escrowId, milestoneIndex: 0 }));
      await processEvent(store, event('funds_released', { escrowId, milestoneIndex: 0 }));

      const { rows: milestoneRows } = await tx.client.query(
        `select status, submitted_at, approved_at from milestones where project_id = $1 and index = 0`,
        [projectId],
      );
      expect(milestoneRows[0].status).toBe('Released');
      expect(milestoneRows[0].submitted_at).not.toBeNull();
      expect(milestoneRows[0].approved_at).not.toBeNull();

      const { rows: notificationRows } = await tx.client.query(
        `select user_wallet, type from notifications where project_id = $1 order by created_at`,
        [projectId],
      );
      expect(notificationRows).toEqual([
        { user_wallet: freelancerWallet, type: 'milestone_funded' },
        { user_wallet: clientWallet, type: 'milestone_submitted' },
        { user_wallet: freelancerWallet, type: 'milestone_approved' },
        { user_wallet: freelancerWallet, type: 'funds_released' },
      ]);
    });
  });
});
