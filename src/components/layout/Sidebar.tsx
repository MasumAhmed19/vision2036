'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ScrollText, Users, TrendingUp, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/common/Logo';
import { Money } from '@/components/common/Money';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { entriesService } from '@/services';
import { usePendingApprovalsCount } from '@/hooks/usePendingApprovals';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Visible to everyone regardless of role — see the same note in MobileNav.tsx.
const TABS: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/ledger', label: 'Ledger', icon: ScrollText },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/fund', label: 'Fund', icon: TrendingUp },
  { href: '/more', label: 'More', icon: MoreHorizontal },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const pendingCount = usePendingApprovalsCount();

  const { data: fundPosition } = useQuery({
    queryKey: ['fund', 'position'],
    queryFn: () => entriesService.getFundPosition(),
    staleTime: 60000,
  });

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    const linkContent = (
      <Link
        href={item.href}
        className={cn(
          'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
          isCollapsed && 'justify-center px-2'
        )}
      >
        <div className="flex items-center gap-3">
          <item.icon className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span>{item.label}</span>}
        </div>

        {!isCollapsed && item.href === '/' && pendingCount > 0 && (
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
            {item.label} {item.href === '/' && pendingCount > 0 ? `(${pendingCount})` : ''}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

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

        {/* Persistent fund-value header (newDesign.md §9.2) */}
        {!isCollapsed && (
          <div className="border-b px-4 py-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Fund value</p>
            {fundPosition ? (
              <Money value={fundPosition.fundValue} className="text-lg font-semibold" />
            ) : (
              <span className="text-lg font-semibold text-muted-foreground">···</span>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {TABS.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
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
