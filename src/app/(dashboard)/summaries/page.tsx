'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  CheckCircle2,
  CalendarDays,
  Sparkles,
  Wallet,
  AlertCircle,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { exportsService, summariesService } from '@/services';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

export default function SummariesPage() {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const exportMutation = useMutation({
    mutationFn: async (format: 'pdf' | 'excel') => {
      if (format === 'pdf') {
        await exportsService.downloadPdf({ scope: 'member', year: selectedYear });
      } else {
        await exportsService.downloadExcel({ scope: 'member', year: selectedYear });
      }
    },
    onSuccess: (_, format) => {
      toast.success(`${format.toUpperCase()} export started`);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to export report');
    },
  });

  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ['summaries', 'user', selectedYear],
    queryFn: () => summariesService.getUserSummary(selectedYear),
  });

  if (isLoading) return <LoadingSkeleton />;

  if (isError) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <EmptyState
            icon={<AlertCircle />}
            title="Failed to load summary"
          description="Something went wrong. Please try again."
          action={
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          }
        />
      </div>
    );
  }

  if (!summary) return null;

  const completionPercentage = summary.total?.expected > 0
    ? Math.round((summary.total.paid / summary.total.expected) * 100)
    : 0;
  const isComplete = completionPercentage >= 100;

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">My Summary</h1>
          <p className="text-sm text-muted-foreground">Contribution overview</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => exportMutation.mutate('pdf')} disabled={exportMutation.isPending}>
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportMutation.mutate('excel')} disabled={exportMutation.isPending}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
          <Select
            value={selectedYear.toString()}
            onValueChange={(v) => setSelectedYear(parseInt(v))}
          >
            <SelectTrigger className="w-24 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overall Progress Card */}
      <div className={`rounded-xl border p-5 ${isComplete ? 'border-green-500/50 bg-green-500/5' : 'bg-card'}`}>
        <div className="flex items-center gap-3 mb-4">
          {isComplete ? (
            <div className="p-2.5 rounded-full bg-green-500/10">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          ) : (
            <div className="p-2.5 rounded-full bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Total Progress</p>
            <p className="text-2xl font-bold">{completionPercentage}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Paid</p>
            <p className="text-lg font-semibold text-green-600">
              ৳{(summary.total?.paid || 0).toLocaleString()}
            </p>
          </div>
        </div>
        <Progress value={completionPercentage} className="h-2.5" />
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>৳0</span>
          <span>৳{(summary.total?.expected || 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Contribution Breakdown */}
      <div className="grid gap-3">
        {/* Monthly */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-500" />
              <span className="font-medium">Monthly</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {summary.monthly?.monthsPaid || 0}/12 months
            </span>
          </div>
          <Progress
            value={
              ((summary.monthly?.monthsPaid || 0) / 12) * 100
            }
            className="h-2 mb-3"
          />
          <div className="flex justify-between text-sm">
            <div>
              <span className="text-muted-foreground">Paid: </span>
              <span className="font-medium text-green-600">৳{(summary.monthly?.paid || 0).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Due: </span>
              <span className="font-medium text-orange-500">৳{(summary.monthly?.remaining || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Flexible */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className="font-medium">Flexible</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {summary.flexible?.expected > 0
                ? Math.round((summary.flexible.paid / summary.flexible.expected) * 100)
                : 0}% complete
            </span>
          </div>
          <Progress
            value={
              (summary.flexible?.expected || 0) > 0
                ? (summary.flexible.paid / summary.flexible.expected) * 100
                : 0
            }
            className="h-2 mb-3"
          />
          <div className="flex justify-between text-sm">
            <div>
              <span className="text-muted-foreground">Paid: </span>
              <span className="font-medium text-green-600">৳{(summary.flexible?.paid || 0).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Due: </span>
              <span className="font-medium text-orange-500">৳{(summary.flexible?.remaining || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Tracker */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-base">Monthly Tracker</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((month, i) => {
              const isPaid = i + 1 <= (summary.monthly?.monthsPaid || 0);
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

      {/* Total Remaining Banner */}
      {(summary.total?.remaining || 0) > 0 && (
        <div className="rounded-xl bg-muted/50 border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Remaining</span>
            </div>
            <span className="text-lg font-bold text-orange-500">
              ৳{(summary.total?.remaining || 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-xl mx-auto space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}
