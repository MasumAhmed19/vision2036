'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ArrowLeft, Wallet, TrendingUp, MinusCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ProtectedRoute, CardLoader } from '@/components/common/LoadingStates';
import { EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { monthlySummariesService } from '@/services';
import type { MonthlyCollectionSummary } from '@/types';

const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = 2024; year <= currentYear + 1; year++) {
    years.push(year);
  }
  return years.reverse();
};

const YEARS = generateYears();

export default function AdminSummariesPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'admin']}>
      <AdminSummariesContent />
    </ProtectedRoute>
  );
}

function AdminSummariesContent() {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: summaries = [], isLoading, isError } = useQuery({
    queryKey: ['monthlySummaries', year],
    queryFn: () => monthlySummariesService.getMonthlySummaries(year),
  });

  const totals = summaries.reduce(
    (acc, item) => {
      acc.collected += item.totalCollected;
      acc.costs += item.totalCosts;
      acc.net += item.netBalance;
      return acc;
    },
    { collected: 0, costs: 0, net: 0 }
  );

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin')} className="mb-4 -ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Admin Dashboard
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Monthly Summaries</h1>
            <p className="text-muted-foreground">Persisted monthly collection and expense summaries</p>
          </div>
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((item) => (
                <SelectItem key={item} value={String(item)}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat title="Collected" value={`Tk. ${totals.collected.toLocaleString()}`} icon={<TrendingUp className="h-5 w-5 text-green-600" />} />
        <SummaryStat title="Costs" value={`Tk. ${totals.costs.toLocaleString()}`} icon={<MinusCircle className="h-5 w-5 text-red-600" />} />
        <SummaryStat title="Net Balance" value={`Tk. ${totals.net.toLocaleString()}`} icon={<Wallet className="h-5 w-5 text-primary" />} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, index) => <CardLoader key={index} />)}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<BarChart3 className="h-12 w-12" />}
          title="Failed to load monthly summaries"
          description="Something went wrong while loading the generated month summaries."
          action={<Button onClick={() => window.location.reload()}>Try Again</Button>}
        />
      ) : summaries.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-12 w-12" />}
          title="No monthly summaries yet"
          description="Summaries will appear automatically after verified transfers or cost updates exist for the selected year."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((summary) => (
            <SummaryCard key={summary.id} summary={summary} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryStat({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-muted p-3">{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ summary }: { summary: MonthlyCollectionSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{format(new Date(`${summary.month}-01T00:00:00.000Z`), 'MMMM yyyy')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row label="Collected" value={`Tk. ${summary.totalCollected.toLocaleString()}`} />
        <Row label="Monthly" value={`Tk. ${summary.totalMonthly.toLocaleString()}`} />
        <Row label="Flexible" value={`Tk. ${summary.totalFlex.toLocaleString()}`} />
        <Row label="Costs" value={`Tk. ${summary.totalCosts.toLocaleString()}`} />
        <Row label="Net" value={`Tk. ${summary.netBalance.toLocaleString()}`} />
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-center">
          <MiniStat label="Paid" value={summary.fullyPaidMembers} />
          <MiniStat label="Partial" value={summary.partiallyPaidMembers} />
          <MiniStat label="Unpaid" value={summary.unpaidMembers} />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
