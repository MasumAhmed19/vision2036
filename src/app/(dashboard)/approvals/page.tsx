'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowRight, ScrollText } from 'lucide-react';
import { ProtectedRoute } from '@/components/common/LoadingStates';
import { EmptyState } from '@/components/common/EmptyState';
import { Money } from '@/components/common/Money';
import { Button } from '@/components/ui/button';
import { entriesService, transfersService } from '@/services';

export default function ApprovalsPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'co_admin', 'admin']}>
      <ApprovalsContent />
    </ProtectedRoute>
  );
}

function ApprovalsContent() {
  const { data: pendingTransfers } = useQuery({
    queryKey: ['transfers', 'pending'],
    queryFn: () => transfersService.getAllTransfers('status=PENDING&limit=5'),
  });

  // Ledger entries post immediately (no two-person approval) — this is just
  // a recent-activity glance, not a queue anyone needs to act on.
  const { data: recentEntries } = useQuery({
    queryKey: ['entries', 'recent'],
    queryFn: () => entriesService.getEntries('limit=5'),
  });

  const entries = recentEntries?.data || [];
  const transferCount = pendingTransfers?.meta.total || 0;

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Needs Review</h1>
        <p className="text-muted-foreground">Payments waiting on verification.</p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Pending Payments</h3>
            <p className="text-sm text-muted-foreground">{transferCount} submission{transferCount === 1 ? '' : 's'} awaiting verification</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/payments/pending">
              Review <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="font-semibold">Recent Ledger Entries</h3>
            <p className="text-sm text-muted-foreground">Posted immediately — bank charges, interest, investments, corrections.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/approvals/post">
              Post an entry <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-10 w-10" />}
            title="Nothing posted yet"
            description="Entries posted here show up immediately."
          />
        ) : (
          <div className="divide-y">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.type.replaceAll('_', ' ')} · {format(new Date(entry.valueDate), 'd MMM yyyy')}
                  </p>
                </div>
                <Money value={entry.amount} direction={entry.direction} className="shrink-0 font-semibold" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
