'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import { StatusRing, StatusRingLegend, type MemberPaymentStatus } from '@/components/common/StatusRing';

export interface GroupBoardMember {
    id: string;
    name: string;
    avatar?: string | null;
    status: MemberPaymentStatus;
}

interface GroupBoardProps {
    members: GroupBoardMember[];
    onSelect?: (memberId: string) => void;
    /** Label for the month being shown, e.g. "August 2026" — omit to hide the month nav row entirely. */
    periodLabel?: string;
    onPrevMonth?: () => void;
    onNextMonth?: () => void;
}

/**
 * The 11-avatar status grid — newDesign.md §10.1. Seeing the whole group's
 * status in one glance is only possible because there are 11 of you; it's
 * the emotional core of Home and the biggest UX advantage a small group has.
 */
export function GroupBoard({ members, onSelect, periodLabel, onPrevMonth, onNextMonth }: GroupBoardProps) {
    const paidCount = members.filter((m) => m.status === 'paid').length;

    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">The Group</h3>
                <span className="text-sm text-muted-foreground">
                    {paidCount} of {members.length}
                </span>
            </div>

            {periodLabel && (
                <div className="mb-3 flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={onPrevMonth}
                        aria-label="Previous month"
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-36 text-center text-sm font-medium">{periodLabel}</span>
                    <button
                        type="button"
                        onClick={onNextMonth}
                        aria-label="Next month"
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}

            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
                {members.map((member) => (
                    <button
                        key={member.id}
                        type="button"
                        onClick={() => onSelect?.(member.id)}
                        className="flex flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-accent"
                    >
                        <StatusRing status={member.status}>
                            <UserAvatar name={member.name} avatar={member.avatar} className="h-10 w-10" />
                        </StatusRing>
                        <span className="max-w-[56px] truncate text-[11px] text-muted-foreground">
                            {member.name.split(' ')[0]}
                        </span>
                    </button>
                ))}
            </div>

            <StatusRingLegend className="mt-4" />
        </div>
    );
}
