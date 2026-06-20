'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isValid } from 'date-fns';
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileImage,
  User,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

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
import { CardLoader, ProtectedRoute } from '@/components/common/LoadingStates';
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

const ITEMS_PER_PAGE = 12;

export default function AllPaymentsPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'admin']}>
      <AllPaymentsContent />
    </ProtectedRoute>
  );
}

function AllPaymentsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [memberFilter, setMemberFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);

  // Build query params
  const queryParams = new URLSearchParams();
  queryParams.append('page', page.toString());
  queryParams.append('limit', ITEMS_PER_PAGE.toString());
  if (memberFilter.trim()) queryParams.append('member', memberFilter.trim());
  if (statusFilter !== 'all') queryParams.append('status', statusFilter);
  if (monthFilter) queryParams.append('month', monthFilter);
  if (channelFilter !== 'all') queryParams.append('channel', channelFilter);
  if (typeFilter !== 'all') queryParams.append('paymentType', typeFilter);

  // Fetch transfers
  const { data, isLoading, isError } = useQuery({
    queryKey: ['transfers', 'all', { page, memberFilter, statusFilter, monthFilter, channelFilter, typeFilter }],
    queryFn: () => transfersService.getAllTransfers(queryParams.toString()),
  });

  const transfers = data?.data || [];
  const pagination = data?.meta;

  const retrySyncMutation = useMutation({
    mutationFn: (id: string) => transfersService.retrySync(id),
    onSuccess: () => {
      toast.success('Transfer pushed to Google Sheets');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'admin'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to push transfer to Google Sheets');
    },
  });

  const handleClearFilters = () => {
    setMemberFilter('');
    setStatusFilter('all');
    setMonthFilter('');
    setChannelFilter('all');
    setTypeFilter('all');
    setPage(1);
  };

  const hasFilters = !!memberFilter.trim() || statusFilter !== 'all' || !!monthFilter || channelFilter !== 'all' || typeFilter !== 'all';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/admin')}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Admin Dashboard
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">All Payments</h1>
        <p className="text-muted-foreground">
          Complete payment history for all members
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filters:
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={memberFilter}
            onChange={(e) => {
              setMemberFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Search member"
            className="w-55 pl-9"
          />
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

        <Input
          type="month"
          value={monthFilter}
          onChange={(e) => {
            setMonthFilter(e.target.value);
            setPage(1);
          }}
          className="w-42.5"
        />

        <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setPage(1); }}>
          <SelectTrigger className="w-37.5">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="BANK_TRANSFER">Bank</SelectItem>
            <SelectItem value="BKASH">bKash</SelectItem>
            <SelectItem value="NAGAD">Nagad</SelectItem>
            <SelectItem value="ROCKET">Rocket</SelectItem>
            <SelectItem value="CASH">Cash</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
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

        {pagination && (
          <span className="ml-auto text-sm text-muted-foreground">
            {pagination.total} payment{pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <CardLoader key={i} />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Failed to load payments"
          description="Something went wrong while fetching payments."
          action={
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          }
        />
      ) : transfers.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No payments found' : 'No payments yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters to see more results.'
              : 'No payment records found in the system.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Payments Table/Grid */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50 text-sm">
                <tr>
                  <th className="text-left p-3 font-medium">Member</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Period</th>
                  <th className="text-left p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Date</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Sheet Sync</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transfers.map((transfer) => (
                  <PaymentRow
                    key={transfer.id}
                    transfer={transfer}
                    onView={() => setSelectedTransfer(transfer)}
                    onRetrySync={() => retrySyncMutation.mutate(transfer.id)}
                    isRetrying={retrySyncMutation.isPending && retrySyncMutation.variables === transfer.id}
                  />
                ))}
              </tbody>
            </table>
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

// Payment Row Component
function PaymentRow({
  transfer,
  onView,
  onRetrySync,
  isRetrying,
}: {
  transfer: Transfer;
  onView: () => void;
  onRetrySync: () => void;
  isRetrying: boolean;
}) {
  const config = STATUS_CONFIG[transfer.status];
  const StatusIcon = config.icon;

  return (
    <tr className="hover:bg-muted/50">
      <td className="p-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-muted p-1.5 hidden sm:block">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-sm">{transfer.user?.name || 'Unknown'}</p>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {transfer.user?.email}
            </p>
          </div>
        </div>
      </td>
      <td className="p-3 hidden sm:table-cell">
        <div className="text-sm">
          <p>
            {transfer.flexAmount > 0 && transfer.monthlyAmount > 0
              ? 'Monthly + Yearly Flex'
              : transfer.flexAmount > 0
                ? 'Yearly Flex'
                : 'Monthly'}
          </p>
          <p className="text-muted-foreground">
            {format(new Date(transfer.selectMonth + '-01'), 'MMM yyyy')}
          </p>
        </div>
      </td>
      <td className="p-3">
        <span className="font-medium">Tk. {transfer.totalAmount.toLocaleString()}</span>
      </td>
      <td className="p-3 hidden md:table-cell text-sm text-muted-foreground">
        {(() => { const d = new Date(transfer.createdAt); return isValid(d) ? format(d, 'MMM d, yyyy') : 'N/A'; })()}
      </td>
      <td className="p-3">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            config.className
          )}
        >
          <StatusIcon className="h-3 w-3" />
          {config.label}
        </span>
      </td>
      <td className="p-3 hidden lg:table-cell">
        {transfer.status === 'VERIFIED' ? (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                transfer.syncedToSheet
                  ? 'bg-green-500/10 text-green-600 dark:text-green-500'
                  : 'bg-red-500/10 text-red-600 dark:text-red-500'
              )}
            >
              {transfer.syncedToSheet ? 'Synced' : 'Sync failed'}
            </span>
            {!transfer.syncedToSheet && (
              <Button variant="outline" size="sm" onClick={onRetrySync} disabled={isRetrying}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Push
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Available after verification</span>
        )}
      </td>
      <td className="p-3 text-right">
        <div className="flex justify-end gap-2">
          {!transfer.syncedToSheet && transfer.status === 'VERIFIED' && (
            <Button variant="ghost" size="sm" onClick={onRetrySync} disabled={isRetrying} className="lg:hidden">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onView}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
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
          {/* Member Info */}
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="rounded-full bg-muted p-2">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">{transfer.user?.name || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground">{transfer.user?.email}</p>
            </div>
          </div>

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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Submitted</span>
              <span className="font-medium">
                {(() => { const d = new Date(transfer.createdAt); return isValid(d) ? format(d, 'PPP') : 'N/A'; })()}
              </span>
            </div>
            {transfer.verifiedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Verified</span>
                <span className="font-medium">
                  {format(new Date(transfer.verifiedAt), 'PPP')}
                </span>
              </div>
            )}
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

          {/* Notes */}
          {transfer.remarks && (
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
