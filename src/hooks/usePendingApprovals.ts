'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { transfersService } from '@/services';

/**
 * "Things that need a Co-Admin/Admin's attention" count — pending payment
 * verifications (the Transfer flow). Ledger entries posted via /api/entries
 * go straight to POSTED on a single action now (no two-person approval), so
 * they never contribute to this count. Used for the Home tab's badge in
 * both nav shells.
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

    if (!canApprove) return 0;

    return transfersQuery.data?.count || 0;
}
