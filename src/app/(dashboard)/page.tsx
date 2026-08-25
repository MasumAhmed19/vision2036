'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ClipboardCheck, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingApprovalsCount } from '@/hooks/usePendingApprovals';
import { Money } from '@/components/common/Money';
import { GroupBoard } from '@/components/common/GroupBoard';
import { EntryRow, type EntryRowData } from '@/components/common/EntryRow';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/common/LoadingStates';
import { dashboardService, entriesService, membersService } from '@/services';
import type { LedgerEntry, LedgerEntryType } from '@/types';

const TARGET_YEAR = 2036;
const START_YEAR = 2026; // the fund's first year, per newDesign.md's own worked example
const INVEST_TYPES: LedgerEntryType[] = ['INVESTMENT_OUT', 'INVESTMENT_RETURN', 'INVESTMENT_PRINCIPAL_BACK'];

function entryKind(entry: LedgerEntry): EntryRowData['kind'] {
  if (INVEST_TYPES.includes(entry.type)) return 'invest';
  if (entry.type === 'INTEREST_BANK') return 'interest';
  return 'default';
}

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const pendingCount = usePendingApprovalsCount();
  const canApprove = !!user && ['admin', 'moderator', 'co_admin'].includes(user.role);
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const { data: fundPosition, isLoading: fundLoading } = useQuery({
    queryKey: ['fund', 'position'],
    queryFn: () => entriesService.getFundPosition(),
  });

  const { data: memberDashboard } = useQuery({
    queryKey: ['dashboard', 'member'],
    queryFn: () => dashboardService.getMemberDashboard(),
    enabled: !!user,
  });

  const { data: groupStatus, isLoading: groupLoading } = useQuery({
    queryKey: ['dashboard', 'group-status', currentPeriod],
    queryFn: () => entriesService.getGroupStatus(currentPeriod),
  });

  const { data: recentEntries } = useQuery({
    queryKey: ['entries', 'recent'],
    queryFn: () => entriesService.getEntries('limit=6'),
  });

  const { data: members } = useQuery({
    queryKey: ['members'],
    queryFn: () => membersService.getMembers(),
    staleTime: 5 * 60 * 1000,
  });
  const memberMap = useMemo(() => new Map((members || []).map((m) => [m.id, m])), [members]);

  const yearsElapsed = new Date().getFullYear() - START_YEAR;
  const totalYears = TARGET_YEAR - START_YEAR;
  const yearProgressPct = totalYears > 0 ? Math.min(Math.round((yearsElapsed / totalYears) * 100), 100) : 0;

  if (isLoading || !user) return <CardSkeleton />;

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vision 2036</h1>
        <p className="text-muted-foreground">Welcome back, {user.name.split(' ')[0]}.</p>
      </div>

      {/* Fund value hero */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Fund value</p>
        {fundLoading ? (
          <div className="mt-1 h-9 w-40 animate-pulse rounded bg-muted" />
        ) : (
          <Money value={fundPosition?.fundValue ?? 0} className="text-3xl font-bold" />
        )}

        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary" style={{ width: `${yearProgressPct}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Year {Math.max(yearsElapsed, 0) + 1} of {totalYears} · targeting {TARGET_YEAR}
        </p>
      </div>

      {/* Co-Admin/Admin approvals banner */}
      {canApprove && pendingCount > 0 && (
        <Link
          href="/approvals"
          className="flex items-center justify-between rounded-xl border border-pending/40 bg-pending/5 p-4"
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-pending" />
            <div>
              <p className="font-medium">{pendingCount} thing{pendingCount === 1 ? '' : 's'} need you</p>
              <p className="text-xs text-muted-foreground">Payments and fund entries waiting on review</p>
            </div>
          </div>
          <Button size="sm" variant="outline">
            Review
          </Button>
        </Link>
      )}

      {/* This month */}
      {memberDashboard && memberDashboard.monthlyStatus.status !== 'paid' && (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">You haven&apos;t paid this month</p>
          <p className="text-sm text-muted-foreground">
            <Money value={memberDashboard.monthlyStatus.remainingAmount} direction="DEBIT" showSign={false} /> due by
            day {memberDashboard.monthlyStatus.deadlineDay}
          </p>
          <Button asChild className="mt-3 w-full sm:w-auto">
            <Link href="/payments/submit">
              <Plus className="mr-1 h-4 w-4" /> Pay now
            </Link>
          </Button>
        </div>
      )}

      {/* The Group */}
      <div className="rounded-xl border bg-card p-4">
        {groupLoading ? (
          <div className="h-20 animate-pulse rounded bg-muted" />
        ) : (
          <GroupBoard members={groupStatus?.members || []} />
        )}
      </div>

      {/* Activity */}
      <div className="rounded-xl border bg-card px-3">
        <div className="flex items-center justify-between border-b py-3 px-1">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Activity</h3>
          <Link href="/ledger" className="text-xs text-primary hover:underline">
            See all
          </Link>
        </div>
        {(recentEntries?.data || []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          recentEntries!.data.map((entry) => {
            const member = entry.memberId ? memberMap.get(entry.memberId) : undefined;
            const row: EntryRowData = {
              id: entry.id,
              title: entry.title,
              subtitle: format(new Date(entry.valueDate), 'd MMM'),
              amount: entry.amount,
              direction: entry.direction,
              kind: entryKind(entry),
              reversed: entry.status === 'REVERSED',
              memberName: member?.name,
              memberAvatar: member?.avatar,
              statusLabel: entry.status === 'PENDING' ? 'pending' : undefined,
            };
            return <EntryRow key={entry.id} entry={row} />;
          })
        )}
      </div>
    </div>
  );
}
