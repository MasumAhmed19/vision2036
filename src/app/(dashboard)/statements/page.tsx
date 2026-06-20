'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  FileText,
  Download,
  Calendar,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { CardLoader } from '@/components/common/LoadingStates';
import { statementsService } from '@/services';
import type { Statement } from '@/types';

const MONTHS = [
  { value: 0, label: 'All Months' },
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

// Generate years from 2024 to current year
const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years: { value: number; label: string }[] = [{ value: 0, label: 'All Years' }];
  for (let year = 2024; year <= currentYear; year++) {
    years.push({ value: year, label: year.toString() });
  }
  return years.reverse();
};

const YEARS = generateYears();

export default function StatementsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(0);

  // Build query string
  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (year > 0) params.set('year', year.toString());
    if (month > 0) params.set('month', month.toString());
    return params.toString();
  };

  // Fetch statements
  const { data, isLoading, isError } = useQuery({
    queryKey: ['statements', year, month],
    queryFn: () => statementsService.getAllStatements(buildQueryString()),
  });

  const statements = data?.statements || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bank Statements</h1>
        <p className="text-muted-foreground">
          View and download monthly bank statements
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select
          value={year.toString()}
          onValueChange={(v) => setYear(parseInt(v))}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y.value} value={y.value.toString()}>
                {y.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={month.toString()}
          onValueChange={(v) => setMonth(parseInt(v))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value.toString()}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <CardLoader key={i} />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="Failed to load statements"
          description="Something went wrong while fetching bank statements."
          action={
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          }
        />
      ) : statements.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="No statements found"
          description={
            year > 0 || month > 0
              ? "No bank statements match your filters."
              : "No bank statements have been uploaded yet."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statements.map((statement) => (
            <StatementCard key={statement.id} statement={statement} />
          ))}
        </div>
      )}
    </div>
  );
}

// Statement Card Component
function StatementCard({ statement }: { statement: Statement }) {
  const monthName = MONTHS.find((m) => m.value === statement.month)?.label || 'Unknown';
  
  return (
    <div className="rounded-lg border bg-card p-4 hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">
            {monthName} {statement.year}
          </h3>
          {statement.description && (
            <p className="text-sm text-muted-foreground truncate mt-1">
              {statement.description}
            </p>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
            <Calendar className="h-3 w-3" />
            <span>Uploaded {format(new Date(statement.createdAt), 'MMM d, yyyy')}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => window.open(statement.fileUrl, '_blank')}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          View
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          asChild
        >
          <a href={statement.fileUrl} download>
            <Download className="mr-2 h-4 w-4" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}
