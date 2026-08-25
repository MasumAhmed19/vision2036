import { cn } from '@/lib/utils';

export type MemberPaymentStatus = 'paid' | 'pending' | 'unpaid';

const RING_CLASS: Record<MemberPaymentStatus, string> = {
    paid: 'border-2 border-solid border-credit',
    pending: 'border-2 border-dashed border-pending',
    unpaid: 'border-2 border-solid border-border',
};

/**
 * Status carried by shape + colour + position, never colour alone
 * (newDesign.md §10.1): paid = filled/solid ring, pending = dashed ring,
 * unpaid = hollow/neutral ring.
 */
export function StatusRing({
    status,
    children,
    className,
}: {
    status: MemberPaymentStatus;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('inline-flex rounded-full p-0.5', RING_CLASS[status], className)}>
            {children}
        </div>
    );
}

export function StatusRingLegend({ className }: { className?: string }) {
    return (
        <div className={cn('flex items-center gap-4 text-xs text-muted-foreground', className)}>
            <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-solid border-credit" />
                paid
            </span>
            <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-pending" />
                pending
            </span>
            <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-solid border-border" />
                not yet
            </span>
        </div>
    );
}
