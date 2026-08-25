'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Money } from '@/components/common/Money';
import { CardSkeleton } from '@/components/common/LoadingStates';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { membersService, summariesService } from '@/services';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  co_admin: 'Co-Admin',
  moderator: 'Moderator',
};

export default function MembersPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const years = useMemo(() => [currentYear, currentYear - 1], [currentYear]);

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => membersService.getMembers(),
  });

  const { data: globalSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['globalSummary', year],
    queryFn: () => summariesService.getGlobalSummary(year),
  });

  const progressByMember = useMemo(
    () => new Map((globalSummary?.userSummaries || []).map((s) => [s.userId, s])),
    [globalSummary]
  );

  const isLoading = membersLoading || summaryLoading;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground">{members?.length ?? '···'} of the fund, all visible to each other.</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {(members || []).map((member) => {
            const progress = progressByMember.get(member.id);
            const totalExpected = (progress?.totalPaid ?? 0) + (progress?.totalRemaining ?? 0);
            const pct = progress?.completionPercentage ?? 0;

            return (
              <div key={member.id} className="flex items-center gap-4 px-4 py-4">
                <UserAvatar name={member.name} avatar={member.avatar} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{member.name}</p>
                    {ROLE_LABEL[member.role] && (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                        {ROLE_LABEL[member.role]}
                      </span>
                    )}
                  </div>
                  <Progress value={Math.min(pct, 100)} className="mt-2 h-2" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Money value={progress?.totalPaid ?? 0} className="text-xs" /> of{' '}
                    <Money value={totalExpected} className="text-xs" /> · {pct}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
