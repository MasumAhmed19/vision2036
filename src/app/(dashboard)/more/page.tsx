'use client';

import Link from 'next/link';
import {
  User,
  Building2,
  BarChart3,
  Globe,
  FileText,
  ClipboardCheck,
  PlusCircle,
  LayoutDashboard,
  DollarSign,
  Settings2,
  Users,
  ShieldCheck,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingApprovalsCount } from '@/hooks/usePendingApprovals';
import { Badge } from '@/components/ui/badge';

interface MoreLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

function LinkRow({ item }: { item: MoreLink }) {
  return (
    <Link
      href={item.href}
      className="flex items-center justify-between rounded-lg px-3 py-3 text-sm font-medium transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-3">
        <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>{item.label}</span>
      </div>
      <div className="flex items-center gap-2">
        {!!item.badge && (
          <Badge variant="destructive" className="h-5 min-w-5 rounded-full px-1.5 text-[10px]">
            {item.badge > 99 ? '99+' : item.badge}
          </Badge>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
      </div>
    </Link>
  );
}

function Section({ title, links }: { title?: string; links: MoreLink[] }) {
  return (
    <div className="rounded-xl border bg-card">
      {title && (
        <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      )}
      <div className="divide-y px-1 pb-1">
        {links.map((link) => (
          <LinkRow key={link.href} item={link} />
        ))}
      </div>
    </div>
  );
}

export default function MorePage() {
  const { user, logout } = useAuth();
  const pendingCount = usePendingApprovalsCount();

  const canApprove = !!user && ['admin', 'moderator', 'co_admin'].includes(user.role);
  const isAdmin = user?.role === 'admin';

  const personalLinks: MoreLink[] = [
    { href: '/profile', label: 'Profile', icon: User },
    { href: '/bank-accounts', label: 'Bank Accounts', icon: Building2 },
    { href: '/summaries', label: 'My Summary', icon: BarChart3 },
    { href: '/global-summary', label: 'Global Summary', icon: Globe },
    { href: '/statements', label: 'Statements', icon: FileText },
  ];

  const approvalLinks: MoreLink[] = [
    { href: '/approvals', label: 'Needs Review', icon: ClipboardCheck, badge: pendingCount },
    { href: '/approvals/post', label: 'Post an Entry', icon: PlusCircle },
  ];

  const adminLinks: MoreLink[] = [
    { href: '/admin', label: 'Admin Dashboard', icon: LayoutDashboard },
    { href: '/admin/costs', label: 'Costs (legacy)', icon: DollarSign },
    { href: '/admin/summaries', label: 'Monthly Summaries', icon: BarChart3 },
    { href: '/admin/tools', label: 'Admin Tools', icon: Settings2 },
  ];

  const superAdminLinks: MoreLink[] = [
    { href: '/admin/members', label: 'Manage Members', icon: Users },
    { href: '/admin/audit-logs', label: 'Audit Log', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">More</h1>
        <p className="text-muted-foreground">Everything else — your account, transparency tools, and admin actions.</p>
      </div>

      <Section links={personalLinks} />

      {canApprove && <Section title="Co-Admin" links={approvalLinks} />}
      {canApprove && <Section title="Admin (legacy screens)" links={adminLinks} />}
      {isAdmin && <Section title="Super Admin" links={superAdminLinks} />}

      <button
        type="button"
        onClick={() => logout()}
        className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-accent"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>
    </div>
  );
}
