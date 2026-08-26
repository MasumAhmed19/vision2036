'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Mail } from 'lucide-react';
import { ProtectedRoute, ButtonLoader } from '@/components/common/LoadingStates';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { membersService, entriesService, notificationsService } from '@/services';
import { getCurrentMonthIso, formatMonthLabel } from '@/lib/policies';

type Template = 'missed_payment' | 'custom';

export default function NotifyPage() {
  return (
    <ProtectedRoute allowedRoles={['co_admin', 'admin']}>
      <NotifyContent />
    </ProtectedRoute>
  );
}

function NotifyContent() {
  const [template, setTemplate] = useState<Template>('missed_payment');
  const [period, setPeriod] = useState(() => getCurrentMonthIso());
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: members } = useQuery({
    queryKey: ['members'],
    queryFn: () => membersService.getMembers(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: groupStatus, isFetching: isLoadingGroupStatus } = useQuery({
    queryKey: ['dashboard', 'group-status', period],
    queryFn: () => entriesService.getGroupStatus(period),
    enabled: template === 'missed_payment',
  });

  const toggleRecipient = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllUnpaid = () => {
    const unpaidIds = (groupStatus?.members || []).filter((m) => m.status !== 'paid').map((m) => m.id);
    setSelectedIds(new Set(unpaidIds));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const mutation = useMutation({
    mutationFn: () =>
      notificationsService.send({
        template,
        recipientIds: Array.from(selectedIds),
        period: template === 'missed_payment' ? period : undefined,
        subject: template === 'custom' ? subject : undefined,
        message: template === 'custom' ? message : undefined,
      }),
    onSuccess: (result) => {
      if (result.failed.length === 0) {
        toast.success(`Sent to ${result.sent.length} recipient${result.sent.length === 1 ? '' : 's'}`);
        setSelectedIds(new Set());
        if (template === 'custom') {
          setSubject('');
          setMessage('');
        }
      } else {
        toast.error(`Sent to ${result.sent.length}, failed for ${result.failed.length} — ${result.failed.map((f) => f.name || f.id).join(', ')}`);
      }
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to send'),
  });

  const canSubmit =
    selectedIds.size > 0 &&
    (template === 'missed_payment' || (subject.trim().length > 0 && message.trim().length > 0));

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Send Notification</h1>
        <p className="text-muted-foreground">Email any member — including yourself — a reminder or a message.</p>
      </div>

      <Tabs value={template} onValueChange={(v) => setTemplate(v as Template)}>
        <TabsList>
          <TabsTrigger value="missed_payment">Missed payment</TabsTrigger>
          <TabsTrigger value="custom">Custom message</TabsTrigger>
        </TabsList>
      </Tabs>

      {template === 'missed_payment' ? (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <Label htmlFor="period">Month</Label>
          <Input id="period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Each recipient&apos;s actual paid/due amount for {formatMonthLabel(period)} is computed and filled in automatically.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectAllUnpaid}
            disabled={isLoadingGroupStatus}
          >
            {isLoadingGroupStatus ? <ButtonLoader /> : 'Select everyone unpaid this month'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" rows={6} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Recipients ({selectedIds.size})</h3>
          {selectedIds.size > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          )}
        </div>
        <div className="divide-y">
          {(members || []).map((m) => (
            <label key={m.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent">
              <Checkbox checked={selectedIds.has(m.id)} onCheckedChange={() => toggleRecipient(m.id)} />
              <UserAvatar name={m.name} avatar={m.avatar} className="h-8 w-8" />
              <span className="text-sm font-medium">{m.name}</span>
            </label>
          ))}
        </div>
      </div>

      <Button
        className="w-full"
        disabled={!canSubmit || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? (
          <ButtonLoader />
        ) : (
          <>
            <Mail className="mr-1 h-4 w-4" /> Send to {selectedIds.size || 0}
          </>
        )}
      </Button>
    </div>
  );
}
