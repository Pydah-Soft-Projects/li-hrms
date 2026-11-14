'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LoansPageShell, LoansPageHeader } from '@/components/loans/LoansPageShell';
import SettingsAuditLogView from '@/components/settings/SettingsAuditLogView';
import Spinner from '@/components/Spinner';

export default function SuperadminSettingsAuditPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'super_admin')) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <LoansPageShell>
      <LoansPageHeader
        badge="Governance & Security Audit"
        title="Settings Audit Logs"
        subtitle="Complete immutable audit trail of all settings modifications across the system, including who changed each setting, old vs new values, client IP, and timestamps"
      />
      <div className="mt-4">
        <SettingsAuditLogView showHeader={false} />
      </div>
    </LoansPageShell>
  );
}
