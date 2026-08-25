'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { ClipboardCheck, Check, X, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute, ButtonLoader } from '@/components/common/LoadingStates';
import { EmptyState } from '@/components/common/EmptyState';
import { Money } from '@/components/common/Money';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { entriesService, transfersService } from '@/services';
import type { LedgerEntry } from '@/types';

export default function ApprovalsPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'co_admin', 'admin']}>
      <ApprovalsContent />
    </ProtectedRoute>
  );
}

function ApprovalsContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<LedgerEntry | null>(null);
  const [reason, setReason] = useState('');

  const { data: pendingTransfers } = useQuery({
    queryKey: ['transfers', 'pending'],
    queryFn: () => transfersService.getAllTransfers('status=PENDING&limit=5'),
  });

  const { data: pendingEntries, isLoading } = useQuery({
    queryKey: ['entries', 'pending-list'],
    queryFn: () => entriesService.getEntries('status=PENDING&limit=50'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => entriesService.approveEntry(id),
    onSuccess: (entry) => {
      toast.success(entry.status === 'POSTED' ? 'Entry posted' : 'Approval recorded');
      queryClient.invalidateQueries({ queryKey: ['entries'] });
      queryClient.invalidateQueries({ queryKey: ['fund'] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => entriesService.rejectEntry(id, reason),
    onSuccess: () => {
      toast.success('Entry rejected');
      setRejectTarget(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to reject'),
  });

  const entries = pendingEntries?.data || [];
  const transferCount = pendingTransfers?.meta.total || 0;

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Needs Review</h1>
        <p className="text-muted-foreground">Payments and fund entries waiting on a second pair of eyes.</p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Pending Payments</h3>
            <p className="text-sm text-muted-foreground">{transferCount} submission{transferCount === 1 ? '' : 's'} awaiting verification</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/payments/pending">
              Review <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b p-4">
          <h3 className="font-semibold">Pending Ledger Entries</h3>
          <p className="text-sm text-muted-foreground">Bank charges, interest, investments, and corrections a Co-Admin posted.</p>
        </div>

        {isLoading ? null : entries.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-10 w-10" />}
            title="Nothing pending"
            description="Posted entries that need approval will show up here."
          />
        ) : (
          <div className="divide-y">
            {entries.map((entry) => {
              const isOwn = entry.createdBy === user?.id;
              const alreadyApproved = entry.approvals.some((a) => a.by === user?.id);
              return (
                <div key={entry.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{entry.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.type.replaceAll('_', ' ')} · {format(new Date(entry.valueDate), 'd MMM yyyy')} ·{' '}
                        {entry.approvals.length} of {entry.requiredApprovals} approved
                      </p>
                    </div>
                    <Money value={entry.amount} direction={entry.direction} className="shrink-0 font-semibold" />
                  </div>

                  {isOwn ? (
                    <p className="mt-2 text-xs text-pending">You posted this — someone else needs to approve it.</p>
                  ) : alreadyApproved ? (
                    <p className="mt-2 text-xs text-muted-foreground">You already approved this.</p>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(entry.id)}
                        disabled={approveMutation.isPending}
                      >
                        {approveMutation.isPending ? <ButtonLoader /> : <Check className="mr-1 h-4 w-4" />}
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejectTarget(entry)}>
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject entry</DialogTitle>
            <DialogDescription>{rejectTarget?.title} — a reason is required.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being rejected?"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 5 || rejectMutation.isPending}
              onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget.id, reason })}
            >
              {rejectMutation.isPending ? <ButtonLoader /> : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
