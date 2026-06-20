'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Globe,
  Users,
  TrendingUp,
  Wallet,
  DollarSign,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MinusCircle,
  Landmark,
  Eye,
  EyeOff,
  Receipt,
} from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/EmptyState';
import { CardLoader } from '@/components/common/LoadingStates';
import { cn } from '@/lib/utils';
import { summariesService } from '@/services';
import type { GlobalSummary, GlobalSummaryUserSummary } from '@/types';

// Generate years from 2024 to current year
const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = 2024; year <= currentYear; year++) {
    years.push(year);
  }
  return years.reverse();
};

const YEARS = generateYears();

const CATEGORY_LABELS: Record<string, string> = {
  bank_charge: 'Bank Charge',
  operational: 'Operational',
  investment: 'Investment',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  bank_charge: 'bg-orange-500/10 text-orange-600 border-orange-200',
  operational: 'bg-blue-500/10 text-blue-600 border-blue-200',
  investment: 'bg-emerald-500/10 text-emerald-600 border-emerald-200',
  other: 'bg-muted text-muted-foreground',
};

export default function GlobalSummaryPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [showCosts, setShowCosts] = useState(false);

  const { data: summary, isLoading, isError } = useQuery<GlobalSummary>({
    queryKey: ['globalSummary', year],
    queryFn: () => summariesService.getGlobalSummary(year),
  });

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const collectionProgress = summary?.totals?.expected
    ? (summary.totals.collected / summary.totals.expected) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Global Summary</h1>
          <p className="text-muted-foreground">
            Overview of all member contributions for {year}
          </p>
        </div>
        <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => <CardLoader key={i} />)}
          </div>
          <CardLoader />
        </div>
      ) : isError || !summary ? (
        <EmptyState
          icon={<Globe className="h-12 w-12" />}
          title="Failed to load summary"
          description="Something went wrong while fetching the global summary."
          action={<Button onClick={() => window.location.reload()}>Try Again</Button>}
        />
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Users className="h-5 w-5" />} label="Total Members" value={summary.config.totalMembers} />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Expected Collection" value={`Tk. ${summary.totals.expected.toLocaleString()}`} />
            <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Collected" value={`Tk. ${summary.totals.collected.toLocaleString()}`} variant="success" />
            <StatCard icon={<Wallet className="h-5 w-5" />} label="Remaining" value={`Tk. ${summary.totals.remaining.toLocaleString()}`} variant="warning" />
          </div>

          {/* Collection Progress */}
          {/* <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">Collection Progress</h2>
                <p className="text-sm text-muted-foreground">
                  {collectionProgress.toFixed(1)}% of expected amount collected
                </p>
              </div>
              <p className="text-2xl font-bold">
                Tk. {summary.totals.remaining.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground ml-2">remaining</span>
              </p>
            </div>
            <Progress value={collectionProgress} className="h-3" />
            <div className="flex justify-between mt-2 text-sm text-muted-foreground">
              <span>Tk. 0</span>
              <span>Tk. {summary.totals.expected.toLocaleString()}</span>
            </div>
          </div> */}

          {/* Balance Breakdown — 3 clear cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Total Balance (after operational costs) */}
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Total Balance</p>
                  <p className="text-xs text-muted-foreground">After operational costs</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-primary">
                Tk. {summary.totals.netAmount.toLocaleString()}
              </p>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Collected</span>
                  <span className="text-green-600 font-medium">+Tk. {summary.totals.collected.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bank charges & costs</span>
                  <span className="text-red-500 font-medium">-Tk. {summary.totals.operationalCosts.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Investment */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Landmark className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Investment Deployed</p>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70">Capital still in fund</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                Tk. {summary.totals.investmentAmount.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-emerald-600/70 dark:text-emerald-500/70">
                Investment is not deducted from balance — it is capital deployed by the group, still part of the fund.
              </p>
            </div>

            {/* Bank Charges only */}
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <MinusCircle className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Operational Costs</p>
                  <p className="text-xs text-muted-foreground">Bank charges + misc</p>
                </div>
              </div>
              <p className="text-2xl font-bold text-orange-600">
                Tk. {summary.totals.operationalCosts.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                These reduce the net balance. Includes bank charges, operational, and other costs.
              </p>
            </div>
          </div>

          {/* Breakdown Summary */}
          <div className="rounded-lg border bg-card p-6">
            <h2 className="font-semibold mb-4">Collection Breakdown</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Monthly Contributions</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Expected</span>
                    <span className="font-medium">Tk. {summary.breakdown.monthlyExpected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Collected</span>
                    <span className="font-medium text-green-600">Tk. {summary.breakdown.monthlyCollected.toLocaleString()}</span>
                  </div>
                  <Progress
                    value={summary.breakdown.monthlyExpected > 0 ? (summary.breakdown.monthlyCollected / summary.breakdown.monthlyExpected) * 100 : 0}
                    className="h-2"
                  />
                </div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Flexible Contributions</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Expected</span>
                    <span className="font-medium">Tk. {summary.breakdown.flexibleExpected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Collected</span>
                    <span className="font-medium text-green-600">Tk. {summary.breakdown.flexibleCollected.toLocaleString()}</span>
                  </div>
                  <Progress
                    value={summary.breakdown.flexibleExpected > 0 ? (summary.breakdown.flexibleCollected / summary.breakdown.flexibleExpected) * 100 : 0}
                    className="h-2"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Policy Info */}
          <div className="rounded-lg border bg-card p-6">
            <h2 className="font-semibold mb-4">Policy for {year}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Amount</p>
                  <p className="font-semibold">Tk. {summary.config.monthlyAmount.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Yearly Flexible</p>
                  <p className="font-semibold">Tk. {summary.config.yearlyFlexibleAmount.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payment Deadline</p>
                  <p className="font-semibold">{summary.config.deadlineDay}th of each month</p>
                </div>
              </div>
            </div>
          </div>

          {/* Costs Toggle Section */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <button
              onClick={() => setShowCosts((v) => !v)}
              className="w-full flex items-center justify-between p-5 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <div className="text-left">
                  <p className="font-semibold">Costs & Expenses</p>
                  <p className="text-sm text-muted-foreground">
                    {summary.costItems.length} entr{summary.costItems.length === 1 ? 'y' : 'ies'} · Total Tk. {summary.totals.costs.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {showCosts ? <><EyeOff className="h-4 w-4" /> Hide</> : <><Eye className="h-4 w-4" /> View</>}
              </div>
            </button>

            {showCosts && (
              <div className="border-t">
                {summary.costItems.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No costs recorded for {year}.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Date</th>
                          <th className="px-4 py-3 text-left font-medium">Category</th>
                          <th className="px-4 py-3 text-left font-medium">Reason</th>
                          <th className="px-4 py-3 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {summary.costItems.map((item) => (
                          <tr key={item.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                              {format(new Date(item.date), 'dd MMM yyyy')}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other)}>
                                {CATEGORY_LABELS[item.category] ?? item.category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{item.reason}</td>
                            <td className={cn('px-4 py-3 text-right font-semibold', item.category === 'investment' ? 'text-emerald-600' : 'text-red-600')}>
                              {item.category === 'investment' ? '' : '−'}Tk. {item.amount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-muted/30">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 font-medium text-right">Total Operational Costs</td>
                          <td className="px-4 py-3 text-right font-bold text-red-600">
                            −Tk. {summary.totals.operationalCosts.toLocaleString()}
                          </td>
                        </tr>
                        {summary.totals.investmentAmount > 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-3 font-medium text-right">Total Investment Deployed</td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-600">
                              Tk. {summary.totals.investmentAmount.toLocaleString()}
                            </td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Member Breakdown */}
          <div>
            <h2 className="font-semibold mb-4">Member Contributions</h2>
            {summary.userSummaries.length > 0 ? (
              <div className="space-y-3">
                {summary.userSummaries.map((user) => (
                  <MemberCard
                    key={user.userId}
                    user={user}
                    isExpanded={expandedUsers.has(user.userId)}
                    onToggle={() => toggleUser(user.userId)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No member data available</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({
  icon,
  label,
  value,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  variant?: 'default' | 'success' | 'warning';
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'h-10 w-10 rounded-full flex items-center justify-center',
            variant === 'success' && 'bg-green-500/10 text-green-500',
            variant === 'warning' && 'bg-yellow-500/10 text-yellow-500',
            variant === 'default' && 'bg-muted text-muted-foreground'
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

// Member Card Component
function MemberCard({
  user,
  isExpanded,
  onToggle,
}: {
  user: GlobalSummaryUserSummary;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const progress = user.completionPercentage ?? 0;
  const totalExpected = user.totalPaid + user.totalRemaining;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center font-semibold">
            {user.userName?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="text-left">
            <p className="font-medium">{user.userName ?? 'Unknown'}</p>
            <p className="text-sm text-muted-foreground">{progress}% complete</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-semibold">
              Tk. {user.totalPaid.toLocaleString()}
              <span className="text-muted-foreground font-normal"> / {totalExpected.toLocaleString()}</span>
            </p>
            <p className="text-sm text-muted-foreground">Tk. {user.totalRemaining.toLocaleString()} remaining</p>
          </div>
          {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t p-4 bg-muted/30">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-card border">
                <p className="text-sm font-medium text-muted-foreground mb-2">Monthly</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Paid</span>
                    <span className="font-medium text-green-600">Tk. {user.monthlyPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Remaining</span>
                    <span className="font-medium text-red-600">Tk. {user.monthlyRemaining.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-card border">
                <p className="text-sm font-medium text-muted-foreground mb-2">Flexible</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Paid</span>
                    <span className="font-medium text-green-600">Tk. {user.flexiblePaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Remaining</span>
                    <span className="font-medium text-red-600">Tk. {user.flexibleRemaining.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-card border">
                <p className="text-lg font-bold">Tk. {totalExpected.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Expected</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-card border">
                <p className="text-lg font-bold text-green-600">Tk. {user.totalPaid.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Paid</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-card border">
                <p className="text-lg font-bold text-red-600">Tk. {user.totalRemaining.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
