'use client';

import { LoansPageShell, LoansPageHeader } from '@/components/loans/LoansPageShell';
import UserAuditsView from '@/components/users/UserAuditsView';

export default function SuperadminUserAuditsPage() {
  return (
    <LoansPageShell>
      <LoansPageHeader
        badge="Security & Access Audit"
        title="User Access Audits"
        subtitle="Complete audit history of user access modifications, page permissions, division assignments, and role changes"
      />
      <div className="mt-6">
        <UserAuditsView />
      </div>
    </LoansPageShell>
  );
}
