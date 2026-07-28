// Maps a decoded contract event onto Store writes. This never decides
// whether money moves — it only mirrors state the contract already
// finalized on-chain, plus notifies the affected wallet(s).
import type { Store } from './store.js';
import type {
  ContractEventName,
  EscrowCreatedPayload,
  MilestoneEventPayload,
  RawContractEvent,
} from './types.js';

function eventName(event: RawContractEvent): ContractEventName | null {
  const name = event.topic[0];
  return typeof name === 'string' ? (name as ContractEventName) : null;
}

async function requireProject(store: Store, escrowId: number) {
  const project = await store.getProjectByEscrowId(escrowId);
  if (!project) {
    throw new Error(`no project found for escrow_id=${escrowId}; event skipped`);
  }
  return project;
}

async function handleEscrowCreated(store: Store, event: RawContractEvent) {
  const payload = event.value as EscrowCreatedPayload;
  const existing = await store.getProjectByEscrowId(payload.escrowId);

  if (existing) {
    // Client already POSTed the off-chain metadata (unconfirmed project row);
    // this event is the on-chain confirmation that create_escrow succeeded.
    await store.confirmProject(existing.id);
    return;
  }

  // Chain got ahead of the client's off-chain write. Keep the chain data
  // rather than drop it; title/description stay placeholders until the
  // client's metadata submission reconciles against this row.
  const stub = await store.insertUnconfirmedProjectStub({
    escrowId: payload.escrowId,
    contractId: event.contractId,
    clientWallet: payload.clientWallet,
    freelancerWallet: payload.freelancerWallet,
    tokenAddress: payload.tokenAddress,
  });
  await store.insertPendingMilestones(stub.id, payload.milestones);
}

async function handleMilestoneFunded(store: Store, event: RawContractEvent) {
  const payload = event.value as MilestoneEventPayload;
  const project = await requireProject(store, payload.escrowId);
  await store.updateMilestoneStatus(project.id, payload.milestoneIndex, 'Funded');
  // Freelancer needs to know the work they're about to do is now funded.
  await store.insertNotification(project.freelancer_wallet, 'milestone_funded', project.id, payload.milestoneIndex);
}

async function handleMilestoneSubmitted(store: Store, event: RawContractEvent) {
  const payload = event.value as MilestoneEventPayload;
  const project = await requireProject(store, payload.escrowId);
  await store.updateMilestoneStatus(project.id, payload.milestoneIndex, 'Submitted', {
    submittedAt: new Date().toISOString(),
  });
  // Client needs to review and approve.
  await store.insertNotification(project.client_wallet, 'milestone_submitted', project.id, payload.milestoneIndex);
}

async function handleMilestoneApproved(store: Store, event: RawContractEvent) {
  const payload = event.value as MilestoneEventPayload;
  const project = await requireProject(store, payload.escrowId);
  await store.updateMilestoneStatus(project.id, payload.milestoneIndex, 'Approved', {
    approvedAt: new Date().toISOString(),
  });
  await store.insertNotification(project.freelancer_wallet, 'milestone_approved', project.id, payload.milestoneIndex);
}

async function handleFundsReleased(store: Store, event: RawContractEvent) {
  const payload = event.value as MilestoneEventPayload;
  const project = await requireProject(store, payload.escrowId);
  await store.updateMilestoneStatus(project.id, payload.milestoneIndex, 'Released');
  await store.insertNotification(project.freelancer_wallet, 'funds_released', project.id, payload.milestoneIndex);
}

async function handleDisputeRaised(store: Store, event: RawContractEvent) {
  const payload = event.value as MilestoneEventPayload;
  const project = await requireProject(store, payload.escrowId);
  await store.updateMilestoneStatus(project.id, payload.milestoneIndex, 'Disputed');
  // Both participants need to know a dispute is live.
  await store.insertNotification(project.client_wallet, 'dispute_raised', project.id, payload.milestoneIndex);
  await store.insertNotification(project.freelancer_wallet, 'dispute_raised', project.id, payload.milestoneIndex);
}

async function handleMilestoneRefunded(store: Store, event: RawContractEvent) {
  const payload = event.value as MilestoneEventPayload;
  const project = await requireProject(store, payload.escrowId);
  await store.updateMilestoneStatus(project.id, payload.milestoneIndex, 'Refunded');
  await store.insertNotification(project.client_wallet, 'milestone_refunded', project.id, payload.milestoneIndex);
}

export async function processEvent(store: Store, event: RawContractEvent): Promise<void> {
  const name = eventName(event);
  switch (name) {
    case 'escrow_created':
      return handleEscrowCreated(store, event);
    case 'milestone_funded':
      return handleMilestoneFunded(store, event);
    case 'milestone_submitted':
      return handleMilestoneSubmitted(store, event);
    case 'milestone_approved':
      return handleMilestoneApproved(store, event);
    case 'funds_released':
      return handleFundsReleased(store, event);
    case 'dispute_raised':
      return handleDisputeRaised(store, event);
    case 'milestone_refunded':
      return handleMilestoneRefunded(store, event);
    default:
      // Unknown/unrelated event on the same contract — ignore rather than crash the loop.
      return;
  }
}
