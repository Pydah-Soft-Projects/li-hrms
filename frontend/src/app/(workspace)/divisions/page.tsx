'use client';

import DivisionsClient from '@/components/divisions/DivisionsClient';
import Spinner from '@/components/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleAccess } from '@/hooks/useRoleAccess';

export default function WorkspaceDivisionsPage() {
  const { loading: authLoading } = useAuth();
  const { isHR, isSubAdmin, isSuperAdmin } = useRoleAccess();

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isHR && !isSubAdmin && !isSuperAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-500">
          <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m0 4h.01M5.93 5.43L7.35 6.85m12.72 12.72l-1.42-1.42M9 9l1.41-1.41M15 15l1.41-1.41M12 7h.01M12 11h.01m-4.24 6.36l-1.42-1.42m12.72-12.72l1.42 1.42"
            />
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-stone-900 dark:text-white">Access denied</h1>
        <p className="max-w-md text-stone-500">
          You are not authorized to access this page. This section is restricted to HR and administrative personnel.
        </p>
      </div>
    );
  }

  return <DivisionsClient showWorkflowsLink={false} />;
}
