'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  CalendarIcon,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Money } from '@/components/common/Money';
import { cn } from '@/lib/utils';
import { transfersService, bankAccountsService } from '@/services';
import { ButtonLoader } from '@/components/common/LoadingStates';

// Transfer constants
const TRANSFER_CHANNELS = ['BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'OTHER'] as const;
const MONTHLY_AMOUNT = 3000; // Expected monthly amount per website rules

const submitPaymentSchema = z.object({
  transferDate: z.date({ message: 'Transfer date is required' }),
  selectMonth: z.string().min(1, 'Please select a contribution month (e.g., 2026-07)'),
  isFlexSelected: z.boolean(),
  flexAmount: z.number().min(0).optional(),
  transferChannel: z.enum(['BANK_TRANSFER', 'BKASH', 'NAGAD', 'ROCKET', 'CASH', 'OTHER'], { message: 'Please select a transfer channel' }),
  bankAccountId: z.string().optional(),
  accountName: z.string().optional(),
  accountNumber: z.string().optional(),
  bankName: z.string().optional(),
  remarks: z.string().optional(),
  paymentProofUrl: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.transferChannel === 'BANK_TRANSFER' && !data.bankAccountId && (!data.accountName || !data.accountNumber || !data.bankName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Bank connection details are required for bank transfers',
      path: ['transferChannel'],
    });
  }

  // They either need to select to submit monthly payment, flexible payment, or both
  // Usually the submission UI auto calculates based on flex amount checkboxes, so this serves as a safeguard
  if (!data.selectMonth && !data.isFlexSelected) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Must contribute towards a specified Month or Flexible payment minimum.',
      path: ['selectMonth']
    })
  }

  if (data.isFlexSelected && (!data.flexAmount || data.flexAmount <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Flexible amount must be greater than 0 if selected',
      path: ['flexAmount']
    })
  }
});

type SubmitPaymentFormData = z.infer<typeof submitPaymentSchema>;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit

