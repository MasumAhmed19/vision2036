'use client';

import { Paperclip } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Money, type MoneyKind } from '@/components/common/Money';
import { cn } from '@/lib/utils';

export interface EntryRowData {
    id: string;
    title: string;
    subtitle: string; // e.g. "12 Mar · approved by Rahim" / "24 Mar · posted by Rahim"
    amount: number; // whole Taka
    direction: 'CREDIT' | 'DEBIT';
    kind?: MoneyKind;
    reversed?: boolean;
    hasProof?: boolean;
    memberName?: string | null;
    memberAvatar?: string | null;
    statusLabel?: string; // e.g. "pending", "rejected"
}

/**
 * One ledger line — used identically in every list (Ledger screen, Home's
 * activity feed, a member's detail page). newDesign.md §11.5/§10.3.
 */
export function EntryRow({ entry, onClick }: { entry: EntryRowData; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={cn(
                'flex w-full items-center gap-3 border-b px-1 py-3 text-left last:border-b-0',
                onClick && 'transition-colors hover:bg-accent'
            )}
        >
            {entry.memberName ? (
                <UserAvatar name={entry.memberName} avatar={entry.memberAvatar} className="h-9 w-9 shrink-0" />
            ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm">
                    {entry.kind === 'invest' ? '📈' : entry.kind === 'interest' ? '✦' : '🏦'}
                </div>
            )}

            <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-medium', entry.reversed && 'text-reversed line-through')}>
                    {entry.title}
                </p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {entry.subtitle}
                    {entry.statusLabel && <span className="text-pending">· {entry.statusLabel}</span>}
                    {entry.hasProof && <Paperclip className="h-3 w-3 shrink-0" />}
                </p>
            </div>

            <Money
                value={entry.amount}
                direction={entry.direction}
                kind={entry.kind}
                reversed={entry.reversed}
                className="shrink-0 text-sm font-medium"
            />
        </button>
    );
}
