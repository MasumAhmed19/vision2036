'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Lock, LockOpen, CircleDot } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute, ButtonLoader, CardSkeleton } from '@/components/common/LoadingStates';
import { Money } from '@/components/common/Money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { periodsService } from '@/services';
import { getCurrentMonthIso } from '@/lib/policies';

const STATUS_META: Record<string, { label: string; icon: typeof Lock; className: string }> = {
  OPEN: { label: 'Open', icon: CircleDot, className: 'text-pending' },
  REOPENED: { label: 'Reopened', icon: LockOpen, className: 'text-pending' },
  CLOSED: { label: 'Closed', icon: Lock, className: 'text-credit' },
};

export default function PeriodsPage() {
  return (
    <ProtectedRoute allowedRoles={['co_admin', 'admin']}>
      <PeriodsContent />
    </ProtectedRoute>
  );
}

function PeriodsContent() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => getCurrentMonthIso());
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const canClose = user?.role === 'co_admin' || user?.role === 'admin';
  const canReopen = user?.role === 'admin';

  const { data: period, isLoading } = useQuery({
    queryKey: ['period', month],
    queryFn: () => periodsService.getPeriod(month),
  });

  const closeMutation = useMutation({
    mutationFn: () => periodsService.closePeriod(month),
    onSuccess: () => {
      toast.success('Period closed');
      queryClient.invalidateQueries({ queryKey: ['period', month] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to close period'),
  });

  const reopenMutation = useMutation({
    mutationFn: () => periodsService.reopenPeriod(month, reopenReason),
    onSuccess: () => {
      toast.success('Period reopened');
      setReopenOpen(false);
      setReopenReason('');
      queryClient.invalidateQueries({ queryKey: ['period', month] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to reopen period'),
  });

  const meta = period ? STATUS_META[period.status] : null;
  const snapshot = period?.snapshot;

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Close the Month</h1>
        <p className="text-muted-foreground">Freeze a month&apos;s numbers so they never quietly change again.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="month">Accounting month</Label>
        <Input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      {isLoading || !period || !snapshot ? (
        <CardSkeleton />
      ) : (
        <>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {meta && <meta.icon className={`h-4 w-4 ${meta.className}`} />}
                <span className={`text-sm font-semibold ${meta?.className}`}>{meta?.label}</span>
              </div>
              {period.closedAt && (
                <span className="text-xs text-muted-foreground">
                  Closed {new Date(period.closedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {period.reopenReason && (
              <p className="mt-2 text-xs text-muted-foreground">Reopened: {period.reopenReason}</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Row label="Monthly contributions" value={snapshot.contributionsMonthly} />
              <Row label="Flexible contributions" value={snapshot.contributionsFlex} />
              <Row label="Bank interest" value={snapshot.interest} />
              <Row label="Investment returns" value={snapshot.investmentReturns} />
              <Row label="Bank charges" value={-snapshot.bankCharges} />
              <Row label="Operational costs" value={-snapshot.operationalCosts} />
              <Row label="Invested out (net)" value={-snapshot.investedOut} />
              <Row label="Principal back" value={snapshot.investmentPrincipalBack} />
            </div>

            <div className="mt-4 border-t pt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Cash</p>
                <Money value={snapshot.cash} className="text-sm font-semibold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Invested</p>
                <Money value={snapshot.investedAtCost} className="text-sm font-semibold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fund value</p>
                <Money value={snapshot.fundValue} className="text-sm font-semibold" />
              </div>
            </div>

            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>{snapshot.membersPaid} paid</span>
              <span>{snapshot.membersPending} pending</span>
              <span>{snapshot.membersUnpaid} unpaid</span>
            </div>
          </div>

          {canClose && (period.status === 'OPEN' || period.status === 'REOPENED') && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full" disabled={closeMutation.isPending}>
                  {closeMutation.isPending ? <ButtonLoader /> : 'Close this month'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close {month}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This freezes the numbers above permanently. New entries can&apos;t be posted into this month
                    unless it&apos;s reopened first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => closeMutation.mutate()}>Close month</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {canReopen && period.status === 'CLOSED' && (
            <Button variant="outline" className="w-full" onClick={() => setReopenOpen(true)}>
              Reopen this month
            </Button>
          )}

          {!canClose && !canReopen && (
            <p className="text-center text-xs text-muted-foreground">
              Only a Co-Admin or Admin can close or reopen a month.
            </p>
          )}
        </>
      )}

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen {month}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reopen-reason">Reason (required)</Label>
            <Textarea
              id="reopen-reason"
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Why does this closed month need to reopen?"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReopenOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reopenReason.trim() || reopenMutation.isPending}
              onClick={() => reopenMutation.mutate()}
            >
              {reopenMutation.isPending ? <ButtonLoader /> : 'Reopen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Money value={value} className="text-xs font-medium" />
    </div>
  );
}
