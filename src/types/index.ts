// User types
export type UserRole = 'member' | 'moderator' | 'admin';

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
  status: 'paid' | 'partial' | 'unpaid';
  amountSubmitted: number;
  amountVerified: number;
}

export interface AdminDashboardFlexProgress {
  userId: string;
  userName: string;
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

// Statement types
export interface Statement {
  id: string;
  month: number;
  year: number;
  fileUrl: string;
  description: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
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

export type ExportScope = 'member' | 'monthly' | 'yearly';

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
