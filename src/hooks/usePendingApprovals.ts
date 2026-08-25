'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { transfersService, entriesService } from '@/services';

/**
 * Combined "things that need a Co-Admin/Admin's attention" count — pending
 * payment verifications (the existing Transfer flow) plus pending ledger
 * entries (the new /api/entries approval workflow). Used for the Home tab's
 * badge in both nav shells.
 */
export function usePendingApprovalsCount() {
    const { user } = useAuth();
    const canApprove = !!user && ['admin', 'moderator', 'co_admin'].includes(user.role);

    const transfersQuery = useQuery({
        queryKey: ['transfers', 'pending-count'],
        queryFn: () => transfersService.getPendingCount(),
        enabled: canApprove,
        refetchInterval: 60000,
    });

    const entriesQuery = useQuery({
        queryKey: ['entries', 'pending-count'],
        queryFn: () => entriesService.getEntries('status=PENDING&limit=1'),
        enabled: canApprove,
        refetchInterval: 60000,
    });

    if (!canApprove) return 0;

    return (transfersQuery.data?.count || 0) + (entriesQuery.data?.meta.total || 0);
}