const STEPS = [
  { key: 'what', label: 'What' },
  { key: 'proof', label: 'How + Proof' },
  { key: 'confirm', label: 'Confirm' },
] as const;

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="mb-6 flex items-center">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                i < step
                  ? 'border-primary bg-primary text-primary-foreground'
                  : i === step
                    ? 'border-primary text-primary'
                    : 'border-border text-muted-foreground'
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('text-xs', i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn('mx-2 h-0.5 flex-1', i < step ? 'bg-primary' : 'bg-border')} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function SubmitPaymentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // This checkbox lets the user decide if they're paying monthly alongside flex
  const [isMonthlySelected, setIsMonthlySelected] = useState(true);

  const { data: bankAccountsResponse, isLoading: isLoadingBanks } = useQuery({
    queryKey: ['bankAccounts'],
    queryFn: () => bankAccountsService.getUserBankAccounts(),
  });

  const respAny = bankAccountsResponse as any;
  const bankAccounts = Array.isArray(bankAccountsResponse) ? bankAccountsResponse : (respAny?.data || []);
  const primaryBank = bankAccounts.find((bank: any) => bank.isPrimary)?.id || (bankAccounts.length > 0 ? bankAccounts[0].id : undefined);

  const currentYear = new Date().getFullYear();
  const monthOptions = Array.from({ length: 24 }).map((_, i) => {
    const d = new Date(currentYear, i, 1);
    return {
      label: format(d, 'MMMM yyyy'),
      value: format(d, 'yyyy-MM'),
    };
  });

  const form: any = useForm<SubmitPaymentFormData>({
    resolver: zodResolver(submitPaymentSchema),
    defaultValues: {
      transferDate: new Date(),
      selectMonth: format(new Date(), 'yyyy-MM'),
      isFlexSelected: false,
      flexAmount: 0,
      transferChannel: 'BANK_TRANSFER',
      bankAccountId: primaryBank,
    },
  });

  const { watch, setValue, trigger } = form;
  const watchChannel = watch('transferChannel');
  const watchBankAccountId = watch('bankAccountId');
  const watchFlexSelected = watch('isFlexSelected');
  const watchFlexAmount = watch('flexAmount') || 0;
  const watchSelectMonth = watch('selectMonth');
  const watchTransferDate = watch('transferDate');
  const watchRemarks = watch('remarks');

  const isBankTransfer = watchChannel === 'BANK_TRANSFER';
  const showNewBankFields = isBankTransfer && watchBankAccountId === 'new';

  const monthlyAmountValue = isMonthlySelected ? MONTHLY_AMOUNT : 0;
  const flexAmountValue = watchFlexSelected ? watchFlexAmount : 0;
  const totalAmount = monthlyAmountValue + flexAmountValue;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadProofImage = async (file: File): Promise<{ url: string; publicId: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('selectMonth', form.getValues('selectMonth'));
    return transfersService.uploadProof(formData);
  };

  const submitMutation = useMutation({
    mutationFn: (data: any) => transfersService.submitPayment(data),
    onSuccess: () => {
      toast.success('Payment submitted successfully!');
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['summaries'] });
      router.push('/payments');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to submit payment');
    },
  });

  const onSubmit = async (data: SubmitPaymentFormData) => {
    if (!selectedFile && !data.paymentProofUrl) {
      toast.error('Please upload a payment proof image');
      return;
    }

    if (totalAmount <= 0) {
      toast.error('Total amount must be greater than 0');
      return;
    }

    try {
      let finalProofUrl = data.paymentProofUrl;
      let paymentProofPublicId: string | undefined;

      if (selectedFile) {
        setIsUploading(true);
        const uploadResult = await uploadProofImage(selectedFile);
        finalProofUrl = uploadResult.url;
        paymentProofPublicId = uploadResult.publicId;
        setIsUploading(false);
      }

      const payload: any = {
        transferDate: data.transferDate.toISOString(),
        selectMonth: data.selectMonth,
        transferChannel: data.transferChannel,
        monthlyAmount: isMonthlySelected ? MONTHLY_AMOUNT : 0,
        flexAmount: data.isFlexSelected ? data.flexAmount : 0,
        totalAmount: totalAmount,
        paymentProofUrl: finalProofUrl,
        paymentProofPublicId,
        remarks: data.remarks,
      };

      if (data.transferChannel === 'BANK_TRANSFER') {
        if (data.bankAccountId && data.bankAccountId !== 'new') {
          payload.bankAccountId = data.bankAccountId;
          const selectedBank = bankAccounts.find((b: any) => b.id === data.bankAccountId);
          if (selectedBank) {
            payload.accountName = selectedBank.accountHolderName;
            payload.accountNumber = selectedBank.accountNumber;
            payload.bankName = selectedBank.bankName;
          }
        } else {
          payload.accountName = data.accountName;
          payload.accountNumber = data.accountNumber;
          payload.bankName = data.bankName;
        }
      }

      submitMutation.mutate(payload);
    } catch {
      setIsUploading(false);
      toast.error('Failed to upload proof image. Please try again.');
    }
  };

  const isPending = submitMutation.isPending || isUploading;

  const goNext = async () => {
    if (step === 0) {
      const valid = await trigger(['selectMonth', 'transferDate', 'isFlexSelected', 'flexAmount']);
      if (!valid || totalAmount <= 0) {
        if (totalAmount <= 0) toast.error('Configure a payment amount greater than 0');
        return;
      }
    }
    if (step === 1) {
      const valid = await trigger(['transferChannel', 'bankAccountId', 'bankName', 'accountName', 'accountNumber']);
      if (!valid) return;
      if (!selectedFile && !form.getValues('paymentProofUrl')) {
        toast.error('Please add a payment proof screenshot');
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    if (step === 0) {
      router.back();
    } else {
      setStep((s) => Math.max(s - 1, 0));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <Button variant="ghost" size="sm" onClick={goBack} className="mb-4 -ml-2 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Pay for {format(watchTransferDate || new Date(), 'MMMM yyyy')}</h1>
      </div>

      <StepIndicator step={step} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">
          {/* Step 1 — What */}
          {step === 0 && (
            <div className="space-y-4 rounded-xl border bg-card p-5">
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="selectMonth"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>{isMonthlySelected ? 'Contribution Month' : 'Reference Month'}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Month" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-75">
                          {monthOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="transferDate"
                  render={({ field }: any) => (
                    <FormItem className="flex flex-col pt-2.5">
                      <FormLabel>Date of Transfer</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                              {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="mt-2 space-y-4 border-t pt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox id="monthlyCb" checked={isMonthlySelected} onCheckedChange={(c: any) => setIsMonthlySelected(!!c)} />
                  <label htmlFor="monthlyCb" className="text-sm font-medium">
                    Monthly Payment (Tk. {MONTHLY_AMOUNT.toLocaleString()})
                  </label>
                </div>

                <div className="space-y-3 pl-1">
                  <FormField
                    control={form.control}
                    name="isFlexSelected"
                    render={({ field }: any) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="cursor-pointer font-medium">Add Flexible (Yearly) Amount</FormLabel>
                      </FormItem>
                    )}
                  />
                  {watchFlexSelected && (
                    <div className="pl-6 pt-1">
                      <FormField
                        control={form.control}
                        name="flexAmount"
                        render={({ field }: any) => (
                          <FormItem>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">Tk.</span>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  className="pl-8 text-base!"
                                  {...field}
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <span className="font-semibold text-primary">Total</span>
                  <Money value={totalAmount} className="text-xl font-bold" />
                </div>
                {totalAmount <= 0 && <p className="text-sm font-medium text-destructive">Configure a payment amount greater than 0.</p>}
              </div>
            </div>
          )}

          {/* Step 2 — How + Proof */}
          {step === 1 && (
            <div className="space-y-6 rounded-xl border bg-card p-5">
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="transferChannel"
                  render={({ field }: any) => (
                    <FormItem>
                      <FormLabel>Transfer Method</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                          <SelectItem value="CASH">Cash Deposit</SelectItem>
                          <SelectItem value="BKASH">bKash</SelectItem>
                          <SelectItem value="NAGAD">Nagad</SelectItem>
                          <SelectItem value="ROCKET">Rocket</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isBankTransfer && (
                  <FormField
                    control={form.control}
                    name="bankAccountId"
                    render={({ field }: any) => (
                      <FormItem>
                        <FormLabel>From Account</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingBanks}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select saved account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {bankAccounts.map((bank: any) => (
                              <SelectItem key={bank.id} value={bank.id}>
                                {bank.bankName} (...{bank.accountNumber?.slice(-4)})
                              </SelectItem>
                            ))}
                            <SelectItem value="new">Use a new account</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {showNewBankFields && (
                <div className="grid gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }: any) => (
                      <FormItem>
                        <FormLabel>Bank Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. City Bank" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accountName"
                    render={({ field }: any) => (
                      <FormItem>
                        <FormLabel>Account Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accountNumber"
                    render={({ field }: any) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Account Number</FormLabel>
                        <FormControl>
                          <Input placeholder="1234567890" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold">
                  <Upload className="h-4 w-4 text-primary" />
                  Proof of Payment <span className="text-xs font-normal text-muted-foreground">required</span>
                </h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div
                    className={cn(
                      'relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
                      previewUrl ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25 hover:bg-muted/50'
                    )}
                    onClick={() => document.getElementById('proof-upload')?.click()}
                  >
                    {previewUrl ? (
                      <div className="relative w-full overflow-hidden rounded-md pt-[56.25%]">
                        <img src={previewUrl} alt="Preview" className="absolute inset-0 h-full w-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                          <p className="text-sm font-medium text-white">Click to change</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-full bg-primary/10 p-3">
                          <ImageIcon className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Click to upload image</p>
                          <p className="text-xs text-muted-foreground">JPEG, PNG up to 5MB</p>
                        </div>
                      </>
                    )}
                    <input
                      id="proof-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="remarks"
                    render={({ field }: any) => (
                      <FormItem>
                        <FormLabel>Note (optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Any additional information..." className="min-h-35 resize-none" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Confirm */}
          {step === 2 && (
            <div className="space-y-4 rounded-xl border bg-card p-5">
              <h3 className="font-semibold">Review before you submit</h3>
              <div className="divide-y rounded-lg border">
                <SummaryRow label="Month" value={watchSelectMonth} />
                <SummaryRow label="Transfer date" value={format(watchTransferDate || new Date(), 'PPP')} />
                {isMonthlySelected && <SummaryRow label="Monthly" value={`Tk. ${MONTHLY_AMOUNT.toLocaleString()}`} />}
                {watchFlexSelected && <SummaryRow label="Flexible" value={`Tk. ${watchFlexAmount.toLocaleString()}`} />}
                <SummaryRow label="Total" value={<Money value={totalAmount} className="font-semibold" />} />
                <SummaryRow label="Method" value={watchChannel.replaceAll('_', ' ')} />
                <SummaryRow label="Proof" value={previewUrl ? 'Attached ✓' : 'Not attached'} />
                {watchRemarks && <SummaryRow label="Note" value={watchRemarks} />}
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-2">
            <Button type="button" variant="outline" onClick={goBack} disabled={isPending} className="flex-1">
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" className="flex-1" onClick={goNext}>
                Continue
              </Button>
            ) : (
              <Button type="submit" className="flex-1" disabled={isPending || totalAmount <= 0}>
                {isPending ? (
                  <>
                    <ButtonLoader />
                    <span className="ml-2">{isUploading ? 'Uploading...' : 'Submitting...'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Submit Payment
                  </>
                )}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
