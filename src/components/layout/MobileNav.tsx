'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  ClipboardCheck,
  DollarSign,
  User,
  Menu,
  Building2,
  Globe,
  Users,
  Settings2,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/common/Logo';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
}

// Bottom nav items (simplified)
const bottomNavItems: NavItem[] = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/summaries', label: 'Summary', icon: BarChart3 },
  { href: '/profile', label: 'Profile', icon: User },
];

// Full sidebar menu items
const mainMenuItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/payments', label: 'My Payments', icon: CreditCard },
  { href: '/bank-accounts', label: 'Bank Accounts', icon: Building2 },
  { href: '/summaries', label: 'My Summary', icon: BarChart3 },
  { href: '/global-summary', label: 'Global Summary', icon: Globe },
  // { href: '/statements', label: 'Bank Statements', icon: FileText },
  { href: '/profile', label: 'Profile', icon: User },
];

const adminMenuItems: NavItem[] = [
  { href: '/admin', label: 'Admin Dashboard', icon: LayoutDashboard, adminOnly: true },
  { href: '/admin/payments/pending', label: 'Pending Payments', icon: ClipboardCheck, adminOnly: true },
  { href: '/admin/payments', label: 'All Payments', icon: CreditCard, adminOnly: true },
  { href: '/admin/costs', label: 'Costs', icon: DollarSign, adminOnly: true },
  { href: '/admin/summaries', label: 'Monthly Summaries', icon: BarChart3, adminOnly: true },
  { href: '/admin/tools', label: 'Admin Tools', icon: Settings2, adminOnly: true },
];

const superAdminMenuItems: NavItem[] = [
  { href: '/admin/members', label: 'Members', icon: Users, superAdminOnly: true },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldCheck, superAdminOnly: true },
];

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    // Exact match for specific routes that have sub-routes
    if (href === '/admin' || href === '/admin/payments') return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const hasAdminAccess = user && ['admin', 'moderator'].includes(user.role);
  const hasSuperAdminAccess = user && user.role === 'admin';

  const NavLink = ({ item, onClick }: { item: NavItem; onClick?: () => void }) => (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-lg px-3 py-3 text-sm font-medium transition-colors',
        'hover:bg-accent hover:text-accent-foreground active:bg-accent',
        isActive(item.href)
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground'
      )}
    >
      <div className="flex items-center gap-3">
        <item.icon className="h-5 w-5" />
        <span>{item.label}</span>
      </div>
      <ChevronRight className="h-4 w-4 opacity-50" />
    </Link>
  );

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/60 safe-area-pb">
        <div className="flex items-center justify-around h-16 px-2">
          {/* Menu Toggle Button */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
                  'text-muted-foreground'
                )}
              >
                <Menu className="h-5 w-5" />
                <span className="text-xs font-medium">Menu</span>
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-75 p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <Logo showText size="md" />
                </SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {/* Main Menu */}
                {mainMenuItems.map((item) => (
                  <NavLink key={item.href} item={item} onClick={() => setIsOpen(false)} />
                ))}

                {/* Admin Section */}
                {hasAdminAccess && (
                  <>
                    <Separator className="my-4" />
                    <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Admin
                    </p>
                    {adminMenuItems.map((item) => (
                      <NavLink key={item.href} item={item} onClick={() => setIsOpen(false)} />
                    ))}
                  </>
                )}

                {/* Super Admin Section */}
                {hasSuperAdminAccess && (
                  <>
                    <Separator className="my-4" />
                    <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Super Admin
                    </p>
                    {superAdminMenuItems.map((item) => (
                      <NavLink key={item.href} item={item} onClick={() => setIsOpen(false)} />
                    ))}
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Bottom Nav Items */}
          {bottomNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
                isActive(item.href)
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <item.icon
                className={cn(
                  'h-5 w-5 transition-transform',
                  isActive(item.href) && 'scale-110'
                )}
              />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
