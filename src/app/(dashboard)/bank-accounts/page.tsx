'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Plus,
  CreditCard,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/common/EmptyState';
import { CardLoader, ButtonLoader } from '@/components/common/LoadingStates';
import { cn } from '@/lib/utils';
import { bankAccountsService } from '@/services';
import type { BankAccount } from '@/types';

export default function BankAccountsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);

  // Fetch user's bank accounts
  const { data: bankAccounts, isLoading, isError } = useQuery({
    queryKey: ['bankAccounts', 'user'],
    queryFn: () => bankAccountsService.getUserBankAccounts(),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => bankAccountsService.deleteBankAccount(id),
    onSuccess: () => {
      toast.success('Bank account deleted');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to delete bank account';
      toast.error('Delete failed', { description: message });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      bankAccountsService.updateBankAccount(id, { isActive }),
    onSuccess: (_, { isActive }) => {
      toast.success(isActive ? 'Account activated' : 'Account deactivated');
      queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to update bank account';
      toast.error('Update failed', { description: message });
    },
  });

  const handleToggleActive = (account: BankAccount) => {
    toggleActiveMutation.mutate({ id: account.id, isActive: !account.isActive });
  };

  const activeAccounts = bankAccounts?.filter((acc) => acc.isActive) || [];
  const inactiveAccounts = bankAccounts?.filter((acc) => !acc.isActive) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bank Accounts</h1>
          <p className="text-muted-foreground">
            Manage your bank accounts for payments
          </p>
        </div>
        <Button onClick={() => router.push('/bank-accounts/add')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <CardLoader key={i} />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Failed to load accounts"
          description="Something went wrong while fetching your bank accounts."
          action={
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          }
        />
      ) : bankAccounts?.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-12 w-12" />}
          title="No bank accounts"
          description="Add your first bank account to start submitting payments."
          action={
            <Button onClick={() => router.push('/bank-accounts/add')}>
              <Plus className="mr-2 h-4 w-4" />
              Add Bank Account
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Active Accounts */}
          {activeAccounts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Active Accounts ({activeAccounts.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeAccounts.map((account) => (
                  <BankAccountCard
                    key={account.id}
                    account={account}
                    onEdit={() => router.push(`/bank-accounts/${account.id}/edit`)}
                    onDelete={() => setDeleteTarget(account)}
                    onToggleActive={() => handleToggleActive(account)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Inactive Accounts */}
          {inactiveAccounts.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Inactive Accounts ({inactiveAccounts.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inactiveAccounts.map((account) => (
                  <BankAccountCard
                    key={account.id}
                    account={account}
                    onEdit={() => router.push(`/bank-accounts/${account.id}/edit`)}
                    onDelete={() => setDeleteTarget(account)}
                    onToggleActive={() => handleToggleActive(account)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Bank Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this bank account? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="font-medium">{deleteTarget.bankName}</p>
              <p className="text-sm text-muted-foreground">
                {deleteTarget.accountNumber}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <ButtonLoader /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Bank Account Card Component
function BankAccountCard({
  account,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  account: BankAccount;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 transition-colors',
        !account.isActive && 'opacity-60'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-muted p-2.5">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{account.bankName}</p>
              {account.isPrimary && (
                <span className="inline-flex items-center rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
                  Primary
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              {account.accountNumber}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleActive}>
              {account.isActive ? (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Deactivate
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Activate
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Account Holder */}
      {account.accountHolderName && (
        <p className="mt-3 text-sm text-muted-foreground">
          {account.accountHolderName}
        </p>
      )}

      {/* Status & Dates */}
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
            account.isActive
              ? 'bg-green-500/10 text-green-600 dark:text-green-500'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {account.isActive ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              Active
            </>
          ) : (
            <>
              <XCircle className="h-3 w-3" />
              Inactive
            </>
          )}
        </span>
        <span>Added {format(new Date(account.createdAt), 'MMM d, yyyy')}</span>
      </div>
    </div>
  );
}
