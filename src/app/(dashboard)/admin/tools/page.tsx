'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Download, FileSpreadsheet, FileText, RefreshCw, Settings2, Shield, UserCog } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { EmptyState } from '@/components/common/EmptyState';
import { CardLoader, ProtectedRoute } from '@/components/common/LoadingStates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminToolsService, costsService, exportsService, transfersService, usersService } from '@/services';
import type { ExportScope, SyncFailureItem } from '@/types';

const YEARS = Array.from({ length: new Date().getFullYear() - 2023 }, (_, index) => new Date().getFullYear() - index);

export default function AdminToolsPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'admin']}>
      <AdminToolsContent />
    </ProtectedRoute>
  );
}

function AdminToolsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<ExportScope>('monthly');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [userId, setUserId] = useState<string>('');

  const { data: syncFailures, isLoading: isSyncFailuresLoading, isError: isSyncFailuresError } = useQuery({
    queryKey: ['sync-failures'],
    queryFn: () => adminToolsService.getSyncFailures(),
  });

  const { data: usersResponse } = useQuery({
    queryKey: ['users', 'export-selector'],
    queryFn: () => usersService.getAllUsers('limit=100&page=1&role=member'),
  });

  useEffect(() => {
    if (!userId && usersResponse?.users?.length) {
      setUserId(usersResponse.users[0].id);
    }
  }, [userId, usersResponse]);

  const exportMutation = useMutation({
    mutationFn: async (formatType: 'pdf' | 'excel') => {
      const payload = {
        scope,
        year,
        month: scope === 'monthly' ? month : undefined,
        userId: scope === 'member' ? userId : undefined,
      };

      if (formatType === 'pdf') {
        await exportsService.downloadPdf(payload);
      } else {
        await exportsService.downloadExcel(payload);
      }
    },
    onSuccess: (_, formatType) => {
      toast.success(`${formatType.toUpperCase()} export started`);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to export report');
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (item: SyncFailureItem) => {
      if (item.type === 'transfer') {
        return transfersService.retrySync(item.id);
      }
      return costsService.retrySync(item.id);
    },
    onSuccess: () => {
      toast.success('Sync retried successfully');
      queryClient.invalidateQueries({ queryKey: ['sync-failures'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['costs'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to retry sync');
    },
  });

  const exportHint = useMemo(() => {
    if (scope === 'member') return 'Export a full member report with transfers, progress, and totals.';
    if (scope === 'monthly') return 'Export the selected month summary, all transactions, costs, and net balance.';
    return 'Export the full year dump including members, summaries, transactions, and costs.';
  }, [scope]);

  const syncItems = [
    ...(syncFailures?.transfers || []),
    ...(syncFailures?.costs || []),
  ].sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin')} className="mb-4 -ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Admin Dashboard
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Admin Tools</h1>
        <p className="text-muted-foreground">Exports, sync recovery, and administrative shortcuts for production operations.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Report Exports</h2>
              <p className="text-sm text-muted-foreground">Generate PDF or Excel files directly from live data.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Report scope</label>
              <Select value={scope} onValueChange={(value) => setScope(value as ExportScope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member report</SelectItem>
                  <SelectItem value="monthly">Monthly report</SelectItem>
                  <SelectItem value="yearly">Full year dump</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === 'member' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Member</label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {(usersResponse?.users || []).map((user) => (
                      <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {scope === 'monthly' ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Month</label>
                <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Year</label>
                <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((option) => (
                      <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <p className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{exportHint}</p>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => exportMutation.mutate('pdf')} disabled={exportMutation.isPending || (scope === 'member' && !userId) || (scope === 'monthly' && !month)}>
              <FileText className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
            <Button variant="outline" onClick={() => exportMutation.mutate('excel')} disabled={exportMutation.isPending || (scope === 'member' && !userId) || (scope === 'monthly' && !month)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-yellow-500/10 p-3">
              <Settings2 className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <h2 className="font-semibold">Operational Shortcuts</h2>
              <p className="text-sm text-muted-foreground">Jump to other Part 5 admin tools.</p>
            </div>
          </div>
          <div className="grid gap-3">
            <Button variant="outline" className="justify-start" onClick={() => router.push('/admin/members')}>
              <UserCog className="mr-2 h-4 w-4" />
              Open Member Management
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => router.push('/admin/audit-logs')}>
              <Shield className="mr-2 h-4 w-4" />
              Open Audit Log Viewer
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => router.push('/admin/payments/pending')}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Review Pending Payments
            </Button>
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Sync Failures</h2>
            <p className="text-sm text-muted-foreground">Manual retry panel for rows where `syncedToSheet` is still false.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['sync-failures'] })}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {isSyncFailuresLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, index) => <CardLoader key={index} />)}
          </div>
        ) : isSyncFailuresError ? (
          <EmptyState
            title="Failed to load sync failures"
            description="Try refreshing the panel."
            action={<Button onClick={() => queryClient.invalidateQueries({ queryKey: ['sync-failures'] })}>Try Again</Button>}
          />
        ) : syncItems.length === 0 ? (
          <EmptyState
            title="No sync failures"
            description="All verified transfers and costs are currently synced to Google Sheets."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {syncItems.map((item) => (
              <div key={`${item.type}-${item.id}`} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{item.type}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{format(new Date(item.date), 'PPp')}</p>
                <Button className="mt-4 w-full" variant="outline" onClick={() => retryMutation.mutate(item)} disabled={retryMutation.isPending}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry Sync
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
