'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, ChevronLeft, ChevronRight, FileSearch, Filter, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ProtectedRoute, TableSkeleton } from '@/components/common/LoadingStates';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { auditLogsService } from '@/services';

const ACTION_OPTIONS = [
  'all',
  'TRANSFER_CREATED',
  'TRANSFER_VERIFIED',
  'TRANSFER_REJECTED',
  'COST_ADDED',
  'COST_UPDATED',
  'COST_DELETED',
  'SHEET_SYNCED',
] as const;

const TARGET_OPTIONS = ['all', 'Transfers', 'Costs'] as const;

export default function AuditLogsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AuditLogsContent />
    </ProtectedRoute>
  );
}

function AuditLogsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [actor, setActor] = useState('');
  const [action, setAction] = useState<string>('all');
  const [targetCollection, setTargetCollection] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    if (actor.trim()) params.set('actor', actor.trim());
    if (action !== 'all') params.set('action', action);
    if (targetCollection !== 'all') params.set('targetCollection', targetCollection);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return params.toString();
  }, [action, actor, dateFrom, dateTo, page, targetCollection]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', queryString],
    queryFn: () => auditLogsService.getLogs(queryString),
  });

  const deleteMutation = useMutation({
    mutationFn: (deleteAll: boolean) => auditLogsService.deleteLogs({
      actor: actor.trim() || undefined,
      action: action !== 'all' ? action : undefined,
      targetCollection: targetCollection !== 'all' ? targetCollection : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      deleteAll,
    }),
    onSuccess: (result) => {
      toast.success(`Deleted ${result.deletedCount} audit log${result.deletedCount === 1 ? '' : 's'}`);
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      setPage(1);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete audit logs');
    },
  });

  const clearFilters = () => {
    setActor('');
    setAction('all');
    setTargetCollection('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasFilters = !!actor || action !== 'all' || targetCollection !== 'all' || !!dateFrom || !!dateTo;

  const handleBulkDelete = (deleteAll: boolean) => {
    const confirmed = window.confirm(
      deleteAll
        ? 'Delete all transfer and cost audit logs? This cannot be undone.'
        : 'Delete all audit logs matching the current filters? This cannot be undone.'
    );

    if (!confirmed) return;
    deleteMutation.mutate(deleteAll);
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin')} className="mb-4 -ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Admin Dashboard
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">Review transfer and cost activity only. Older unrelated logs can be bulk deleted.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        <Input
          value={actor}
          onChange={(event) => {
            setActor(event.target.value);
            setPage(1);
          }}
          placeholder="Search actor name"
          className="w-full sm:w-56"
        />
        <Select value={action} onValueChange={(value) => { setAction(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === 'all' ? 'All actions' : option.replaceAll('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={targetCollection} onValueChange={(value) => { setTargetCollection(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Target" />
          </SelectTrigger>
          <SelectContent>
            {TARGET_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === 'all' ? 'All targets' : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} className="w-full sm:w-40" />
        <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} className="w-full sm:w-40" />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {hasFilters && (
            <Button variant="destructive" size="sm" onClick={() => handleBulkDelete(false)} disabled={deleteMutation.isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Filtered
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => handleBulkDelete(true)} disabled={deleteMutation.isPending}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete All
          </Button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : isError || !data ? (
        <EmptyState
          icon={<FileSearch className="h-12 w-12" />}
          title="Failed to load audit logs"
          description="Please try again or adjust your filters."
          action={<Button onClick={() => window.location.reload()}>Try Again</Button>}
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={<FileSearch className="h-12 w-12" />}
          title="No audit entries found"
          description={hasFilters ? 'Try changing the selected filters.' : 'Audit logs will appear here as the app is used.'}
          action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Clear Filters</Button> : undefined}
        />
      ) : (
        <>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Time</th>
                    <th className="px-4 py-3 text-left font-medium">Actor</th>
                    <th className="px-4 py-3 text-left font-medium">Action</th>
                    <th className="px-4 py-3 text-left font-medium">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{format(new Date(item.timestamp), 'PPp')}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{item.actorName}</div>
                        {item.ipAddress && <div className="text-xs text-muted-foreground">IP: {item.ipAddress}</div>}
                      </td>
                      <td className="px-4 py-3">{item.action.replaceAll('_', ' ')}</td>
                      <td className="px-4 py-3">
                        <div>{item.targetCollection || '—'}</div>
                        <div className="text-xs text-muted-foreground">{item.targetId || '—'}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">Page {data.pagination.currentPage} of {data.pagination.totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(current + 1, data.pagination.totalPages))} disabled={page >= data.pagination.totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
