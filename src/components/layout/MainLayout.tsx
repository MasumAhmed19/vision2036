'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { PageLoader } from '@/components/common/LoadingStates';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { isLoading, user } = useAuth();

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved !== null) {
      setSidebarCollapsed(JSON.parse(saved));
    }
  }, []);

  // Save sidebar state to localStorage
  const handleSidebarToggle = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newState));
  };

  // Show loader while checking auth or before hydration
  if (isLoading || !mounted) {
    return <PageLoader />;
  }

  // If no user, show nothing - middleware should handle this, but as a fallback:
  if (!user && !isLoading) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <Sidebar isCollapsed={sidebarCollapsed} onToggle={handleSidebarToggle} />

        <div className="flex-1 flex flex-col min-h-screen">
          <Header />

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            {children}
          </main>
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
