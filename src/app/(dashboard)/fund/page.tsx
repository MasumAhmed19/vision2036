'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { Money } from '@/components/common/Money';
import { CardSkeleton } from '@/components/common/LoadingStates';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { entriesService, summariesService } from '@/services';

const TARGET_YEAR = 2036;
const ASSUMED_ANNUAL_GROWTH = 0.08; // 8% — matches newDesign.md §10.5's illustrative projection

export default function FundPage() {
  const currentYear = new Date().getFullYear();

  const { data: position, isLoading: positionLoading } = useQuery({
    queryKey: ['fund', 'position'],
    queryFn: () => entriesService.getFundPosition(),
  });

  const { data: globalSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['globalSummary', currentYear],
    queryFn: () => summariesService.getGlobalSummary(currentYear),
  });

  const isLoading = positionLoading || summaryLoading;

  const hasFundValue = !!position && position.fundValue > 0;
  const cashPct = hasFundValue ? Math.round((position.cash / position.fundValue) * 100) : 0;
  const investedPct = hasFundValue ? 100 - cashPct : 0;

  const projection = useMemo(() => {
    if (!position || !globalSummary) return null;
    const years = Math.max(TARGET_YEAR - currentYear, 0);
    const annualContribution =
      globalSummary.config.totalMembers *
      (globalSummary.config.monthlyAmount * 12 + globalSummary.config.yearlyFlexibleAmount);

    const contributionsOnly = position.fundValue + annualContribution * years;

    const lumpSumFV = position.fundValue * Math.pow(1 + ASSUMED_ANNUAL_GROWTH, years);
    const annuityFV =
      years > 0 ? annualContribution * ((Math.pow(1 + ASSUMED_ANNUAL_GROWTH, years) - 1) / ASSUMED_ANNUAL_GROWTH) : 0;
    const withGrowth = lumpSumFV + annuityFV;

    return {
      years,
      contributionsOnly,
      withGrowth,
      earningsPortion: Math.max(withGrowth - contributionsOnly, 0),
    };
  }, [position, globalSummary, currentYear]);

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fund</h1>
        <p className="text-muted-foreground">Cash vs invested, and where this is all headed.</p>
      </div>

      {isLoading ? (
        <CardSkeleton />
      ) : (
        <>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-baseline justify-between">
              <Money value={position?.fundValue ?? 0} className="text-2xl font-bold" />
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary" style={{ width: `${cashPct}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Cash <Money value={position?.cash ?? 0} className="text-xs" /> ({cashPct}%)
              </span>
              <span>
                Invested <Money value={position?.investedAtCost ?? 0} className="text-xs" /> ({investedPct}%)
              </span>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Investments</h3>
            <EmptyState
              icon={<TrendingUp className="h-10 w-10" />}
              title="No formal investment register yet"
              description="Investment-out entries already move money out of cash — a dedicated Investment register with valuations is next."
              action={
                <Button variant="outline" disabled>
                  Propose an investment (coming soon)
                </Button>
              }
            />
          </div>

          {projection && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Projection to {TARGET_YEAR}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    At {(ASSUMED_ANNUAL_GROWTH * 100).toFixed(0)}%/yr growth
                  </span>
                  <Money value={projection.withGrowth} className="font-semibold" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Contributions only</span>
                  <Money value={projection.contributionsOnly} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Earnings do the rest</span>
                  <Money value={projection.earningsPortion} kind="interest" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Illustrative only — assumes today&apos;s {globalSummary?.config.totalMembers} members keep
                contributing at the current rate for {projection.years} more years, with an 8% annual return on the
                fund. Not a promise.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
