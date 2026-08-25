import { Lock } from 'lucide-react';
import { Money } from '@/components/common/Money';
import { cn } from '@/lib/utils';

interface PeriodHeaderProps {
    label: string; // "March 2026"
    /** Signed net total for the period (positive shows as a credit, negative as a debit). */
    total: number;
    closed?: boolean;
    className?: string;
}

/** Month divider with a running total + lock icon once closed — newDesign.md §10.3. */
export function PeriodHeader({ label, total, closed, className }: PeriodHeaderProps) {
    return (
        <div className={cn('flex items-center justify-between border-b py-2 text-sm', className)}>
            <div className="flex items-center gap-2 font-semibold text-muted-foreground">
                {label}
                {closed && (
                    <span className="flex items-center gap-1 text-xs font-normal">
                        <Lock className="h-3 w-3" /> closed
                    </span>
                )}
            </div>
            <Money value={total} direction={total >= 0 ? 'CREDIT' : 'DEBIT'} className="font-semibold" />
        </div>
    );
}
