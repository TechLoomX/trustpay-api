// Shapes assumed for the contract's typed events. Names and payload fields
// are NOT yet confirmed against the deployed contract's events.rs — verify
// against the actual source before running this against testnet, and adjust
// the mapping in eventHandlers.ts if they differ.

export type ContractEventName =
  | 'escrow_created'
  | 'milestone_funded'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'funds_released'
  | 'dispute_raised'
  | 'milestone_refunded';

export interface RawContractEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  /** topic[0] is assumed to be the event name as a symbol */
  topic: unknown[];
  /** decoded event body */
  value: unknown;
}

export interface EscrowCreatedPayload {
  escrowId: number;
  clientWallet: string;
  freelancerWallet: string;
  tokenAddress: string;
  milestones: Array<{ index: number; amount: string; descriptionHash: string }>;
}

export interface MilestoneEventPayload {
  escrowId: number;
  milestoneIndex: number;
}

export interface ProjectRow {
  id: string;
  escrow_id: number;
  client_wallet: string;
  freelancer_wallet: string;
  confirmed: boolean;
  status: string;
}

export type NotificationType =
  | 'milestone_funded'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'funds_released'
  | 'dispute_raised'
  | 'milestone_refunded';

export type MilestoneStatus =
  | 'Pending'
  | 'Funded'
  | 'Submitted'
  | 'Approved'
  | 'Released'
  | 'Disputed'
  | 'Refunded';
