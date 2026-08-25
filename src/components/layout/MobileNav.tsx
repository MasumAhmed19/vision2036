'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ScrollText, Users, TrendingUp, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { usePendingApprovalsCount } from '@/hooks/usePendingApprovals';

interface TabItem {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}

// The 5 destinations — visible to everyone regardless of role. Per
// newDesign.md §6.1/§9: "everyone can see everything, only actions are
// restricted" — Ledger/Members/Fund are read-transparent to all 11 members,
// so nothing here needs role-gating; only actions taken *within* these
// screens (approve, post, edit) are capability-gated.
const TABS: TabItem[] = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/ledger', label: 'Ledger', icon: ScrollText },
    { href: '/members', label: 'Members', icon: Users },
    { href: '/fund', label: 'Fund', icon: TrendingUp },
    { href: '/more', label: 'More', icon: MoreHorizontal },
];

export function MobileNav() {
    const pathname = usePathname();
    const pendingCount = usePendingApprovalsCount();

    const isActive = (href: string) => {
        if (href === '/') return pathname === '/';
        return pathname === href || pathname.startsWith(href + '/');
    };

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/60 safe-area-pb">
            <div className="flex items-center justify-around h-16 px-2">
                {TABS.map((tab) => {
                    const active = isActive(tab.href);
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={cn(
                                'relative flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
                                active ? 'text-primary' : 'text-muted-foreground'
                            )}
                        >
                            <span className="relative">
                                <tab.icon className={cn('h-5 w-5 transition-transform', active && 'scale-110')} />
                                {tab.href === '/' && pendingCount > 0 && (
                                    <Badge
                                        variant="destructive"
                                        className="absolute -right-2 -top-2 h-4 w-4 p-0 flex items-center justify-center rounded-full text-[9px]"
                                    >
                                        {pendingCount > 9 ? '9+' : pendingCount}
                                    </Badge>
                                )}
                            </span>
                            <span className="text-xs font-medium">{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
