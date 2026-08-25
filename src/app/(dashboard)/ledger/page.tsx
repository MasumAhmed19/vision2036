'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { entriesService, membersService } from '@/services';
import { EntryRow, type EntryRowData } from '@/components/common/EntryRow';
import { PeriodHeader } from '@/components/common/PeriodHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { CardSkeleton } from '@/components/common/LoadingStates';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollText } from 'lucide-react';
import type { LedgerEntry, LedgerEntryType } from '@/types';

type FilterKey = 'all' | 'in' | 'out' | 'invest' | 'mine';

const INVEST_TYPES: LedgerEntryType[] = ['INVESTMENT_OUT', 'INVESTMENT_RETURN', 'INVESTMENT_PRINCIPAL_BACK'];

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'pending',
  REJECTED: 'rejected',
};

function entryKind(entry: LedgerEntry): EntryRowData['kind'] {
  if (INVEST_TYPES.includes(entry.type)) return 'invest';
  if (entry.type === 'INTEREST_BANK') return 'interest';
  return 'default';
}

export default function LedgerPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterKey>('all');

  const { data: membersList } = useQuery({
    queryKey: ['members'],
    queryFn: () => membersService.getMembers(),
    staleTime: 5 * 60 * 1000,
  });
  const memberMap = useMemo(() => new Map((membersList || []).map((m) => [m.id, m])), [membersList]);

  const { data, isLoading } = useQuery({
    queryKey: ['entries', 'ledger', filter],
    queryFn: () => entriesService.getEntries('limit=100'),
  });

  const entries = useMemo(() => {
    const all = data?.data || [];
    switch (filter) {
      case 'in':
        return all.filter((e) => e.direction === 'CREDIT' && !INVEST_TYPES.includes(e.type));
      case 'out':
        return all.filter((e) => e.direction === 'DEBIT' && !INVEST_TYPES.includes(e.type));
      case 'invest':
        return all.filter((e) => INVEST_TYPES.includes(e.type));
      case 'mine':
        return all.filter((e) => e.memberId === user?.id || e.createdBy === user?.id);
      default:
        return all;
    }
  }, [data, filter, user?.id]);

  const grouped = useMemo(() => {
    const groups = new Map<string, LedgerEntry[]>();
    for (const entry of entries) {
      const list = groups.get(entry.period) || [];
      list.push(entry);
      groups.set(entry.period, list);
    }
    return Array.from(groups.entries());
  }, [entries]);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ledger</h1>
          <p className="text-muted-foreground">Every movement of money, ever. Filter, drill, prove.</p>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="in">In</TabsTrigger>
          <TabsTrigger value="out">Out</TabsTrigger>
          <TabsTrigger value="invest">Invest</TabsTrigger>
          <TabsTrigger value="mine">Mine</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <CardSkeleton />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-12 w-12" />}
          title="No entries yet"
          description="Once payments are verified or a Co-Admin posts a fund entry, it'll show up here."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([period, periodEntries]) => {
            const total = periodEntries.reduce(
              (sum, e) => sum + (e.direction === 'CREDIT' ? e.amount : -e.amount),
              0
            );
            return (
              <div key={period} className="rounded-xl border bg-card px-3">
                <PeriodHeader label={format(new Date(`${period}-01`), 'MMMM yyyy')} total={total} />
                {periodEntries.map((entry) => {
                  const member = entry.memberId ? memberMap.get(entry.memberId) : undefined;
                  const row: EntryRowData = {
                    id: entry.id,
                    title: entry.title,
                    subtitle: `${format(new Date(entry.valueDate), 'd MMM')}${
                      entry.status === 'POSTED' ? ' · posted' : ''
                    }`,
                    amount: entry.amount,
                    direction: entry.direction,
                    kind: entryKind(entry),
                    reversed: entry.status === 'REVERSED',
                    hasProof: entry.attachments.length > 0,
                    memberName: member?.name,
                    memberAvatar: member?.avatar,
                    statusLabel: STATUS_LABEL[entry.status],
                  };
                  return <EntryRow key={entry.id} entry={row} />;
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
