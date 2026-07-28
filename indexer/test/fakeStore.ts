import type { Store } from '../src/store.js';
import type { MilestoneStatus, NotificationType, ProjectRow } from '../src/types.js';

interface FakeMilestone {
  projectId: string;
  index: number;
  amount: string;
  descriptionHash: string;
  status: MilestoneStatus;
  submittedAt?: string;
  approvedAt?: string;
}

export interface FakeNotification {
  userWallet: string;
  type: NotificationType;
  projectId: string;
  milestoneIndex?: number;
}

/** In-memory stand-in for SupabaseStore, used to unit test eventHandlers without a live Postgres. */
export class FakeStore implements Store {
  projects: ProjectRow[] = [];
  milestones: FakeMilestone[] = [];
  notifications: FakeNotification[] = [];
  lastProcessedLedger = 0;
  private nextId = 1;

  seedProject(project: Omit<ProjectRow, 'id'> & { id?: string }): ProjectRow {
    const row: ProjectRow = { id: project.id ?? `project-${this.nextId++}`, ...project } as ProjectRow;
    this.projects.push(row);
    return row;
  }

  async getProjectByEscrowId(escrowId: number): Promise<ProjectRow | null> {
    return this.projects.find((p) => p.escrow_id === escrowId) ?? null;
  }

  async confirmProject(projectId: string): Promise<void> {
    const project = this.projects.find((p) => p.id === projectId);
    if (project) project.confirmed = true;
  }

  async insertUnconfirmedProjectStub(params: {
    escrowId: number;
    contractId: string;
    clientWallet: string;
    freelancerWallet: string;
    tokenAddress: string;
  }): Promise<ProjectRow> {
    return this.seedProject({
      escrow_id: params.escrowId,
      client_wallet: params.clientWallet,
      freelancer_wallet: params.freelancerWallet,
      confirmed: true,
      status: 'Active',
    });
  }

  async insertPendingMilestones(
    projectId: string,
    milestones: Array<{ index: number; amount: string; descriptionHash: string }>,
  ): Promise<void> {
    for (const m of milestones) {
      this.milestones.push({
        projectId,
        index: m.index,
        amount: m.amount,
        descriptionHash: m.descriptionHash,
        status: 'Pending',
      });
    }
  }

  async updateMilestoneStatus(
    projectId: string,
    index: number,
    status: MilestoneStatus,
    timestamps?: { submittedAt?: string; approvedAt?: string },
  ): Promise<void> {
    const milestone = this.milestones.find((m) => m.projectId === projectId && m.index === index);
    if (!milestone) throw new Error(`no milestone ${index} on project ${projectId}`);
    milestone.status = status;
    if (timestamps?.submittedAt) milestone.submittedAt = timestamps.submittedAt;
    if (timestamps?.approvedAt) milestone.approvedAt = timestamps.approvedAt;
  }

  async insertNotification(
    userWallet: string,
    type: NotificationType,
    projectId: string,
    milestoneIndex?: number,
  ): Promise<void> {
    this.notifications.push({ userWallet, type, projectId, milestoneIndex });
  }

  async getLastProcessedLedger(): Promise<number> {
    return this.lastProcessedLedger;
  }

  async setLastProcessedLedger(ledger: number): Promise<void> {
    this.lastProcessedLedger = ledger;
  }
}
