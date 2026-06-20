'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import { format, isValid } from 'date-fns';
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Clock,
  CreditCard,
  DollarSign,
  Info,
  PiggyBank,
  Plus,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboardService, summariesService } from '@/services';

export default function DashboardPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!user) return null;

  const isAdmin = ['admin', 'moderator'].includes(user.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground">Here is your current payment and contribution progress.</p>
      </div>

      <MemberHomeSummary />

      {isAdmin && <AdminQuickLinks />}
    </div>
  );
}

const CURRENT_YEAR = new Date().getFullYear();
const SAVINGS_YEARS = Array.from({ length: CURRENT_YEAR - 2025 + 1 }, (_, i) => 2025 + i);
const TRACKER_YEARS = [...SAVINGS_YEARS];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MemberHomeSummary() {
  const [trackerYear, setTrackerYear] = useState(CURRENT_YEAR);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'member'],
    queryFn: () => dashboardService.getMemberDashboard(),
  });

  const yearQueries = useQueries({
    queries: SAVINGS_YEARS.map((year) => ({
      queryKey: ['summaries', 'user', year] as const,
      queryFn: () => summariesService.getUserSummary(year),
      enabled: !!data,
    })),
  });

  const trackerQuery = useQuery({
    queryKey: ['summaries', 'user', 'tracker', trackerYear],
    queryFn: () => summariesService.getUserSummary(trackerYear),
    enabled: !!data,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Failed to load your dashboard.</CardContent></Card>;
  }

  // All-year savings breakdown
  const yearBreakdown = SAVINGS_YEARS.map((year, i) => ({
    year,
    paid: yearQueries[i]?.data?.total.paid ?? 0,
  }));
  const totalSavings = yearBreakdown.reduce((sum, y) => sum + y.paid, 0);

  // Monthly tracker months paid
  const monthsPaid =
    trackerQuery.data?.monthly?.monthsPaid ??
    (trackerYear === CURRENT_YEAR ? data.summary.monthly.monthsPaid : 0);

  return (
    <div className="space-y-4 -mt-3">
      {/* Top stat cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Monthly Status"
          value={data.monthlyStatus.status.toUpperCase()}
          icon={<CreditCard className="h-5 w-5" />}
          description={`Target Tk. ${data.monthlyStatus.targetAmount.toLocaleString()}`}
        />
        <TotalSavingsCard totalSavings={totalSavings} yearBreakdown={yearBreakdown} />
      </div>

      {/* Monthly Tracker */}
      <MonthlyTrackerCard year={trackerYear} onYearChange={setTrackerYear} monthsPaid={monthsPaid} />

      {data.flexStatus.warning && (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4 text-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium">Flexible contribution warning</p>
              <p className="text-muted-foreground">You are below Tk. {data.flexStatus.halfTarget.toLocaleString()} for the month 6 checkpoint.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Current Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Monthly completion</span>
                <span className="font-medium">
                  {data.summary.monthly.paid.toLocaleString()} / {(data.summary.monthly.paid + data.summary.monthly.remaining).toLocaleString()} Tk
                </span>
              </div>
              <Progress
                value={Math.min(
                  data.summary.monthly.paid + data.summary.monthly.remaining > 0
                    ? Math.round((data.summary.monthly.paid / (data.summary.monthly.paid + data.summary.monthly.remaining)) * 100)
                    : 0,
                  100,
                )}
                className="h-3"
              />
              <p className="text-xs text-muted-foreground">
                {Math.min(
                  data.summary.monthly.paid + data.summary.monthly.remaining > 0
                    ? Math.round((data.summary.monthly.paid / (data.summary.monthly.paid + data.summary.monthly.remaining)) * 100)
                    : 0,
                  100,
                )}% of yearly monthly dues paid
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Flexible completion</span>
                <span className="font-medium">
                  {data.summary.flexible.paid.toLocaleString()} / {data.flexStatus.target.toLocaleString()} Tk
                </span>
              </div>
              <Progress
                value={data.flexStatus.target > 0 ? Math.min(Math.round((data.summary.flexible.paid / data.flexStatus.target) * 100), 100) : 0}
                className="h-3"
              />
              <p className="text-xs text-muted-foreground">
                {data.flexStatus.target > 0 ? Math.min(Math.round((data.summary.flexible.paid / data.flexStatus.target) * 100), 100) : 0}% of yearly flexible target paid
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickLink href="/payments/submit" icon={<Plus className="h-4 w-4" />} label="Submit Payment" />
              <QuickLink href="/payments" icon={<Wallet className="h-4 w-4" />} label="View Payments" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentTransfers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment activity yet.</p>
            ) : (
              data.recentTransfers.map((transfer) => (
                <div key={transfer.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{transfer.selectMonth}</p>
                    <Badge variant={transfer.status === 'VERIFIED' ? 'default' : transfer.status === 'PENDING' ? 'secondary' : 'destructive'}>
                      {transfer.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">Tk. {transfer.totalAmount.toLocaleString()} · {(() => { const d = new Date(transfer.createdAt); return isValid(d) ? format(d, 'PP') : 'N/A'; })()}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminQuickLinks() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Admin Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickLink href="/admin" icon={<TrendingUp className="h-4 w-4" />} label="Admin Dashboard" />
        <QuickLink href="/admin/payments" icon={<Clock className="h-4 w-4" />} label="Pending Payments" />
        <QuickLink href="/admin/costs" icon={<DollarSign className="h-4 w-4" />} label="Manage Costs" />
        <QuickLink href="/admin/summaries" icon={<BarChart3 className="h-4 w-4" />} label="Monthly Summaries" />
      </CardContent>
    </Card>
  );
}

function TotalSavingsCard({
  totalSavings,
  yearBreakdown,
}: {
  totalSavings: number;
  yearBreakdown: { year: number; paid: number }[];
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Total Savings</p>
            <p className="mt-1 text-2xl font-semibold">৳{totalSavings.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">All-time contributions</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-muted p-3 text-muted-foreground">
              <PiggyBank className="h-5 w-5" />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Savings breakdown"
                >
                  <Info className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52">
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Savings Breakdown</p>
                  {yearBreakdown.map(({ year, paid }) => (
                    <div key={year} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{year}</span>
                      <span className="font-medium">৳{paid.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>৳{totalSavings.toLocaleString()}</span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyTrackerCard({
  year,
  onYearChange,
  monthsPaid,
}: {
  year: number;
  onYearChange: (y: number) => void;
  monthsPaid: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-500" />
            <CardTitle className="text-base">Monthly Tracker</CardTitle>
          </div>
          <Select value={year.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
            <SelectTrigger className="w-24 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACKER_YEARS.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-2">
          {MONTHS.map((month, i) => {
            const isPaid = i + 1 <= monthsPaid;
            return (
              <div
                key={month}
                className={`rounded-md px-2 py-2 text-center text-sm select-none ${
                  isPaid
                    ? 'text-muted-foreground line-through bg-muted/40'
                    : 'font-bold text-foreground bg-muted/20'
                }`}
              >
                {month}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            <span>Paid</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-foreground/60" />
            <span>Pending</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, description, icon }: { title: string; value: string; description?: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className="rounded-full bg-muted p-3 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href}>
      <Button variant="outline" className="h-auto w-full justify-start gap-2 p-4">
        {icon}
        <span>{label}</span>
      </Button>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-24" />
              <Skeleton className="mt-2 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
