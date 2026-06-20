'use client';

import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageLoader, ButtonLoader } from '@/components/common/LoadingStates';
import { EmptyState } from '@/components/common/EmptyState';
import { bankAccountsService } from '@/services';

const bankAccountSchema = z.object({
  bankName: z.string().min(2, 'Bank name must be at least 2 characters'),
  accountNumber: z.string().min(5, 'Account number must be at least 5 characters'),
  accountHolderName: z.string().optional(),
  branchName: z.string().optional(),
  routingNumber: z.string().optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

type BankAccountFormData = z.infer<typeof bankAccountSchema>;

export default function EditBankAccountPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const accountId = params.id as string;

  // Fetch existing bank account
  const { data: account, isLoading, isError } = useQuery({
    queryKey: ['bankAccounts', accountId],
    queryFn: () => bankAccountsService.getBankAccount(accountId),
    enabled: !!accountId,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<BankAccountFormData>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: {
      bankName: '',
      accountNumber: '',
      accountHolderName: '',
      branchName: '',
      routingNumber: '',
      isPrimary: false,
      isActive: true,
    },
  });

  const isActive = watch('isActive');
  const isPrimary = watch('isPrimary');

  // Populate form when data loads
  useEffect(() => {
    if (account) {
      reset({
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountHolderName: account.accountHolderName || '',
        branchName: account.branchName || '',
        routingNumber: account.routingNumber || '',
        isPrimary: account.isPrimary || false,
        isActive: account.isActive,
      });
    }
  }, [account, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: BankAccountFormData) =>
      bankAccountsService.updateBankAccount(accountId, data),
    onSuccess: () => {
      toast.success('Bank account updated successfully');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      router.push('/bank-accounts');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to update bank account';
      toast.error('Failed to update account', { description: message });
    },
  });

  const onSubmit = (data: BankAccountFormData) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return <PageLoader />;
  }

  if (isError || !account) {
    return (
      <EmptyState
        title="Account not found"
        description="The bank account you're looking for doesn't exist or has been deleted."
        action={
          <Button onClick={() => router.push('/bank-accounts')}>
            Back to Bank Accounts
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="mb-4 -ml-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Edit Bank Account</h1>
        <p className="text-muted-foreground mt-1">
          Update your bank account details
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Bank Name */}
        <div className="space-y-2">
          <Label htmlFor="bankName">
            Bank Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="bankName"
            placeholder="e.g., Dutch-Bangla Bank"
            {...register('bankName')}
          />
          {errors.bankName && (
            <p className="text-sm text-destructive">{errors.bankName.message}</p>
          )}
        </div>

        {/* Account Number */}
        <div className="space-y-2">
          <Label htmlFor="accountNumber">
            Account Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="accountNumber"
            placeholder="Enter account number"
            {...register('accountNumber')}
          />
          {errors.accountNumber && (
            <p className="text-sm text-destructive">{errors.accountNumber.message}</p>
          )}
        </div>

        {/* Account Holder Name */}
        <div className="space-y-2">
          <Label htmlFor="accountHolderName">Account Holder Name</Label>
          <Input
            id="accountHolderName"
            placeholder="Enter account holder name"
            {...register('accountHolderName')}
          />
          {errors.accountHolderName && (
            <p className="text-sm text-destructive">
              {errors.accountHolderName.message}
            </p>
          )}
        </div>

        {/* Branch Name */}
        <div className="space-y-2">
          <Label htmlFor="branchName">Branch Name</Label>
          <Input
            id="branchName"
            placeholder="e.g., Gulshan Branch"
            {...register('branchName')}
          />
          {errors.branchName && (
            <p className="text-sm text-destructive">{errors.branchName.message}</p>
          )}
        </div>

        {/* Routing Number */}
        <div className="space-y-2">
          <Label htmlFor="routingNumber">Routing Number</Label>
          <Input
            id="routingNumber"
            placeholder="Enter routing number (if applicable)"
            {...register('routingNumber')}
          />
          {errors.routingNumber && (
            <p className="text-sm text-destructive">{errors.routingNumber.message}</p>
          )}
        </div>

        {/* Primary Status */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label htmlFor="isPrimary" className="text-base font-medium">
              Primary Account
            </Label>
            <p className="text-sm text-muted-foreground">
              Make this your primary bank account for all transactions
            </p>
          </div>
          <Switch
            id="isPrimary"
            checked={isPrimary}
            onCheckedChange={(checked) => {
              setValue('isPrimary', checked);
            }}
          />
        </div>

        {/* Active Status */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <Label htmlFor="isActive" className="text-base font-medium">
              Active Account
            </Label>
            <p className="text-sm text-muted-foreground">
              Only active accounts can be used for payments
            </p>
          </div>
          <Switch
            id="isActive"
            checked={isActive}
            onCheckedChange={(checked) => setValue('isActive', checked)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={updateMutation.isPending || !isDirty}
            className="flex-1"
          >
            {updateMutation.isPending ? (
              <ButtonLoader />
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
