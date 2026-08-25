'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Landmark, TrendingUp, RotateCcw, Receipt, FileText, PiggyBank, ArrowLeft } from 'lucide-react';
import { ProtectedRoute, ButtonLoader } from '@/components/common/LoadingStates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { entriesService } from '@/services';
import type { LedgerEntryType } from '@/types';

interface TypeOption {
  type: LedgerEntryType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  needsDualApproval?: boolean;
}

const MONEY_IN: TypeOption[] = [
  { type: 'INTEREST_BANK', label: 'Bank interest', icon: Landmark },
  { type: 'INVESTMENT_RETURN', label: 'Investment return', icon: TrendingUp },
  { type: 'INVESTMENT_PRINCIPAL_BACK', label: 'Investment principal back', icon: RotateCcw },
];

const MONEY_OUT: TypeOption[] = [
  { type: 'BANK_CHARGE', label: 'Bank charge', icon: Receipt },
  { type: 'OPERATIONAL_COST', label: 'Operational cost', icon: FileText },
  { type: 'INVESTMENT_OUT', label: 'Invest capital', icon: PiggyBank, needsDualApproval: true },
];

const CHANNELS = ['BANK', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'INTERNAL', 'OTHER'];

export default function PostEntryPage() {
  return (
    <ProtectedRoute allowedRoles={['co_admin', 'admin']}>
      <PostEntryForm />
    </ProtectedRoute>
  );
}

function PostEntryForm() {
  const router = useRouter();
  const [selected, setSelected] = useState<TypeOption | null>(null);
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [valueDate, setValueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState<string>('');

  const mutation = useMutation({
    mutationFn: () =>
      entriesService.createEntry({
        type: selected!.type,
        amount: Number(amount),
        period,
        valueDate,
        title,
        note: note || undefined,
        channel: channel || undefined,
      }),
    onSuccess: (entry) => {
      toast.success(`Submitted — needs ${entry.requiredApprovals} approval${entry.requiredApprovals > 1 ? 's' : ''}`);
      router.push('/approvals');
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to submit entry'),
  });

  if (!selected) {
    return (
      <div className="space-y-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Entry</h1>
          <p className="text-muted-foreground">What kind of movement is this?</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Money In</p>
          <div className="space-y-2">
            {MONEY_IN.map((option) => (
              <TypeButton key={option.type} option={option} onClick={() => setSelected(option)} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Money Out</p>
          <div className="space-y-2">
            {MONEY_OUT.map((option) => (
              <TypeButton key={option.type} option={option} onClick={() => setSelected(option)} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{selected.label}</h1>
        {selected.needsDualApproval && (
          <p className="text-sm text-pending">Needs 2 approvals, including an admin — any amount.</p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-4 rounded-xl border bg-card p-4"
      >
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (Tk)</Label>
          <Input
            id="amount"
            type="number"
            min="1"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="period">Accounting month</Label>
            <Input id="period" type="month" required value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="valueDate">Value date</Label>
            <Input
              id="valueDate"
              type="date"
              required
              value={valueDate}
              onChange={(e) => setValueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title / reason</Label>
          <Input
            id="title"
            required
            maxLength={200}
            placeholder="e.g. Account maintenance fee"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="channel">Channel (optional)</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger id="channel">
              <SelectValue placeholder="Select a channel" />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <Button type="submit" className="w-full" disabled={mutation.isPending || !amount || !title}>
          {mutation.isPending ? <ButtonLoader /> : 'Submit for approval'}
        </Button>
      </form>
    </div>
  );
}

function TypeButton({ option, onClick }: { option: TypeOption; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-accent'
      )}
    >
      <div className="flex items-center gap-3">
        <option.icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{option.label}</span>
      </div>
      {option.needsDualApproval && <span className="text-xs text-pending">needs 2 approvals</span>}
    </button>
  );
}
