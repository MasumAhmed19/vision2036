'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { TrendingUp, Plus } from 'lucide-react';
import { Money } from '@/components/common/Money';
import { CardSkeleton } from '@/components/common/LoadingStates';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { entriesService, summariesService, investmentsService } from '@/services';
import type { Investment, InvestmentKind } from '@/types';

const TARGET_YEAR = 2036;
const ASSUMED_ANNUAL_GROWTH = 0.08; // 8% — matches newDesign.md §10.5's illustrative projection
const INVESTMENT_KINDS: InvestmentKind[] = ['FDR', 'DPS', 'SHARE', 'BOND', 'PROPERTY', 'BUSINESS', 'OTHER'];

const STATUS_LABEL: Record<Investment['status'], string> = {
  PROPOSED: 'Proposed',
  ACTIVE: 'Active',
  MATURED: 'Matured',
  EXITED: 'Exited',
  WRITTEN_OFF: 'Written off',
};

export default function FundPage() {
  const currentYear = new Date().getFullYear();
  const { user } = useAuth();
  const canValue = user?.role === 'co_admin' || user?.role === 'admin';

  const { data: position, isLoading: positionLoading } = useQuery({
    queryKey: ['fund', 'position'],
    queryFn: () => entriesService.getFundPosition(),
  });

  const { data: globalSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['globalSummary', currentYear],
    queryFn: () => summariesService.getGlobalSummary(currentYear),
  });

  const { data: investments, isLoading: investmentsLoading } = useQuery({
    queryKey: ['investments'],
    queryFn: () => investmentsService.getInvestments(),
  });

  const isLoading = positionLoading || summaryLoading || investmentsLoading;

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
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Investments</h3>
              <ProposeInvestmentDialog />
            </div>
            {investments && investments.length > 0 ? (
              <div className="space-y-2">
                {investments.map((inv) => (
                  <InvestmentRow key={inv.id} investment={inv} canValue={canValue} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<TrendingUp className="h-10 w-10" />}
                title="No investments proposed yet"
                description="Any member can propose one — co_admin/admin then funds it with an Invest capital entry."
              />
            )}
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

function InvestmentRow({ investment, canValue }: { investment: Investment; canValue: boolean }) {
  const gain = investment.currentValue != null ? investment.currentValue - investment.principal : null;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{investment.name}</p>
        <p className="text-xs text-muted-foreground">
          {investment.kind} · {STATUS_LABEL[investment.status]}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <Money value={investment.currentValue ?? investment.principal} className="text-sm font-semibold" />
          {gain !== null && gain !== 0 && (
            <p className={gain > 0 ? 'text-xs text-credit' : 'text-xs text-debit'}>
              {gain > 0 ? '+' : ''}
              <Money value={gain} className={gain > 0 ? 'text-xs text-credit' : 'text-xs text-debit'} />
            </p>
          )}
        </div>
        {canValue && <ValueInvestmentDialog investment={investment} />}
      </div>
    </div>
  );
}

function ProposeInvestmentDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<InvestmentKind | ''>('');
  const [expectedRatePct, setExpectedRatePct] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      investmentsService.proposeInvestment({
        name,
        kind: kind as InvestmentKind,
        expectedRatePct: expectedRatePct ? Number(expectedRatePct) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Investment proposed');
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      setOpen(false);
      setName('');
      setKind('');
      setExpectedRatePct('');
      setNotes('');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to propose investment'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 h-3.5 w-3.5" /> Propose
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose an investment</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="inv-name">Name</Label>
            <Input id="inv-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-kind">Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as InvestmentKind)}>
              <SelectTrigger id="inv-kind">
                <SelectValue placeholder="Select a kind" />
              </SelectTrigger>
              <SelectContent>
                {INVESTMENT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-rate">Expected annual rate % (optional)</Label>
            <Input
              id="inv-rate"
              type="number"
              min="0"
              step="0.01"
              value={expectedRatePct}
              onChange={(e) => setExpectedRatePct(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-notes">Notes (optional)</Label>
            <Textarea id="inv-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending || !name || !kind}>
              Propose
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ValueInvestmentDialog({ investment }: { investment: Investment }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [currentValue, setCurrentValue] = useState(String(investment.currentValue ?? investment.principal));

  const mutation = useMutation({
    mutationFn: () => investmentsService.valueInvestment(investment.id, Number(currentValue)),
    onSuccess: () => {
      toast.success('Investment valued');
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      setOpen(false);
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to value investment'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Value
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark-to-market: {investment.name}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="current-value">Current value (Tk)</Label>
            <Input
              id="current-value"
              type="number"
              min="0"
              step="0.01"
              required
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Principal to date: <Money value={investment.principal} className="text-xs" />
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending || !currentValue}>
              Save valuation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
