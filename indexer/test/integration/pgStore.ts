// Store implementation backed by raw `pg`, used only by the integration
// suite to exercise eventHandlers.ts against a real Postgres schema
// (including the description-hash trigger and RLS-adjacent constraints)
// without needing a full Supabase stack (PostgREST/GoTrue) in CI. In
// production the indexer uses SupabaseStore (src/store.ts) with the service
// role key, which — like this client connecting as the table owner —
// bypasses RLS.
import type pg from 'pg';
import type { Store } from '../../src/store.js';
import type { MilestoneStatus, NotificationType, ProjectRow } from '../../src/types.js';

export class PgStore implements Store {
  constructor(private client: pg.PoolClient) {}

  async getProjectByEscrowId(escrowId: number): Promise<ProjectRow | null> {
    const { rows } = await this.client.query(
      `select id, escrow_id, client_wallet, freelancer_wallet, confirmed, status
       from projects where escrow_id = $1`,
      [escrowId],
    );
    return (rows[0] as ProjectRow) ?? null;
  }

  async confirmProject(projectId: string): Promise<void> {
    await this.client.query(`update projects set confirmed = true, last_synced_at = now() where id = $1`, [
      projectId,
    ]);
  }

  async insertUnconfirmedProjectStub(params: {
    escrowId: number;
    contractId: string;
    clientWallet: string;
    freelancerWallet: string;
    tokenAddress: string;
  }): Promise<ProjectRow> {
    const { rows } = await this.client.query(
      `insert into projects (escrow_id, contract_id, client_wallet, freelancer_wallet, title, token_address, confirmed, last_synced_at)
       values ($1, $2, $3, $4, '(pending off-chain metadata)', $5, true, now())
       returning id, escrow_id, client_wallet, freelancer_wallet, confirmed, status`,
      [params.escrowId, params.contractId, params.clientWallet, params.freelancerWallet, params.tokenAddress],
    );
    return rows[0] as ProjectRow;
  }

  async insertPendingMilestones(
    projectId: string,
    milestones: Array<{ index: number; amount: string; descriptionHash: string }>,
  ): Promise<void> {
    for (const m of milestones) {
      await this.client.query(
        `insert into milestones (project_id, index, amount, title, long_description, description_hash, status)
         values ($1, $2, $3, $4, '(awaiting off-chain metadata)', $5, 'Pending')
         on conflict (project_id, index) do nothing`,
        [projectId, m.index, m.amount, `Milestone ${m.index}`, m.descriptionHash],
      );
    }
  }

  async updateMilestoneStatus(
    projectId: string,
    index: number,
    status: MilestoneStatus,
    timestamps?: { submittedAt?: string; approvedAt?: string },
  ): Promise<void> {
    await this.client.query(
      `update milestones
       set status = $3,
           last_synced_at = now(),
           submitted_at = coalesce($4, submitted_at),
           approved_at = coalesce($5, approved_at)
       where project_id = $1 and index = $2`,
      [projectId, index, status, timestamps?.submittedAt ?? null, timestamps?.approvedAt ?? null],
    );
  }

  async insertNotification(
    userWallet: string,
    type: NotificationType,
    projectId: string,
    milestoneIndex?: number,
  ): Promise<void> {
    await this.client.query(
      `insert into notifications (user_wallet, type, project_id, milestone_index) values ($1, $2, $3, $4)`,
      [userWallet, type, projectId, milestoneIndex ?? null],
    );
  }

  async getLastProcessedLedger(): Promise<number> {
    const { rows } = await this.client.query(`select last_processed_ledger from indexer_state where id = 'singleton'`);
    return Number(rows[0]?.last_processed_ledger ?? 0);
  }

  async setLastProcessedLedger(ledger: number): Promise<void> {
    await this.client.query(
      `update indexer_state set last_processed_ledger = $1, updated_at = now() where id = 'singleton'`,
      [ledger],
    );
  }
}
