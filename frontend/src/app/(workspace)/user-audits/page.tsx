'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Spinner from '@/components/Spinner';

export default function WorkspaceUserAuditsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user || user.role !== 'super_admin') {
        router.replace('/dashboard');
      } else {
        router.replace('/superadmin/user-audits');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-8 w-8" />
        <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">
          Verifying authorization...
        </p>
      </div>
    </div>
  );
}
