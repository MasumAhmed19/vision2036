'use client';

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
}

/**
 * The 11-avatar status grid — newDesign.md §10.1. Seeing the whole group's
 * status in one glance is only possible because there are 11 of you; it's
 * the emotional core of Home and the biggest UX advantage a small group has.
 */
export function GroupBoard({ members, onSelect }: GroupBoardProps) {
    const paidCount = members.filter((m) => m.status === 'paid').length;

    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">The Group</h3>
                <span className="text-sm text-muted-foreground">
                    {paidCount} of {members.length}
                </span>
            </div>

            <div className="grid grid-cols-5 gap-3 sm:grid-cols-6 md:grid-cols-8">
                {members.map((member) => (
                    <button
                        key={member.id}
                        type="button"
                        onClick={() => onSelect?.(member.id)}
                        className="flex flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-accent"
                    >
                        <StatusRing status={member.status}>
                            <UserAvatar name={member.name} avatar={member.avatar} className="h-9 w-9" />
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
