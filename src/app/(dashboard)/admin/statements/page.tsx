'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  FileText,
  Plus,
  Filter,
  Download,
  Trash2,
  Upload,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { FileUpload } from '@/components/common/FileUpload';
import { CardLoader, ButtonLoader, ProtectedRoute } from '@/components/common/LoadingStates';
import { cn } from '@/lib/utils';
import { statementsService } from '@/services';
import type { Statement } from '@/types';

const ITEMS_PER_PAGE = 12;

// Generate years from 2024 to current year + 1
const generateYears = () => {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = 2024; year <= currentYear + 1; year++) {
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

export default function StatementsPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'admin']}>
      <StatementsContent />
    </ProtectedRoute>
  );
}

function StatementsContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Statement | null>(null);

  // Upload form state
  const [uploadMonth, setUploadMonth] = useState<number>(new Date().getMonth() + 1);
  const [uploadYear, setUploadYear] = useState<number>(new Date().getFullYear());
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Build query params
  const queryParams = new URLSearchParams();
  queryParams.append('page', page.toString());
  queryParams.append('limit', ITEMS_PER_PAGE.toString());
  if (yearFilter !== 'all') queryParams.append('year', yearFilter);

  // Fetch statements
  const { data, isLoading, isError } = useQuery({
    queryKey: ['statements', { page, yearFilter }],
    queryFn: () => statementsService.getAllStatements(queryParams.toString()),
  });

  const statements = data?.statements || [];
  const pagination = data?.pagination;

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => statementsService.createStatement(formData),
    onSuccess: () => {
      toast.success('Statement uploaded successfully');
      queryClient.invalidateQueries({ queryKey: ['statements'] });
      closeUploadDialog();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to upload statement';
      toast.error('Upload failed', { description: message });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => statementsService.deleteStatement(id),
    onSuccess: () => {
      toast.success('Statement deleted');
      queryClient.invalidateQueries({ queryKey: ['statements'] });
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Failed to delete statement';
      toast.error('Delete failed', { description: message });
    },
  });

  const closeUploadDialog = () => {
    setShowUploadDialog(false);
    setUploadMonth(new Date().getMonth() + 1);
    setUploadYear(new Date().getFullYear());
    setUploadDescription('');
    setUploadFile(null);
  };

  const handleUpload = () => {
    if (!uploadFile) {
      toast.error('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('month', uploadMonth.toString());
    formData.append('year', uploadYear.toString());
    formData.append('description', uploadDescription);
    formData.append('file', uploadFile);

    uploadMutation.mutate(formData);
  };

  const handleClearFilters = () => {
    setYearFilter('all');
    setPage(1);
  };

  const hasFilters = yearFilter !== 'all';

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
          <h1 className="text-2xl font-bold tracking-tight">Bank Statements</h1>
          <p className="text-muted-foreground">
            Upload and manage monthly bank statements
          </p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Statement
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filters:
        </div>

        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {YEARS.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}

        {pagination && (
          <span className="ml-auto text-sm text-muted-foreground">
            {pagination.totalItems} statement{pagination.totalItems !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <CardLoader key={i} />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Failed to load statements"
          description="Something went wrong while fetching statements."
          action={
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          }
        />
      ) : statements.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title={hasFilters ? 'No statements found' : 'No statements yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters to see more results.'
              : 'Upload your first bank statement to get started.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            ) : (
              <Button onClick={() => setShowUploadDialog(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Statement
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Statements Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {statements.map((statement) => (
              <StatementCard
                key={statement.id}
                statement={statement}
                onDelete={() => setDeleteTarget(statement)}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={closeUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Bank Statement</DialogTitle>
            <DialogDescription>
              Upload a bank statement PDF for a specific month
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Period Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select
                  value={uploadMonth.toString()}
                  onValueChange={(v) => setUploadMonth(parseInt(v))}
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
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select
                  value={uploadYear.toString()}
                  onValueChange={(v) => setUploadYear(parseInt(v))}
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
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea
                placeholder="Add a note about this statement..."
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Statement File</Label>
              <FileUpload
                accept="application/pdf"
                maxSize={10 * 1024 * 1024}
                onFileSelect={setUploadFile}
                value={uploadFile}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeUploadDialog} disabled={uploadMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending || !uploadFile}>
              {uploadMutation.isPending ? <ButtonLoader /> : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Statement</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this statement? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="font-medium">
                {format(new Date(deleteTarget.year, deleteTarget.month - 1), 'MMMM yyyy')}
              </p>
              {deleteTarget.description && (
                <p className="text-sm text-muted-foreground">{deleteTarget.description}</p>
              )}
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

// Statement Card Component
function StatementCard({
  statement,
  onDelete,
}: {
  statement: Statement;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-muted p-2.5">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">
              {format(new Date(statement.year, statement.month - 1), 'MMMM yyyy')}
            </p>
            {statement.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {statement.description}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {format(new Date(statement.createdAt), 'MMM d, yyyy')}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          asChild
        >
          <a href={statement.fileUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-4 w-4" />
            View
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          asChild
        >
          <a href={statement.fileUrl} download>
            <Download className="mr-1 h-4 w-4" />
            Download
          </a>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
