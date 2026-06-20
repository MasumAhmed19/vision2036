'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CreditCard,
  Building2,
  BarChart3,
  DollarSign,
  Globe,
  Users,
  ClipboardCheck,
  Settings2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { transfersService } from '@/services';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: ('member' | 'moderator' | 'admin')[];
}

const mainNavItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/payments', label: 'My Payments', icon: CreditCard },
  { href: '/bank-accounts', label: 'Bank Accounts', icon: Building2 },
  { href: '/summaries', label: 'My Summary', icon: BarChart3 },
  { href: '/global-summary', label: 'Global Summary', icon: Globe },
  // { href: '/statements', label: 'Bank Statements', icon: FileText },
];

const adminNavItems: NavItem[] = [
  { href: '/admin', label: 'Admin Dashboard', icon: LayoutDashboard, roles: ['admin', 'moderator'] },
  { href: '/admin/payments/pending', label: 'Pending Payments', icon: ClipboardCheck, roles: ['admin', 'moderator'] },
  { href: '/admin/payments', label: 'All Payments', icon: CreditCard, roles: ['admin', 'moderator'] },
  { href: '/admin/costs', label: 'Costs', icon: DollarSign, roles: ['admin', 'moderator'] },
  { href: '/admin/summaries', label: 'Monthly Summaries', icon: BarChart3, roles: ['admin', 'moderator'] },
  { href: '/admin/tools', label: 'Admin Tools', icon: Settings2, roles: ['admin', 'moderator'] },
];

const superAdminNavItems: NavItem[] = [
  { href: '/admin/members', label: 'Members', icon: Users, roles: ['admin'] },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldCheck, roles: ['admin'] },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  // Fetch count of pending transfers
  const { data: pendingCountData } = useQuery({
    queryKey: ['transfers', 'pending-count'],
    queryFn: () => transfersService.getPendingCount(),
    // Only fetch if right user role (admins)
    enabled: !!user && ['admin', 'moderator'].includes(user.role),
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  const pendingCount = pendingCountData?.count || 0;

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    // Exact match for specific routes that have sub-routes
    if (href === '/admin' || href === '/admin/payments') return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const canAccess = (roles?: ('member' | 'moderator' | 'admin')[]) => {
    if (!roles || !user) return true;
    return roles.includes(user.role as 'member' | 'moderator' | 'admin');
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    if (!canAccess(item.roles)) return null;

    const linkContent = (
      <Link
        href={item.href}
        className={cn(
          'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isActive(item.href)
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground',
          isCollapsed && 'justify-center px-2'
        )}
      >
        <div className="flex items-center gap-3">
          <item.icon className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span>{item.label}</span>}
        </div>

        {/* Render notification badge for Pending Payments */}
        {!isCollapsed && item.href === '/admin/payments/pending' && pendingCount > 0 && (
          <Badge variant="destructive" className="ml-auto w-5 h-5 flex p-0 items-center justify-center rounded-full text-[10px]">
            {pendingCount > 99 ? '99+' : pendingCount}
          </Badge>
        )}
      </Link>
    );

    if (isCollapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right">
            {item.label} {item.href === '/admin/payments/pending' && pendingCount > 0 ? `(${pendingCount})` : ''}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  const hasAdminAccess = user && ['admin', 'moderator'].includes(user.role);
  const hasSuperAdminAccess = user && user.role === 'admin';

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'hidden md:flex flex-col border-r bg-card h-screen sticky top-0 transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center h-16 border-b px-4',
          isCollapsed && 'justify-center px-2'
        )}>
          <Logo showText={!isCollapsed} size={isCollapsed ? 'sm' : 'md'} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {mainNavItems.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}

          {hasAdminAccess && (
            <>
              <Separator className="my-3" />
              {!isCollapsed && (
                <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Admin
                </p>
              )}
              {adminNavItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </>
          )}

          {hasSuperAdminAccess && (
            <>
              <Separator className="my-3" />
              {!isCollapsed && (
                <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Super Admin
                </p>
              )}
              {superAdminNavItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </>
          )}
        </nav>

        {/* Collapse Toggle */}
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn('w-full', isCollapsed && 'px-2')}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
