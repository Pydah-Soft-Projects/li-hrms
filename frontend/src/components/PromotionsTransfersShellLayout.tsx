'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { AuthProvider } from '@/contexts/AuthContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import Spinner from '@/components/Spinner';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import Sidebar from '@/components/Sidebar';
import MainContent from '@/components/MainContent';

export default function PromotionsTransfersShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const token = auth.getToken();
      const user = auth.getUser();

      if (!token || !user) {
        router.replace('/login');
        return;
      }

      const superU = user.role === 'super_admin';
      setIsSuper(superU);

      if (!superU) {
        const hasUserFeatureControl =
          user.featureControl && Array.isArray(user.featureControl) && user.featureControl.length > 0;
        if (!hasUserFeatureControl) {
          try {
            const res = await api.getSetting(`feature_control_${user.role}`);
            if (
              !cancelled &&
              res?.success &&
              res?.data?.value?.activeModules &&
              Array.isArray(res.data.value.activeModules)
            ) {
              auth.setUser({ ...user, featureControl: res.data.value.activeModules });
            }
          } catch {
            /* keep user */
          }
        }
      }

      if (!cancelled) {
        setReady(true);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="w-10 h-10" />
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  if (isSuper) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen bg-white dark:bg-slate-900">
          <Sidebar />
          <MainContent className="pt-16 sm:pt-0">{children}</MainContent>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <AuthProvider>
      <WorkspaceProvider>
        <SidebarProvider>
          <div className="flex min-h-screen bg-bg-base dark:bg-slate-900">
            <div className="hidden sm:block">
              <WorkspaceSidebar />
            </div>
            <MainContent showLogout={false} className="pb-24 sm:pb-0">
              {children}
            </MainContent>
            <div className="sm:hidden">
              <MobileBottomNav />
            </div>
          </div>
        </SidebarProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
}
