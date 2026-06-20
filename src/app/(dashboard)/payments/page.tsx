'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format, isValid } from 'date-fns';
import {
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  FileImage,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/common/EmptyState';
import { CardLoader } from '@/components/common/LoadingStates';
import { cn } from '@/lib/utils';
import { transfersService } from '@/services';
import type { Transfer, TransferStatus } from '@/types';

const STATUS_CONFIG: Record<TransferStatus, { label: string; icon: React.ElementType; className: string }> = {
  PENDING: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-500',
  },
  VERIFIED: {
    label: 'Verified',
    icon: CheckCircle2,
    className: 'bg-green-500/10 text-green-600 dark:text-green-500',
  },
  REJECTED: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-red-500/10 text-red-600 dark:text-red-500',
  },
};

const ITEMS_PER_PAGE = 10;

// Payment type constants
const MONTHLY_AMOUNT = 3000;
const YEARLY_FLEXIBLE_AMOUNT = 14000;

// Generate years from 2024 to current year + 1
const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = 2024; year <= currentYear + 1; year++) {
    years.push(year);
  }
  return years;
};

const YEARS = generateYears();

export default function PaymentsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);

  // Build query params
  const queryParams = new URLSearchParams();
  queryParams.append('page', page.toString());
  queryParams.append('limit', ITEMS_PER_PAGE.toString());
  if (statusFilter !== 'all') queryParams.append('status', statusFilter);
  if (yearFilter !== 'all') queryParams.append('year', yearFilter); // Note: Should probably be mapped appropriately to selectMonth on API level later
  if (typeFilter !== 'all') queryParams.append('paymentType', typeFilter);

  // Fetch transfers
  const { data, isLoading, isError } = useQuery({
    queryKey: ['transfers', 'user', { page, statusFilter, yearFilter, typeFilter }],
    queryFn: () => transfersService.getUserTransfers(queryParams.toString()),
  });

  const transfers = data?.data || [];
  const pagination = data?.meta;

  const handleClearFilters = () => {
    setStatusFilter('all');
    setYearFilter('all');
    setTypeFilter('all');
    setPage(1);
  };

  const hasFilters = statusFilter !== 'all' || yearFilter !== 'all' || typeFilter !== 'all';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Payments</h1>
          <p className="text-muted-foreground">
            View and manage your contribution payments
          </p>
        </div>
        <Button onClick={() => router.push('/payments/submit')}>
          <Plus className="mr-2 h-4 w-4" />
          Submit Payment
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filters:
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32.5">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="VERIFIED">Verified</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setPage(1); }}>
          <SelectTrigger className="w-30">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {YEARS.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-32.5">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <CardLoader key={i} />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Failed to load payments"
          description="Something went wrong while fetching your payments."
          action={
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          }
        />
      ) : transfers.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No payments found' : 'No payments yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters to see more results.'
              : "You haven't submitted any payments yet. Submit your first payment to get started."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            ) : (
              <Button onClick={() => router.push('/payments/submit')}>
                <Plus className="mr-2 h-4 w-4" />
                Submit Payment
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Payments Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {transfers.map((transfer) => (
              <PaymentCard
                key={transfer.id}
                transfer={transfer}
                onView={() => setSelectedTransfer(transfer)}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPage > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPage}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPage}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Transfer Detail Dialog */}
      <TransferDetailDialog
        transfer={selectedTransfer}
        open={!!selectedTransfer}
        onClose={() => setSelectedTransfer(null)}
      />
    </div>
  );
}

// Payment Card Component
function PaymentCard({
  transfer,
  onView,
}: {
  transfer: Transfer;
  onView: () => void;
}) {
  const config = STATUS_CONFIG[transfer.status];
  const StatusIcon = config.icon;

  return (
    <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {transfer.flexAmount > 0 && transfer.monthlyAmount > 0
                ? 'Monthly + Yearly Flex'
                : transfer.flexAmount > 0
                  ? 'Yearly Flex'
                  : 'Monthly'} Payment
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                config.className
              )}
            >
              <StatusIcon className="h-3 w-3" />
              {config.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {format(new Date(transfer.selectMonth + '-01'), 'MMMM yyyy')}
          </p>
        </div>
        <span className="text-lg font-bold">
          Tk. {transfer.totalAmount.toLocaleString()}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Submitted {(() => { const d = new Date(transfer.createdAt); return isValid(d) ? format(d, 'MMM d, yyyy') : 'N/A'; })()}
        </span>
        <Button variant="ghost" size="sm" onClick={onView}>
          <Eye className="mr-1 h-4 w-4" />
          View
        </Button>
      </div>
    </div>
  );
}

// Transfer Detail Dialog
function TransferDetailDialog({
  transfer,
  open,
  onClose,
}: {
  transfer: Transfer | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!transfer) return null;

  const config = STATUS_CONFIG[transfer.status];
  const StatusIcon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Payment Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                config.className
              )}
            >
              <StatusIcon className="h-4 w-4" />
              {config.label}
            </span>
          </div>

          {/* Details Grid */}
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">
                {transfer.flexAmount > 0 && transfer.monthlyAmount > 0
                  ? 'Monthly + Yearly Flex'
                  : transfer.flexAmount > 0
                    ? 'Yearly Flex'
                    : 'Monthly'} Payment
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Period</span>
              <span className="font-medium">
                {format(new Date(transfer.selectMonth + '-01'), 'MMMM yyyy')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">Tk. {transfer.totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transfer Date</span>
              <span className="font-medium">
                {(() => { const d = new Date(transfer.transferDate || transfer.createdAt); return isValid(d) ? format(d, 'PPP') : 'N/A'; })()}
              </span>
            </div>
            {transfer.transferChannel && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transfer Channel</span>
                <span className="font-medium font-mono text-xs">
                  {transfer.transferChannel}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Submitted</span>
              <span className="font-medium">
                {(() => { const d = new Date(transfer.createdAt); return isValid(d) ? format(d, 'PPP') : 'N/A'; })()}
              </span>
            </div>
          </div>

          {/* Rejection Reason */}
          {transfer.status === 'REJECTED' && (transfer.rejectionReason || transfer.remarks) && (
            <div className="rounded-lg bg-red-500/10 p-3">
              <p className="text-sm font-medium text-red-600 dark:text-red-500">
                Rejection Reason
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {transfer.rejectionReason || transfer.remarks}
              </p>
            </div>
          )}

          {/* Remarks */}
          {transfer.remarks && transfer.status !== 'REJECTED' && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm font-medium">Remarks</p>
              <p className="mt-1 text-sm text-muted-foreground">{transfer.remarks}</p>
            </div>
          )}

          {/* Proof Image */}
          {transfer.paymentProofUrl && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Payment Proof</p>
              <a
                href={transfer.paymentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {transfer.paymentProofUrl.toLowerCase().endsWith('.pdf') ? (
                  <div className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted">
                    <FileImage className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm">View PDF Document</span>
                  </div>
                ) : (
                  <img
                    src={transfer.paymentProofUrl}
                    alt="Payment proof"
                    className="rounded-lg border max-h-48 w-full object-contain"
                  />
                )}
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
