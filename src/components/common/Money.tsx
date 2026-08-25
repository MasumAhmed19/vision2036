import { cn } from '@/lib/utils';

// Bangladeshi lakh/crore grouping — ৳ 5,50,000 not ৳ 550,000.
const TAKA_FORMATTER = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

export type MoneyDirection = 'CREDIT' | 'DEBIT';
export type MoneyKind = 'default' | 'invest' | 'interest' | 'pending';

interface MoneyProps {
    /** Whole Taka (never paisa — the API layer converts before this ever renders). */
    value: number;
    direction?: MoneyDirection;
    /** Overrides the colour semantics for a non-credit/debit movement. */
    kind?: MoneyKind;
    /** Struck-through, grey — a reversed entry. */
    reversed?: boolean;
    /** Show the leading +/- sign (defaults to true whenever `direction` is set). */
    showSign?: boolean;
    className?: string;
}

/**
 * The only way money is ever displayed — newDesign.md §11.4. Never colour
 * alone: sign, icon/arrow, and colour always move together so the meaning
 * doesn't depend on colour perception alone.
 */
export function Money({ value, direction, kind = 'default', reversed, showSign, className }: MoneyProps) {
    const shouldShowSign = showSign ?? !!direction;
    const formatted = `৳ ${TAKA_FORMATTER.format(Math.abs(value))}`;

    const colorClass = reversed
        ? 'text-reversed line-through'
        : kind === 'invest'
            ? 'text-invest'
            : kind === 'interest'
                ? 'text-interest'
                : kind === 'pending'
                    ? 'text-pending'
                    : direction === 'CREDIT'
                        ? 'text-credit'
                        : direction === 'DEBIT'
                            ? 'text-debit'
                            : 'text-foreground';

    const prefix = reversed ? '' : kind === 'invest' ? '→ ' : shouldShowSign ? (direction === 'DEBIT' ? '− ' : '+ ') : '';

    return (
        <span className={cn('money whitespace-nowrap', colorClass, className)}>
            {prefix}
            {formatted}
        </span>
    );
}
