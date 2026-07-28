import { beforeEach, describe, expect, it } from 'vitest';
import { processEvent } from '../src/eventHandlers.js';
import { FakeStore } from './fakeStore.js';
import type { RawContractEvent } from '../src/types.js';

const CONTRACT_ID = 'CCPOUXHJT3D7EKM44ASLS442QSNRF6IKCMIAI466FSCYMA6BWKDHHFR2';
const CLIENT = 'GALICE00000000000000000000000000000000000000000000000';
const FREELANCER = 'GBOBFR0000000000000000000000000000000000000000000000';

function event(name: string, value: unknown): RawContractEvent {
  return {
    id: `evt-${name}-${Math.random()}`,
    ledger: 1,
    ledgerClosedAt: new Date().toISOString(),
    contractId: CONTRACT_ID,
    topic: [name],
    value,
  };
}

describe('processEvent', () => {
  let store: FakeStore;

  beforeEach(() => {
    store = new FakeStore();
  });

  it('confirms an existing unconfirmed project on escrow_created', async () => {
    const project = store.seedProject({
      escrow_id: 42,
      client_wallet: CLIENT,
      freelancer_wallet: FREELANCER,
      confirmed: false,
      status: 'Active',
    });
    store.milestones.push({ projectId: project.id, index: 0, amount: '100', descriptionHash: 'x', status: 'Pending' });

    await processEvent(
      store,
      event('escrow_created', {
        escrowId: 42,
        clientWallet: CLIENT,
        freelancerWallet: FREELANCER,
        tokenAddress: 'CAAA',
        milestones: [],
      }),
    );

    expect(store.projects.find((p) => p.escrow_id === 42)?.confirmed).toBe(true);
  });

  it('inserts a project stub when escrow_created arrives before the off-chain POST', async () => {
    await processEvent(
      store,
      event('escrow_created', {
        escrowId: 99,
        clientWallet: CLIENT,
        freelancerWallet: FREELANCER,
        tokenAddress: 'CAAA',
        milestones: [{ index: 0, amount: '500', descriptionHash: 'abc123' }],
      }),
    );

    const project = store.projects.find((p) => p.escrow_id === 99);
    expect(project).toBeDefined();
    expect(project?.confirmed).toBe(true);
    expect(store.milestones).toHaveLength(1);
    expect(store.milestones[0].status).toBe('Pending');
  });

  it('mirrors a full funded → submitted → approved → released sequence', async () => {
    const project = store.seedProject({
      escrow_id: 7,
      client_wallet: CLIENT,
      freelancer_wallet: FREELANCER,
      confirmed: true,
      status: 'Active',
    });
    store.milestones.push({ projectId: project.id, index: 0, amount: '1000', descriptionHash: 'x', status: 'Pending' });

    await processEvent(store, event('milestone_funded', { escrowId: 7, milestoneIndex: 0 }));
    expect(store.milestones[0].status).toBe('Funded');
    expect(store.notifications).toContainEqual({
      userWallet: FREELANCER,
      type: 'milestone_funded',
      projectId: project.id,
      milestoneIndex: 0,
    });

    await processEvent(store, event('milestone_submitted', { escrowId: 7, milestoneIndex: 0 }));
    expect(store.milestones[0].status).toBe('Submitted');
    expect(store.milestones[0].submittedAt).toBeDefined();
    expect(store.notifications).toContainEqual(
      expect.objectContaining({ userWallet: CLIENT, type: 'milestone_submitted' }),
    );

    await processEvent(store, event('milestone_approved', { escrowId: 7, milestoneIndex: 0 }));
    expect(store.milestones[0].status).toBe('Approved');
    expect(store.milestones[0].approvedAt).toBeDefined();

    await processEvent(store, event('funds_released', { escrowId: 7, milestoneIndex: 0 }));
    expect(store.milestones[0].status).toBe('Released');
    expect(store.notifications).toContainEqual(
      expect.objectContaining({ userWallet: FREELANCER, type: 'funds_released' }),
    );
  });

  it('notifies both participants on dispute_raised', async () => {
    const project = store.seedProject({
      escrow_id: 8,
      client_wallet: CLIENT,
      freelancer_wallet: FREELANCER,
      confirmed: true,
      status: 'Active',
    });
    store.milestones.push({ projectId: project.id, index: 0, amount: '1000', descriptionHash: 'x', status: 'Submitted' });

    await processEvent(store, event('dispute_raised', { escrowId: 8, milestoneIndex: 0 }));

    expect(store.milestones[0].status).toBe('Disputed');
    expect(store.notifications).toHaveLength(2);
    expect(store.notifications.map((n) => n.userWallet).sort()).toEqual([CLIENT, FREELANCER].sort());
  });

  it('notifies the client on milestone_refunded', async () => {
    const project = store.seedProject({
      escrow_id: 9,
      client_wallet: CLIENT,
      freelancer_wallet: FREELANCER,
      confirmed: true,
      status: 'Active',
    });
    store.milestones.push({ projectId: project.id, index: 0, amount: '1000', descriptionHash: 'x', status: 'Disputed' });

    await processEvent(store, event('milestone_refunded', { escrowId: 9, milestoneIndex: 0 }));

    expect(store.milestones[0].status).toBe('Refunded');
    expect(store.notifications).toContainEqual(
      expect.objectContaining({ userWallet: CLIENT, type: 'milestone_refunded' }),
    );
  });

  it('throws when a milestone event references an unknown escrow', async () => {
    await expect(
      processEvent(store, event('milestone_funded', { escrowId: 404, milestoneIndex: 0 })),
    ).rejects.toThrow(/no project found/);
  });

  it('ignores events with an unrecognized name', async () => {
    await expect(processEvent(store, event('some_unrelated_event', {}))).resolves.toBeUndefined();
  });
});
