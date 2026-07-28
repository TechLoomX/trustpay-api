// Persistence boundary between the indexer's event-processing logic and
// Supabase. Kept as a narrow interface so eventHandlers.ts can be unit
// tested against an in-memory fake instead of a live Postgres instance.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MilestoneStatus, NotificationType, ProjectRow } from './types.js';

export interface Store {
  getProjectByEscrowId(escrowId: number): Promise<ProjectRow | null>;
  confirmProject(projectId: string): Promise<void>;
  insertUnconfirmedProjectStub(params: {
    escrowId: number;
    contractId: string;
    clientWallet: string;
    freelancerWallet: string;
    tokenAddress: string;
  }): Promise<ProjectRow>;
  insertPendingMilestones(
    projectId: string,
    milestones: Array<{ index: number; amount: string; descriptionHash: string }>,
  ): Promise<void>;
  updateMilestoneStatus(
    projectId: string,
    index: number,
    status: MilestoneStatus,
    timestamps?: { submittedAt?: string; approvedAt?: string },
  ): Promise<void>;
  insertNotification(userWallet: string, type: NotificationType, projectId: string, milestoneIndex?: number): Promise<void>;
  getLastProcessedLedger(): Promise<number>;
  setLastProcessedLedger(ledger: number): Promise<void>;
}

export class SupabaseStore implements Store {
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async getProjectByEscrowId(escrowId: number): Promise<ProjectRow | null> {
    const { data, error } = await this.client
      .from('projects')
      .select('id, escrow_id, client_wallet, freelancer_wallet, confirmed, status')
      .eq('escrow_id', escrowId)
      .maybeSingle();
    if (error) throw error;
    return data as ProjectRow | null;
  }

  async confirmProject(projectId: string): Promise<void> {
    const { error } = await this.client
      .from('projects')
      .update({ confirmed: true, last_synced_at: new Date().toISOString() })
      .eq('id', projectId);
    if (error) throw error;
  }

  async insertUnconfirmedProjectStub(params: {
    escrowId: number;
    contractId: string;
    clientWallet: string;
    freelancerWallet: string;
    tokenAddress: string;
  }): Promise<ProjectRow> {
    const { data, error } = await this.client
      .from('projects')
      .insert({
        escrow_id: params.escrowId,
        contract_id: params.contractId,
        client_wallet: params.clientWallet,
        freelancer_wallet: params.freelancerWallet,
        title: '(pending off-chain metadata)',
        token_address: params.tokenAddress,
        confirmed: true,
        last_synced_at: new Date().toISOString(),
      })
      .select('id, escrow_id, client_wallet, freelancer_wallet, confirmed, status')
      .single();
    if (error) throw error;
    return data as ProjectRow;
  }

  async insertPendingMilestones(
    projectId: string,
    milestones: Array<{ index: number; amount: string; descriptionHash: string }>,
  ): Promise<void> {
    if (milestones.length === 0) return;
    const { error } = await this.client.from('milestones').upsert(
      milestones.map((m) => ({
        project_id: projectId,
        index: m.index,
        amount: m.amount,
        title: `Milestone ${m.index}`,
        long_description: '(awaiting off-chain metadata)',
        description_hash: m.descriptionHash,
        status: 'Pending',
      })),
      { onConflict: 'project_id,index', ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  async updateMilestoneStatus(
    projectId: string,
    index: number,
    status: MilestoneStatus,
    timestamps?: { submittedAt?: string; approvedAt?: string },
  ): Promise<void> {
    const { error } = await this.client
      .from('milestones')
      .update({
        status,
        last_synced_at: new Date().toISOString(),
        ...(timestamps?.submittedAt ? { submitted_at: timestamps.submittedAt } : {}),
        ...(timestamps?.approvedAt ? { approved_at: timestamps.approvedAt } : {}),
      })
      .eq('project_id', projectId)
      .eq('index', index);
    if (error) throw error;
  }

  async insertNotification(
    userWallet: string,
    type: NotificationType,
    projectId: string,
    milestoneIndex?: number,
  ): Promise<void> {
    const { error } = await this.client.from('notifications').insert({
      user_wallet: userWallet,
      type,
      project_id: projectId,
      milestone_index: milestoneIndex ?? null,
      read: false,
    });
    if (error) throw error;
  }

  async getLastProcessedLedger(): Promise<number> {
    const { data, error } = await this.client
      .from('indexer_state')
      .select('last_processed_ledger')
      .eq('id', 'singleton')
      .single();
    if (error) throw error;
    return data.last_processed_ledger as number;
  }

  async setLastProcessedLedger(ledger: number): Promise<void> {
    const { error } = await this.client
      .from('indexer_state')
      .update({ last_processed_ledger: ledger, updated_at: new Date().toISOString() })
      .eq('id', 'singleton');
    if (error) throw error;
  }
}

export function createSupabaseStoreFromEnv(): SupabaseStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return new SupabaseStore(url, key);
}
