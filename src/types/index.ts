// User types
export type UserRole = 'member' | 'moderator' | 'co_admin' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  joinedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Auth types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Ledger (unified fund entries — Phase 1/2 of the redesign) types
export type LedgerDirection = 'CREDIT' | 'DEBIT';
export type LedgerEntryType =
  | 'CONTRIBUTION_MONTHLY'
  | 'CONTRIBUTION_FLEX'
  | 'INTEREST_BANK'
  | 'INVESTMENT_RETURN'
  | 'INVESTMENT_PRINCIPAL_BACK'
  | 'BANK_CHARGE'
  | 'OPERATIONAL_COST'
  | 'INVESTMENT_OUT'
  | 'WITHDRAWAL'
  | 'ADJUSTMENT';
export type LedgerEntryStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'REJECTED' | 'REVERSED';

export interface LedgerAttachment {
  url: string;
  publicId?: string;
  kind: 'SCREENSHOT' | 'RECEIPT' | 'STATEMENT';
  uploadedAt: string;
  uploadedBy: string;
}

export interface LedgerApproval {
  by: string;
  at: string;
  note?: string;
}

export interface LedgerEntry {
  id: string;
  direction: LedgerDirection;
  type: LedgerEntryType;
  status: LedgerEntryStatus;
  amount: number; // whole Taka
  memberId: string | null;
  period: string; // 'YYYY-MM'
  valueDate: string;
  title: string;
  note?: string;
  channel?: string;
  attachments: LedgerAttachment[];
  reversalOf: string | null;
  reversedBy: string | null;
  createdBy: string;
  requiredApprovals: number;
  approvals: LedgerApproval[];
  postedAt?: string;
  rejectedBy: string | null;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntryListResponse {
  success: boolean;
  data: LedgerEntry[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  message?: string;
}

export interface GroupStatusMember {
  id: string;
  name: string;
  avatar: string | null;
  headshot: string | null; // admin-curated photo for Home's Group/Top Contributors only
  status: 'paid' | 'pending' | 'unpaid';
  paid: number;
}

export interface GroupStatus {
  period: string;
  members: GroupStatusMember[];
}

export interface TopContributor {
  id: string;
  name: string;
  avatar: string | null;
  headshot: string | null; // admin-curated photo for Home's Group/Top Contributors only
  totalPaid: number; // whole Taka, all-time — what they personally submitted, nothing else
  // totalPaid plus an even split of investment returns/costs across active
  // members — same formula as FundPosition.myShare. This is what's actually
  // displayed on the leaderboard; totalPaid alone still drives who
  // qualifies (see /api/dashboard/top-contributors).
  fundShare: number;
}

export interface FundPosition {
  cash: number; // whole Taka
  investedAtCost: number;
  fundValue: number;
  netBalance: number; // liquid cash currently available after all movements
  // The requesting member's own contributions plus an even split of
  // investment returns and operational costs across active members —
  // interest is left out of the split. See /api/fund/route.ts.
  myShare: number;
}

// Investment register (Phase 4)
export type InvestmentKind = 'FDR' | 'DPS' | 'SHARE' | 'BOND' | 'PROPERTY' | 'BUSINESS' | 'OTHER';
export type InvestmentStatus = 'PROPOSED' | 'ACTIVE' | 'MATURED' | 'EXITED' | 'WRITTEN_OFF';

export interface Investment {
  id: string;
  name: string;
  kind: InvestmentKind;
  status: InvestmentStatus;
  principal: number; // whole Taka — denormalized from posted INVESTMENT_OUT/PRINCIPAL_BACK entries
  realisedReturn: number;
  expectedRatePct?: number;
  startDate?: string;
  maturityDate?: string;
  currentValue: number | null;
  valuedAt?: string;
  proposedBy: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Period close/reopen (Phase 4)
export type PeriodStatus = 'OPEN' | 'CLOSED' | 'REOPENED';

export interface PeriodSnapshot {
  contributionsMonthly: number; // whole Taka
  contributionsFlex: number;
  interest: number;
  investmentReturns: number;
  bankCharges: number;
  operationalCosts: number;
  investedOut: number;
  investmentPrincipalBack: number;
  cash: number;
  investedAtCost: number;
  fundValue: number;
  membersPaid: number;
  membersPending: number;
  membersUnpaid: number;
}

export interface PeriodDetail {
  month: string;
  status: PeriodStatus;
  closedAt?: string;
  reopenReason?: string | null;
  snapshot: PeriodSnapshot;
}

// The public member directory (GET /api/members) — minimal, safe for every
// member to see about every other member. Distinct from the full `User`
// shape (which includes email/phoneNumber and is admin-only via /api/users).
export interface PublicMember {
  id: string;
  name: string;
  avatar: string | null;
  role: UserRole;
  joinedAt: string;
}

// Bank Account types
export interface BankAccount {
  id: string;
  userId: string;
  bankName: string;
  accountNumber: string;
  accountHolderName?: string;
  branchName?: string;
  routingNumber?: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Transfer types
export type TransferStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type TransferChannel = 'BANK_TRANSFER' | 'BKASH' | 'NAGAD' | 'ROCKET' | 'CASH' | 'OTHER';

export interface Transfer {
  id: string;
  userId: string;
  user?: User;
  transferDate: string;
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  selectMonth: string;
  transferChannel: TransferChannel;
  monthlyAmount: number;
  flexAmount: number;
  totalAmount: number;
  paymentProofUrl?: string;
  paymentProofPublicId?: string;
  status: TransferStatus;
  remarks?: string;
  rejectionReason?: string;
  verifiedById?: string;
  verifiedAt?: string;
  syncedToSheet: boolean;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Paginated Transfers Response
export interface PaginatedTransfersResponse {
  success: boolean;
  message?: string;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPage: number;
  };
  data: Transfer[];
}

// Summary types
export interface MonthlySummary {
  expected: number;
  paid: number;
  remaining: number;
  monthsPaid: number;
  monthsRemaining: number;
  perMonth: number;
  latePayments: number;
}

export interface FlexibleSummary {
  expected: number;
  paid: number;
  remaining: number;
}

export interface TotalSummary {
  expected: number;
  paid: number;
  remaining: number;
  completionPercentage: number;
}

export interface UserYearlySummary {
  year: number;
  monthly: MonthlySummary;
  flexible: FlexibleSummary;
  total: TotalSummary;
}

export interface GlobalSummaryUserSummary {
  userId: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string | null;
  monthlyPaid: number;
  monthlyRemaining: number;
  flexiblePaid: number;
  flexibleRemaining: number;
  totalPaid: number;
  totalRemaining: number;
  completionPercentage: number;
}

export interface GlobalSummaryCostItem {
  id: string;
  date: string;
  category: string;
  amount: number;
  reason: string;
}

export interface GlobalSummary {
  year: number;
  // Human-readable label for the period this summary covers — "2026" for
  // the year view, "July 2025 – August 2026 (All Time)" for the all-time
  // view. Prefer this over `year` for display; `year` alone can't express
  // an all-time range.
  periodLabel: string;
  config: {
    monthlyAmount: number;
    yearlyFlexibleAmount: number;
    deadlineDay: number;
    totalMembers: number;
  };
  totals: {
    expected: number;
    collected: number;
    remaining: number;
    costs: number;
    operationalCosts: number;
    investmentAmount: number;
    interest: number;
    investmentReturns: number;
    netAmount: number;
  };
  breakdown: {
    monthlyExpected: number;
    monthlyCollected: number;
    flexibleExpected: number;
    flexibleCollected: number;
  };
  costItems: GlobalSummaryCostItem[];
  userSummaries: GlobalSummaryUserSummary[];
}

// For admin summaries list
export interface UserSummary {
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string | null;
  expected: number;
  paid: number;
  remaining: number;
  completionPercentage: number;
}

export interface MonthlyCollectionSummary {
  id: string;
  month: string;
  year: number;
  totalCollected: number;
  totalMonthly: number;
  totalFlex: number;
  totalCosts: number;
  netBalance: number;
  fullyPaidMembers: number;
  partiallyPaidMembers: number;
  unpaidMembers: number;
  generatedAt: string;
  syncedToSheet: boolean;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CostCategory = 'bank_charge' | 'operational' | 'investment' |'other';

export interface CostActor {
  id: string;
  name: string;
  email: string;
}

export interface Cost {
  id: string;
  amount: number;
  date: string;
  reason: string;
  category: CostCategory;
  submittedBy: CostActor | string;
  approvedBy: CostActor | string | null;
  receiptImage?: string;
  receiptImagePublicId?: string;
  syncedToSheet: boolean;
  syncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDashboardPaymentStatusMember {
  userId: string;
  name: string;
  avatar?: string | null;
  status: 'paid' | 'partial' | 'unpaid';
  amountSubmitted: number;
  amountVerified: number;
}

export interface AdminDashboardFlexProgress {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  paid: number;
  target: number;
  progress: number;
  warning: boolean;
}

export interface DashboardActivityItem {
  id: string;
  actorName: string;
  action: string;
  targetCollection?: string;
  timestamp: string;
}

export interface DashboardSyncFailureItem {
  id: string;
  type: 'transfer' | 'cost';
  label: string;
  date: string;
}

export interface AdminDashboardData {
  currentMonth: string;
  stats: {
    totalMembers: number;
    targetThisMonth: number;
    collectedThisMonth: number;
    pendingCount: number;
    totalFundBalance: number;
    collectionRate: number;
  };
  paymentStatus: {
    paid: number;
    partial: number;
    unpaid: number;
    members: AdminDashboardPaymentStatusMember[];
  };
  flexProgress: AdminDashboardFlexProgress[];
  recentActivity: DashboardActivityItem[];
  syncFailures: {
    transferCount: number;
    costCount: number;
    items: DashboardSyncFailureItem[];
  };
}

export interface MemberDashboardData {
  currentMonth: string;
  monthlyStatus: {
    status: 'paid' | 'partial' | 'unpaid';
    targetAmount: number;
    verifiedAmount: number;
    submittedAmount: number;
    remainingAmount: number;
    deadlineDay: number;
  };
  flexStatus: {
    paid: number;
    target: number;
    halfTarget: number;
    warning: boolean;
    remaining: number;
  };
  summary: UserYearlySummary;
  recentTransfers: Array<{
    id: string;
    selectMonth: string;
    totalAmount: number;
    monthlyAmount: number;
    flexAmount: number;
    status: TransferStatus;
    transferDate: string;
    createdAt: string;
  }>;
}

// Policy types
export interface Policy {
  id: string;
  year: number;
  monthlyAmount: number;
  yearlyFlexibleAmount: number;
  paymentDeadlineDay: number;
  flexibleHalfDeadlineMonth: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Audit Log types
export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetCollection?: string;
  targetId?: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress?: string;
  timestamp: string;
}

export interface AuditLogListData {
  items: AuditLog[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export interface AuditLogDeleteResult {
  deletedCount: number;
}

export interface SyncFailureItem {
  id: string;
  type: 'transfer' | 'cost';
  label: string;
  date: string;
  month?: string;
  category?: string;
  status?: string;
}

export interface SyncFailuresData {
  transfers: SyncFailureItem[];
  costs: SyncFailureItem[];
  total: number;
}

export type ExportScope = 'member' | 'monthly' | 'yearly' | 'range';

// Filter types
export interface TransferFilters {
  status?: TransferStatus;
  month?: number;
  year?: number;
  isFlexible?: boolean;
  page?: number;
  limit?: number;
}

export interface UserFilters {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AuditFilters {
  entity?: string;
  action?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}
