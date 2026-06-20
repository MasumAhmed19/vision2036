'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DollarSign, Plus, Receipt, RefreshCw, Trash2, Pencil, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ProtectedRoute, CardLoader } from '@/components/common/LoadingStates';
import { EmptyState, FileUpload } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { costsService } from '@/services';
import type { Cost, CostCategory } from '@/types';

const CATEGORIES: Array<{ value: CostCategory; label: string }> = [
  { value: 'bank_charge', label: 'Bank Charge' },
  { value: 'investment', label: 'Investment' },
  { value: 'operational', label: 'Operational' },
  { value: 'other', label: 'Other' },
];

const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = 2024; year <= currentYear + 1; year++) {
    years.push(year);
  }
  return years.reverse();
};

const YEARS = generateYears();

type CostFormState = {
  amount: string;
  date: string;
  reason: string;
  category: CostCategory;
  receiptImage?: string;
  receiptImagePublicId?: string;
};

const emptyForm = (): CostFormState => ({
  amount: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  reason: '',
  category: 'other',
  receiptImage: undefined,
  receiptImagePublicId: undefined,
});

export default function AdminCostsPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'admin']}>
      <AdminCostsContent />
    </ProtectedRoute>
  );
}

function AdminCostsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [category, setCategory] = useState<'all' | CostCategory>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<Cost | null>(null);
  const [form, setForm] = useState<CostFormState>(emptyForm());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('year', String(year));
    if (category !== 'all') params.set('category', category);
    return params.toString();
  }, [year, category]);

  const { data: costs = [], isLoading, isError } = useQuery({
    queryKey: ['costs', queryString],
    queryFn: () => costsService.getCosts(queryString),
  });

  const createMutation = useMutation({
    mutationFn: costsService.createCost,
    onSuccess: () => {
      toast.success('Cost added successfully');
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ['costs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['monthlySummaries'] });
      queryClient.invalidateQueries({ queryKey: ['globalSummary'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to add cost');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => costsService.updateCost(id, data),
    onSuccess: () => {
      toast.success('Cost updated successfully');
      closeDialog();
      queryClient.invalidateQueries({ queryKey: ['costs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['monthlySummaries'] });
      queryClient.invalidateQueries({ queryKey: ['globalSummary'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update cost');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => costsService.deleteCost(id),
    onSuccess: () => {
      toast.success('Cost deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['costs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['monthlySummaries'] });
      queryClient.invalidateQueries({ queryKey: ['globalSummary'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete cost');
    },
  });

  const retrySyncMutation = useMutation({
    mutationFn: (id: string) => costsService.retrySync(id),
    onSuccess: () => {
      toast.success('Cost synced successfully');
      queryClient.invalidateQueries({ queryKey: ['costs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'admin'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to sync cost');
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingCost(null);
    setForm(emptyForm());
    setReceiptFile(null);
  };

  const openCreate = () => {
    setEditingCost(null);
    setForm(emptyForm());
    setReceiptFile(null);
    setIsDialogOpen(true);
  };

  const openEdit = (cost: Cost) => {
    setEditingCost(cost);
    setForm({
      amount: String(cost.amount),
      date: format(new Date(cost.date), 'yyyy-MM-dd'),
      reason: cost.reason,
      category: cost.category,
      receiptImage: cost.receiptImage,
      receiptImagePublicId: cost.receiptImagePublicId,
    });
    setReceiptFile(null);
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.amount || !form.date || !form.reason.trim()) {
      toast.error('Amount, date, and reason are required');
      return;
    }

    let receiptImage = form.receiptImage;
    let receiptImagePublicId = form.receiptImagePublicId;

    if (receiptFile) {
      const uploadData = new FormData();
      uploadData.append('file', receiptFile);
      uploadData.append('label', `${form.category}_${form.date}`);
      const uploaded = await costsService.uploadReceipt(uploadData);
      receiptImage = uploaded.url;
      receiptImagePublicId = uploaded.publicId;
    }

    const payload = {
      amount: Number(form.amount),
      date: new Date(form.date).toISOString(),
      reason: form.reason.trim(),
      category: form.category,
      receiptImage,
      receiptImagePublicId,
    };

    if (editingCost) {
      updateMutation.mutate({ id: editingCost.id, data: payload });
      return;
    }

    createMutation.mutate(payload);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const totalCosts = costs.reduce((sum, cost) => sum + cost.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin')} className="mb-4 -ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Admin Dashboard
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cost Management</h1>
            <p className="text-muted-foreground">Track operational expenses and their sync status</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Cost
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Yearly Total Costs</p>
            <p className="mt-1 text-2xl font-semibold">Tk. {totalCosts.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Unsynced Records</p>
            <p className="mt-1 text-2xl font-semibold">{costs.filter((cost) => !cost.syncedToSheet).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Entries This View</p>
            <p className="mt-1 text-2xl font-semibold">{costs.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((value) => (
              <SelectItem key={value} value={String(value)}>{value}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={(value) => setCategory(value as 'all' | CostCategory)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((item) => (
              <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, index) => <CardLoader key={index} />)}
        </div>
      ) : isError ? (
        <EmptyState
          icon={<DollarSign className="h-12 w-12" />}
          title="Failed to load costs"
          description="Something went wrong while loading cost records."
          action={<Button onClick={() => window.location.reload()}>Try Again</Button>}
        />
      ) : costs.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-12 w-12" />}
          title="No cost entries"
          description="Add your first operational or bank charge record to start tracking expenses."
          action={<Button onClick={openCreate}>Add Cost</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {costs.map((cost) => (
            <Card key={cost.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Tk. {cost.amount.toLocaleString()}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{format(new Date(cost.date), 'PPP')}</p>
                  </div>
                  <Badge variant={cost.syncedToSheet ? 'outline' : 'secondary'}>
                    {cost.syncedToSheet ? 'Synced' : 'Sync failed'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">
                    {CATEGORIES.find((item) => item.value === cost.category)?.label || cost.category}
                  </Badge>
                  {cost.receiptImage && (
                    <a href={cost.receiptImage} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
                      View receipt
                    </a>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">{cost.reason}</p>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(cost)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => retrySyncMutation.mutate(cost.id)} disabled={retrySyncMutation.isPending || cost.syncedToSheet}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry Sync
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(cost.id)} disabled={deleteMutation.isPending}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingCost ? 'Edit Cost' : 'Add Cost'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" type="number" min="0" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as CostCategory }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="Describe the expense" />
            </div>

            <div className="space-y-2">
              <Label>Receipt Image</Label>
              <FileUpload value={receiptFile} onFileSelect={setReceiptFile} className="w-full" />
              {!receiptFile && form.receiptImage && (
                <a href={form.receiptImage} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
                  View existing receipt
                </a>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Saving...' : editingCost ? 'Save Changes' : 'Create Cost'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
