'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Landmark, TrendingUp, RotateCcw, Receipt, FileText, PiggyBank, ArrowLeft, Upload, X } from 'lucide-react';
import { ProtectedRoute, ButtonLoader } from '@/components/common/LoadingStates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { entriesService, investmentsService } from '@/services';
import type { LedgerEntryType } from '@/types';

const INVESTMENT_LINKED_TYPES: LedgerEntryType[] = ['INVESTMENT_OUT', 'INVESTMENT_RETURN', 'INVESTMENT_PRINCIPAL_BACK'];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Cost-side entries get proof filed as a RECEIPT; bank/investment-income
// entries get proof filed as a STATEMENT (a bank statement line or transfer
// confirmation, not a receipt) — matches ILedgerAttachment.kind's intent.
const PROOF_KIND: Partial<Record<LedgerEntryType, 'RECEIPT' | 'STATEMENT'>> = {
  BANK_CHARGE: 'RECEIPT',
  OPERATIONAL_COST: 'RECEIPT',
  INTEREST_BANK: 'STATEMENT',
  INVESTMENT_RETURN: 'STATEMENT',
  INVESTMENT_PRINCIPAL_BACK: 'STATEMENT',
  INVESTMENT_OUT: 'STATEMENT',
};

interface TypeOption {
  type: LedgerEntryType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

// Invest capital and investment principal back are admin-only — the
// largest, least-reversible sums the fund moves. Everything else here is
// co_admin-or-admin. No type needs a second approver anymore; whoever posts
// it is done, it's live immediately (see /api/entries).
const MONEY_IN: TypeOption[] = [
  { type: 'INTEREST_BANK', label: 'Bank interest', icon: Landmark },
  { type: 'INVESTMENT_RETURN', label: 'Investment return', icon: TrendingUp },
  { type: 'INVESTMENT_PRINCIPAL_BACK', label: 'Investment principal back', icon: RotateCcw, adminOnly: true },
];

const MONEY_OUT: TypeOption[] = [
  { type: 'BANK_CHARGE', label: 'Bank charge', icon: Receipt },
  { type: 'OPERATIONAL_COST', label: 'Operational cost', icon: FileText },
  { type: 'INVESTMENT_OUT', label: 'Invest capital', icon: PiggyBank, adminOnly: true },
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
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const visibleMoneyIn = MONEY_IN.filter((o) => !o.adminOnly || isAdmin);
  const visibleMoneyOut = MONEY_OUT.filter((o) => !o.adminOnly || isAdmin);
  const [selected, setSelected] = useState<TypeOption | null>(null);
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [valueDate, setValueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState<string>('');
  const [investmentId, setInvestmentId] = useState<string>('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);

  const isInvestmentLinked = !!selected && INVESTMENT_LINKED_TYPES.includes(selected.type);

  const { data: investments } = useQuery({
    queryKey: ['investments'],
    queryFn: () => investmentsService.getInvestments(),
    enabled: isInvestmentLinked,
  });

  const handleProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File must be less than 5MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPEG, PNG)');
      return;
    }

    setProofFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setProofPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearProof = () => {
    setProofFile(null);
    setProofPreview(null);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let attachments: { url: string; publicId?: string; kind: 'RECEIPT' | 'STATEMENT' }[] | undefined;

      if (proofFile) {
        setIsUploadingProof(true);
        try {
          const formData = new FormData();
          formData.append('file', proofFile);
          formData.append('label', selected!.type);
          const uploaded = await entriesService.uploadProof(formData);
          attachments = [{ url: uploaded.url, publicId: uploaded.publicId, kind: PROOF_KIND[selected!.type] || 'RECEIPT' }];
        } finally {
          setIsUploadingProof(false);
        }
      }

      return entriesService.createEntry({
        type: selected!.type,
        amount: Number(amount),
        period,
        valueDate,
        title,
        note: note || undefined,
        channel: channel || undefined,
        investmentId: isInvestmentLinked ? investmentId : undefined,
        attachments,
      });
    },
    onSuccess: () => {
      toast.success('Entry posted');
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
            {visibleMoneyIn.map((option) => (
              <TypeButton key={option.type} option={option} onClick={() => setSelected(option)} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Money Out</p>
          <div className="space-y-2">
            {visibleMoneyOut.map((option) => (
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
        {selected.adminOnly && <p className="text-sm text-pending">Admin only — posts immediately.</p>}
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

        {isInvestmentLinked && (
          <div className="space-y-2">
            <Label htmlFor="investment">Investment</Label>
            <Select value={investmentId} onValueChange={setInvestmentId}>
              <SelectTrigger id="investment">
                <SelectValue placeholder={investments?.length ? 'Select an investment' : 'No investments proposed yet'} />
              </SelectTrigger>
              <SelectContent>
                {investments?.map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.name} ({inv.kind.toLowerCase()}, {inv.status.toLowerCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {investments?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Propose it first from the Fund tab, then come back here to fund it.
              </p>
            )}
          </div>
        )}

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

        <div className="space-y-2">
          <Label>Add proof (optional)</Label>
          {proofPreview ? (
            <div className="relative overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proofPreview} alt="Proof preview" className="max-h-48 w-full object-contain bg-muted" />
              <button
                type="button"
                onClick={clearProof}
                className="absolute right-2 top-2 rounded-full bg-background/90 p-1 shadow"
                aria-label="Remove proof"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => document.getElementById('proof-upload')?.click()}
              className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:bg-accent"
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium">Click to add a screenshot</p>
              <p className="text-xs text-muted-foreground">Optional — a bank statement, receipt, or transfer proof</p>
            </button>
          )}
          <input
            id="proof-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleProofSelect}
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={mutation.isPending || isUploadingProof || !amount || !title || (isInvestmentLinked && !investmentId)}
        >
          {mutation.isPending || isUploadingProof ? <ButtonLoader /> : 'Post entry'}
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
      {option.adminOnly && <span className="text-xs text-pending">admin only</span>}
    </button>
  );
}
