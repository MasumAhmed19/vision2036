'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isValid } from 'date-fns';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  FileImage,
  User,
  Calendar,
  Wallet,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/common/EmptyState';
import { CardLoader, ButtonLoader, ProtectedRoute } from '@/components/common/LoadingStates';
import { cn } from '@/lib/utils';
import { transfersService } from '@/services';
import type { Transfer } from '@/types';

export default function PendingPaymentsPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'admin']}>
      <PendingPaymentsContent />
    </ProtectedRoute>
  );
}

function PendingPaymentsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [actionType, setActionType] = useState<'verify' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch pending transfers
  const { data, isLoading, isError } = useQuery({
    queryKey: ['transfers', 'pending'],
    queryFn: () => transfersService.getAllTransfers('status=PENDING&limit=100'),
  });

  const pendingTransfers = data?.data || [];

  // Verify mutation
  const verifyMutation = useMutation({
    mutationFn: (id: string) => transfersService.verifyTransfer(id),
    onSuccess: () => {
      toast.success('Payment verified successfully');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['summaries'] });
      closeDialog();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to verify payment';
      toast.error('Verification failed', { description: message });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      transfersService.rejectTransfer(id, reason),
    onSuccess: () => {
      toast.success('Payment rejected');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      closeDialog();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to reject payment';
      toast.error('Rejection failed', { description: message });
    },
  });

  const closeDialog = () => {
    setSelectedTransfer(null);
    setActionType(null);
    setRejectReason('');
  };

  const handleVerify = () => {
    if (selectedTransfer) {
      verifyMutation.mutate(selectedTransfer.id);
    }
  };

  const handleReject = () => {
    if (selectedTransfer && rejectReason.trim()) {
      rejectMutation.mutate({ id: selectedTransfer.id, reason: rejectReason });
    }
  };

  const isPending = verifyMutation.isPending || rejectMutation.isPending;

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
        <h1 className="text-2xl font-bold tracking-tight">Pending Payments</h1>
        <p className="text-muted-foreground">
          Review and verify member payment submissions
        </p>
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
          description="Something went wrong while fetching pending payments."
          action={
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          }
        />
      ) : pendingTransfers.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-12 w-12" />}
          title="All caught up!"
          description="There are no pending payments to review."
          action={
            <Button variant="outline" onClick={() => router.push('/admin/payments')}>
              View All Payments
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pendingTransfers.map((transfer) => (
            <PendingPaymentCard
              key={transfer.id}
              transfer={transfer}
              onView={() => setSelectedTransfer(transfer)}
              onVerify={() => {
                setSelectedTransfer(transfer);
                setActionType('verify');
              }}
              onReject={() => {
                setSelectedTransfer(transfer);
                setActionType('reject');
              }}
            />
          ))}
        </div>
      )}

      {/* View Transfer Dialog */}
      <Dialog open={!!selectedTransfer && !actionType} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          {selectedTransfer && (
            <TransferDetails
              transfer={selectedTransfer}
              onVerify={() => setActionType('verify')}
              onReject={() => setActionType('reject')}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Verify Confirmation Dialog */}
      <Dialog open={actionType === 'verify'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to verify this payment? This action will mark
              the contribution as received and update the member&apos;s summary.
            </DialogDescription>
          </DialogHeader>
          {selectedTransfer && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="font-medium">{selectedTransfer.user?.name || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground">
                {selectedTransfer.flexAmount > 0 && selectedTransfer.monthlyAmount > 0
                  ? 'Monthly + Yearly Flex'
                  : selectedTransfer.flexAmount > 0
                    ? 'Yearly Flex'
                    : 'Monthly'} Payment - Tk.{' '}
                {selectedTransfer.totalAmount.toLocaleString()}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleVerify} disabled={isPending}>
              {verifyMutation.isPending ? <ButtonLoader /> : 'Verify Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={actionType === 'reject'} onOpenChange={closeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this payment. The member will
              be notified.
            </DialogDescription>
          </DialogHeader>
          {selectedTransfer && (
            <>
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="font-medium">{selectedTransfer.user?.name || 'Unknown'}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedTransfer.flexAmount > 0 && selectedTransfer.monthlyAmount > 0
                    ? 'Monthly + Yearly Flex'
                    : selectedTransfer.flexAmount > 0
                      ? 'Yearly Flex'
                      : 'Monthly'} Payment - Tk.{' '}
                  {selectedTransfer.totalAmount.toLocaleString()}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rejectReason">Rejection Reason</Label>
                <Textarea
                  id="rejectReason"
                  placeholder="Enter the reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? <ButtonLoader /> : 'Reject Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Pending Payment Card
function PendingPaymentCard({
  transfer,
  onView,
  onVerify,
  onReject,
}: {
  transfer: Transfer;
  onView: () => void;
  onVerify: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-muted p-2">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">{transfer.user?.name || 'Unknown Member'}</p>
            <p className="text-sm text-muted-foreground">
              {transfer.user?.email || 'No email'}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600 dark:text-yellow-500">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          {format(new Date(transfer.selectMonth + '-01'), 'MMMM yyyy')}
        </div>
        <div className="flex items-center gap-2 font-medium">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          Tk. {transfer.totalAmount.toLocaleString()}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onView} className="flex-1">
          <Eye className="mr-1 h-4 w-4" />
          View
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          className="text-destructive hover:text-destructive"
        >
          <XCircle className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={onVerify}>
          <CheckCircle2 className="mr-1 h-4 w-4" />
          Verify
        </Button>
      </div>
    </div>
  );
}

// Transfer Details Component
function TransferDetails({
  transfer,
  onVerify,
  onReject,
}: {
  transfer: Transfer;
  onVerify: () => void;
  onReject: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Member Info */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <div className="rounded-full bg-muted p-2.5">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">{transfer.user?.name || 'Unknown'}</p>
          <p className="text-sm text-muted-foreground">{transfer.user?.email}</p>
        </div>
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
      </div>

      {/* Notes */}
      {transfer.remarks && (
        <div className="rounded-lg bg-muted p-3">
          <p className="text-sm font-medium">Remarks</p>
          <p className="mt-1 text-sm text-muted-foreground">{transfer.remarks}</p>
        </div>
      )}

      {/* Proof */}
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

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={onReject}
          className="flex-1 text-destructive hover:text-destructive"
        >
          <XCircle className="mr-2 h-4 w-4" />
          Reject
        </Button>
        <Button onClick={onVerify} className="flex-1">
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Verify
        </Button>
      </div>
    </div>
  );
}
