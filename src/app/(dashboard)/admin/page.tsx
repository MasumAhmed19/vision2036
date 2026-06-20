'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { ProtectedRoute, CardLoader } from '@/components/common/LoadingStates';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { dashboardService, costsService, transfersService } from '@/services';
import { cn } from '@/lib/utils';

export default function AdminDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['moderator', 'admin']}>
      <AdminDashboardContent />
    </ProtectedRoute>
  );
}

function AdminDashboardContent() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => dashboardService.getAdminDashboard(),
  });

  const retryMutation = useMutation({
    mutationFn: async (item: { id: string; type: 'transfer' | 'cost' }) => {
      if (item.type === 'transfer') {
        return transfersService.retrySync(item.id);
      }
      return costsService.retrySync(item.id);
    },
    onSuccess: () => {
      toast.success('Sync retried successfully');
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['costs'] });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to retry sync');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">Loading dashboard insights...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => <CardLoader key={index} />)}
        </div>
        <CardLoader />
        <CardLoader />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Failed to load dashboard data.</p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Live overview for {data.currentMonth} with collection, flex, and sync health.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/summaries')}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Monthly Summaries
          </Button>
          <Button onClick={() => router.push('/admin/costs')}>
            <DollarSign className="mr-2 h-4 w-4" />
            Manage Costs
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Active Members" value={String(data.stats.totalMembers)} icon={Users} />
        <StatCard
          title="This Month"
          value={`Tk. ${data.stats.collectedThisMonth.toLocaleString()}`}
          description={`Target Tk. ${data.stats.targetThisMonth.toLocaleString()}`}
          icon={CheckCircle2}
        />
        <StatCard title="Pending Reviews" value={String(data.stats.pendingCount)} icon={Clock} highlight={data.stats.pendingCount > 0} />
        <StatCard title="Fund Balance" value={`Tk. ${data.stats.totalFundBalance.toLocaleString()}`} icon={Wallet} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Current Month Payment Status</h2>
              <p className="text-sm text-muted-foreground">Green = paid, yellow = partial, red = unpaid</p>
            </div>
            <Badge variant="outline">{data.stats.collectionRate}% collected</Badge>
          </div>

          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Monthly target progress</span>
              <span className="font-medium">
                Tk. {data.stats.collectedThisMonth.toLocaleString()} / Tk. {data.stats.targetThisMonth.toLocaleString()}
              </span>
            </div>
            <Progress value={Math.min(data.stats.collectionRate, 100)} className="h-3" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.paymentStatus.members.map((member) => (
              <div key={member.userId} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Verified Tk. {member.amountVerified.toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'mt-1 inline-block h-3 w-3 rounded-full',
                      member.status === 'paid' && 'bg-green-500',
                      member.status === 'partial' && 'bg-yellow-500',
                      member.status === 'unpaid' && 'bg-red-500'
                    )}
                  />
                </div>
                {member.amountSubmitted > member.amountVerified && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Submitted Tk. {member.amountSubmitted.toLocaleString()} including pending items
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Sync Failures</h2>
              <Badge variant="secondary">
                {data.syncFailures.transferCount + data.syncFailures.costCount} pending
              </Badge>
            </div>

            <div className="space-y-3">
              {data.syncFailures.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">All verified transfers and costs are synced.</p>
              ) : (
                data.syncFailures.items.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(item.date), 'PPp')}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => retryMutation.mutate({ id: item.id, type: item.type })} disabled={retryMutation.isPending}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Retry
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Quick Actions</h2>
            </div>
            <div className="grid gap-3">
              <QuickAction label="Review Pending Payments" onClick={() => router.push('/admin/payments/pending')} />
              <QuickAction label="View All Payments" onClick={() => router.push('/admin/payments')} />
              <QuickAction label="Open Cost Management" onClick={() => router.push('/admin/costs')} />
              <QuickAction label="Open Admin Tools" onClick={() => router.push('/admin/tools')} />
              <QuickAction label="Open Global Summary" onClick={() => router.push('/global-summary')} />
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Flexible Contribution Progress</h2>
              <p className="text-sm text-muted-foreground">Targeting Tk. 7,000 by month 6</p>
            </div>
          </div>
          <div className="space-y-4">
            {data.flexProgress.map((item) => (
              <div key={item.userId}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{item.userName}</span>
                  <span className={cn(item.warning ? 'text-yellow-600' : 'text-muted-foreground')}>
                    Tk. {item.paid.toLocaleString()} / Tk. {item.target.toLocaleString()}
                  </span>
                </div>
                <Progress value={item.progress} className="h-2" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Recent Activity</h2>
              <p className="text-sm text-muted-foreground">Latest verification and cost events</p>
            </div>
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity found.</p>
            ) : (
              data.recentActivity.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <p className="font-medium">{item.actorName}</p>
                  <p className="text-sm text-muted-foreground">{item.action.replaceAll('_', ' ')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{format(new Date(item.timestamp), 'PPp')}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ title, value, description, icon: Icon, highlight = false }: { title: string; value: string; description?: string; icon: React.ElementType; highlight?: boolean }) {
  return (
    <div className={cn('rounded-xl border bg-card p-5', highlight && 'border-yellow-500/40 bg-yellow-500/5')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="rounded-full bg-muted p-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50">
      <span className="font-medium">{label}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
