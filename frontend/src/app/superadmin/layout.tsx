 'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import MainContent from '@/components/MainContent';
import Spinner from '@/components/Spinner';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { auth } from '@/lib/auth';

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = auth.getToken();
    const user = auth.getUser();

    if (!token || !user) {
      router.replace('/login');
      return;
    }

    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }

    setIsAllowed(true);
    setIsChecking(false);
  }, [router]);

  useEffect(() => {
    auth.startInactivityAutoLogout(() => {
      router.replace('/login');
    });

    return () => {
      auth.stopInactivityAutoLogout();
    };
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

  if (!isAllowed) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-white dark:bg-slate-900">
        <Sidebar />
        <MainContent className="pt-16 sm:pt-0">{children}</MainContent>
      </div>
    </SidebarProvider>
  );
}
