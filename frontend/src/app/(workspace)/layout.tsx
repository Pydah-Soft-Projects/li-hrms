'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { AuthProvider } from '@/contexts/AuthContext';
import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import Spinner from '@/components/Spinner';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import MainContent from '@/components/MainContent';

function WorkspaceLayoutContent({ children }: { children: React.ReactNode }) {
  // const { isLoading } = useWorkspace(); // isLoading removed as we want to show skeletons immediately



  return (
    <div className="flex min-h-screen bg-bg-base dark:bg-slate-900">
      <div className="hidden sm:block">
        <WorkspaceSidebar />
      </div>
      <MainContent>{children}</MainContent>
      {/* Mobile Bottom Navigation */}
      <div className="sm:hidden">
        <MobileBottomNav />
      </div>
    </div>
  );
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = auth.getToken();
    const user = auth.getUser();

    if (!token || !user) {
      router.replace('/login');
      return;
    }

    // If super_admin, redirect to admin panel
    if (user.role === 'super_admin') {
      router.replace('/superadmin/dashboard');
      return;
    }

    setIsAuthenticated(true);
    setIsChecking(false);
  }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="w-10 h-10" />
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <AuthProvider>
      <WorkspaceProvider>
        <SidebarProvider>
          <WorkspaceLayoutContent>{children}</WorkspaceLayoutContent>
        </SidebarProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
