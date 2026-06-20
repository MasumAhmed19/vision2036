'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Settings,
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Calendar,
  Wallet,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/common/EmptyState';
import { CardLoader, ButtonLoader, ProtectedRoute } from '@/components/common/LoadingStates';
import { cn } from '@/lib/utils';
import { policiesService } from '@/services';
import type { Policy } from '@/types';

// Generate years from 2024 to current year + 5
const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = 2024; year <= currentYear + 5; year++) {
    years.push(year);
  }
  return years;
};

const YEARS = generateYears();

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const policySchema = z.object({
  year: z.number({ message: 'Year is required' }),
  monthlyAmount: z.number({ message: 'Monthly amount is required' }).positive('Must be positive'),
  yearlyFlexibleAmount: z.number({ message: 'Yearly amount is required' }).positive('Must be positive'),
  paymentDeadlineDay: z.number().min(1).max(28).optional(),
  flexibleHalfDeadlineMonth: z.number().min(1).max(12).optional(),
  isActive: z.boolean(),
});

type PolicyFormData = z.infer<typeof policySchema>;

export default function PoliciesPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <PoliciesContent />
    </ProtectedRoute>
  );
}

function PoliciesContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Policy | null>(null);

  // Fetch all policies
  const { data: policies, isLoading, isError } = useQuery({
    queryKey: ['policies'],
    queryFn: () => policiesService.getAllPolicies(),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: PolicyFormData) => policiesService.createPolicy(data),
    onSuccess: () => {
      toast.success('Policy created successfully');
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setShowCreateDialog(false);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to create policy';
      toast.error('Creation failed', { description: message });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PolicyFormData> }) =>
      policiesService.updatePolicy(id, data),
    onSuccess: () => {
      toast.success('Policy updated successfully');
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setEditTarget(null);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to update policy';
      toast.error('Update failed', { description: message });
    },
  });

  const activePolicy = policies?.find((p) => p.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/admin')}
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Admin Dashboard
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Contribution Policies</h1>
          <p className="text-muted-foreground">
            Manage yearly contribution policies and amounts
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Policy
        </Button>
      </div>

      {/* Active Policy Highlight */}
      {activePolicy && (
        <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <span className="font-semibold text-primary">Active Policy</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Year</p>
              <p className="text-2xl font-bold">{activePolicy.year}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Amount</p>
              <p className="text-2xl font-bold">
                Tk. {activePolicy.monthlyAmount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Yearly Flexible Min</p>
              <p className="text-2xl font-bold">
                Tk. {activePolicy.yearlyFlexibleAmount.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-primary/20 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Payment deadline: Day {activePolicy.paymentDeadlineDay || 10}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Half-year deadline: {MONTHS.find((m) => m.value === (activePolicy.flexibleHalfDeadlineMonth || 6))?.label}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditTarget(activePolicy)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <CardLoader key={i} />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Failed to load policies"
          description="Something went wrong while fetching policies."
          action={
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          }
        />
      ) : !policies || policies.length === 0 ? (
        <EmptyState
          icon={<Settings className="h-12 w-12" />}
          title="No policies yet"
          description="Create your first contribution policy to get started."
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Policy
            </Button>
          }
        />
      ) : (
        <>
          <h2 className="text-lg font-semibold">All Policies</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {policies.map((policy) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                onEdit={() => setEditTarget(policy)}
              />
            ))}
          </div>
        </>
      )}

      {/* Create Policy Dialog */}
      <PolicyDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
        title="Create Policy"
        description="Create a new contribution policy for a specific year"
      />

      {/* Edit Policy Dialog */}
      <PolicyDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={(data) => editTarget && updateMutation.mutate({ id: editTarget.id, data })}
        isPending={updateMutation.isPending}
        title="Edit Policy"
        description="Update the contribution policy settings"
        defaultValues={editTarget || undefined}
      />
    </div>
  );
}

// Policy Card Component
function PolicyCard({
  policy,
  onEdit,
}: {
  policy: Policy;
  onEdit: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 transition-colors',
        policy.isActive && 'border-primary/30'
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold">{policy.year}</p>
            {policy.isActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <CheckCircle2 className="h-3 w-3" />
                Active
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Created {format(new Date(policy.createdAt), 'MMM d, yyyy')}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Monthly</p>
          <p className="font-semibold">Tk. {policy.monthlyAmount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Yearly Min</p>
          <p className="font-semibold">Tk. {policy.yearlyFlexibleAmount.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

// Policy Form Dialog
function PolicyDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  title,
  description,
  defaultValues,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PolicyFormData) => void;
  isPending: boolean;
  title: string;
  description: string;
  defaultValues?: Policy;
}) {
  const form = useForm<PolicyFormData>({
    resolver: zodResolver(policySchema),
    defaultValues: defaultValues
      ? {
        year: defaultValues.year,
        monthlyAmount: defaultValues.monthlyAmount,
        yearlyFlexibleAmount: defaultValues.yearlyFlexibleAmount,
        paymentDeadlineDay: defaultValues.paymentDeadlineDay,
        flexibleHalfDeadlineMonth: defaultValues.flexibleHalfDeadlineMonth,
        isActive: defaultValues.isActive,
      }
      : {
        year: new Date().getFullYear(),
        monthlyAmount: 3000,
        yearlyFlexibleAmount: 14000,
        paymentDeadlineDay: 10,
        flexibleHalfDeadlineMonth: 6,
        isActive: true,
      },
  });

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = form;
  const isActive = watch('isActive');

  // Reset form when defaultValues change
  useState(() => {
    if (defaultValues) {
      reset({
        year: defaultValues.year,
        monthlyAmount: defaultValues.monthlyAmount,
        yearlyFlexibleAmount: defaultValues.yearlyFlexibleAmount,
        paymentDeadlineDay: defaultValues.paymentDeadlineDay,
        flexibleHalfDeadlineMonth: defaultValues.flexibleHalfDeadlineMonth,
        isActive: defaultValues.isActive,
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Year */}
          <div className="space-y-2">
            <Label>Year</Label>
            <Controller
              name="year"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value?.toString()}
                  onValueChange={(v) => field.onChange(parseInt(v))}
                  disabled={!!defaultValues}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.year && (
              <p className="text-sm text-destructive">{errors.year.message}</p>
            )}
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Monthly Amount (Tk.)</Label>
              <Controller
                name="monthlyAmount"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                )}
              />
              {errors.monthlyAmount && (
                <p className="text-sm text-destructive">{errors.monthlyAmount.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Yearly Min (Tk.)</Label>
              <Controller
                name="yearlyFlexibleAmount"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                )}
              />
              {errors.yearlyFlexibleAmount && (
                <p className="text-sm text-destructive">{errors.yearlyFlexibleAmount.message}</p>
              )}
            </div>
          </div>

          {/* Deadlines */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Payment Deadline Day</Label>
              <Controller
                name="paymentDeadlineDay"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 10)}
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Half-Year Deadline</Label>
              <Controller
                name="flexibleHalfDeadlineMonth"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value?.toString()}
                    onValueChange={(v) => field.onChange(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((month) => (
                        <SelectItem key={month.value} value={month.value.toString()}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base font-medium">Active Policy</Label>
              <p className="text-sm text-muted-foreground">
                Set as the current active policy
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={(checked) => setValue('isActive', checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <ButtonLoader /> : defaultValues ? 'Save Changes' : 'Create Policy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
