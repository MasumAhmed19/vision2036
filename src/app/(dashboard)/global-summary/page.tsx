'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Globe,
  Users,
  Wallet,
  Receipt,
  Landmark,
  Percent,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Money } from '@/components/common/Money';
import { UserAvatar } from '@/components/common/UserAvatar';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingStates';
import { cn } from '@/lib/utils';
import { summariesService } from '@/services';
import type { GlobalSummary, GlobalSummaryUserSummary, GlobalSummaryCostItem } from '@/types';

const FIRST_YEAR = 2024;

type ViewMode = 'year' | 'all-time';

const CATEGORY_LABELS: Record<string, string> = {
  bank_charge: 'Bank charge',
  operational: 'Operational',
  investment: 'Investment',
  other: 'Other',
};

export default function GlobalSummaryPage() {
  const currentYear = new Date().getFullYear();
  const [mode, setMode] = useState<ViewMode>('year');
  const [year, setYear] = useState(currentYear);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [showCosts, setShowCosts] = useState(false);

  const { data: summary, isLoading, isError, refetch } = useQuery<GlobalSummary>({
    queryKey: mode === 'all-time' ? ['globalSummary', 'all-time'] : ['globalSummary', year],
    queryFn: () => (mode === 'all-time' ? summariesService.getGlobalSummaryAllTime() : summariesService.getGlobalSummary(year)),
  });

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const collectionPct = summary && summary.totals.expected > 0
    ? Math.min(Math.round((summary.totals.collected / summary.totals.expected) * 100), 100)
    : 0;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Global Summary</h1>
          <p className="text-muted-foreground">Every member, every month, one number.</p>
        </div>
        {mode === 'year' && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              disabled={year <= FIRST_YEAR}
              aria-label="Previous year"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-12 text-center text-sm font-semibold">{year}</span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear}
              aria-label="Next year"
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as ViewMode)}>
        <TabsList>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="all-time">All Time</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
          <CardSkeleton />
        </div>
      ) : isError || !summary ? (
        <EmptyState
          icon={<Globe className="h-12 w-12" />}
          title="Failed to load summary"
          description="Something went wrong while fetching the global summary."
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : (
        <>
          {/* Net balance hero — mirrors Home's "Fund value" card */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {mode === 'all-time' ? 'All-time earnings' : `Net balance · ${summary.periodLabel}`}
            </p>
            <Money value={summary.totals.netAmount} className="text-3xl font-bold" />

            {mode === 'year' ? (
              <>
                <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-primary" style={{ width: `${collectionPct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Collected <Money value={summary.totals.collected} className="text-xs" />
                  </span>
                  <span>
                    {collectionPct}% of <Money value={summary.totals.expected} className="text-xs" />
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Collected <Money value={summary.totals.collected} className="text-xs" /> since {summary.periodLabel.replace(' (All Time)', '')}
              </p>
            )}
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={<Users className="h-4 w-4" />} label="Members" value={summary.config.totalMembers} />
            {mode === 'year' && (
              <StatTile
                icon={<Wallet className="h-4 w-4" />}
                label="Remaining"
                value={<Money value={summary.totals.remaining} kind="pending" className="text-lg font-semibold" />}
              />
            )}
            <StatTile
              icon={<Receipt className="h-4 w-4" />}
              label="Operational costs"
              value={<Money value={summary.totals.operationalCosts} direction="DEBIT" className="text-lg font-semibold" />}
            />
            <StatTile
              icon={<Landmark className="h-4 w-4" />}
              label="Invested"
              value={<Money value={summary.totals.investmentAmount} kind="invest" className="text-lg font-semibold" />}
            />
            <StatTile
              icon={<Percent className="h-4 w-4" />}
              label="Bank interest"
              value={<Money value={summary.totals.interest} kind="interest" className="text-lg font-semibold" />}
            />
            <StatTile
              icon={<TrendingUp className="h-4 w-4" />}
              label="Investment returns"
              value={<Money value={summary.totals.investmentReturns} kind="invest" className="text-lg font-semibold" />}
            />
          </div>

          {/* Collection breakdown — the year view frames this against a
              target (with a % bar); all-time has no fixed target for an
              open-ended span, so it's just the two raw totals. */}
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {mode === 'year' ? 'Collection breakdown' : 'Collected'}
            </h2>
            {mode === 'year' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <BreakdownBlock
                  label="Monthly"
                  collected={summary.breakdown.monthlyCollected}
                  expected={summary.breakdown.monthlyExpected}
                />
                <BreakdownBlock
                  label="Flexible"
                  collected={summary.breakdown.flexibleCollected}
                  expected={summary.breakdown.flexibleExpected}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <Money value={summary.breakdown.monthlyCollected} className="text-lg font-semibold" />
                  <p className="text-xs text-muted-foreground">Monthly</p>
                </div>
                <div>
                  <Money value={summary.breakdown.flexibleCollected} className="text-lg font-semibold" />
                  <p className="text-xs text-muted-foreground">Flexible</p>
                </div>
              </div>
            )}
          </div>

          {/* Costs & investments — collapsible list, not a table (doesn't
              reflow well on narrow screens even with overflow-x-auto). */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCosts((v) => !v)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Costs & investments</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.costItems.length} entr{summary.costItems.length === 1 ? 'y' : 'ies'} ·{' '}
                    <Money value={summary.totals.costs} className="text-xs" />
                  </p>
                </div>
              </div>
              {showCosts ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {showCosts && (
              <div className="border-t">
                {summary.costItems.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">No costs recorded for {summary.periodLabel}.</p>
                ) : (
                  <div className="divide-y">
                    {summary.costItems.map((item) => (
                      <CostRow key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Member contributions */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Member contributions
            </h2>
            {summary.userSummaries.length > 0 ? (
              <div className="divide-y rounded-xl border bg-card">
                {summary.userSummaries.map((u) => (
                  <MemberRow
                    key={u.userId}
                    user={u}
                    mode={mode}
                    expanded={expandedUsers.has(u.userId)}
                    onToggle={() => toggleUser(u.userId)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={<Users className="h-10 w-10" />} title="No member data available" />
            )}
          </div>

          {/* Policy */}
          <div className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {mode === 'year' ? `Policy · ${summary.periodLabel}` : 'Policy'}
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <Money value={summary.config.monthlyAmount} className="text-sm font-semibold" />
                <p className="text-xs text-muted-foreground">per month</p>
              </div>
              <div>
                <Money value={summary.config.yearlyFlexibleAmount} className="text-sm font-semibold" />
                <p className="text-xs text-muted-foreground">yearly flex</p>
              </div>
              <div>
                <p className="text-sm font-semibold">{summary.config.deadlineDay}th</p>
                <p className="text-xs text-muted-foreground">deadline</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

function BreakdownBlock({ label, collected, expected }: { label: string; collected: number; expected: number }) {
  const pct = expected > 0 ? Math.min(Math.round((collected / expected) * 100), 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <Money value={collected} className="text-xs" />
        <span className="flex items-center gap-1">
          of <Money value={expected} className="text-xs" />
        </span>
      </div>
    </div>
  );
}

function CostRow({ item }: { item: GlobalSummaryCostItem }) {
  const isInvestment = item.category === 'investment';
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.reason}</p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(item.date), 'd MMM yyyy')} · {CATEGORY_LABELS[item.category] ?? item.category}
        </p>
      </div>
      <Money
        value={item.amount}
        kind={isInvestment ? 'invest' : undefined}
        direction={isInvestment ? undefined : 'DEBIT'}
        className="shrink-0 text-sm font-semibold"
      />
    </div>
  );
}

function MemberRow({
  user,
  mode,
  expanded,
  onToggle,
}: {
  user: GlobalSummaryUserSummary;
  mode: ViewMode;
  expanded: boolean;
  onToggle: () => void;
}) {
  const totalExpected = user.totalPaid + user.totalRemaining;
  const pct = Math.min(user.completionPercentage ?? 0, 100);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-accent"
      >
        <UserAvatar name={user.userName} avatar={user.userAvatar} className="h-11 w-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.userName ?? 'Unknown'}</p>
          {mode === 'year' ? (
            <>
              <Progress value={pct} className="mt-2 h-2" />
              <p className="mt-1 text-xs text-muted-foreground">
                <Money value={user.totalPaid} className="text-xs" /> of{' '}
                <Money value={totalExpected} className="text-xs" /> · {pct}%
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm">
              <Money value={user.totalPaid} className="text-sm font-semibold" /> contributed
            </p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className={cn('grid grid-cols-2 gap-4 border-t bg-muted/30 px-4 py-3')}>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Monthly</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Paid</span>
              <Money value={user.monthlyPaid} direction="CREDIT" className="text-sm" />
            </div>
            {mode === 'year' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Remaining</span>
                <Money value={user.monthlyRemaining} kind="pending" className="text-sm" />
              </div>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Flexible</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Paid</span>
              <Money value={user.flexiblePaid} direction="CREDIT" className="text-sm" />
            </div>
            {mode === 'year' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Remaining</span>
                <Money value={user.flexibleRemaining} kind="pending" className="text-sm" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
