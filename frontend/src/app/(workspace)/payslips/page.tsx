'use client';

import { PayslipsContent } from '@/app/superadmin/payslips/page';
import { auth } from '@/lib/auth';
import { canViewScopedPayslips, type User as PermUser } from '@/lib/permissions';

export default function PayslipsPage() {
  const user = auth.getUser() as PermUser | null;
  const showDivisionFilter = Boolean(user && canViewScopedPayslips(user));

  return <PayslipsContent basePath="/payslips" showDivisionFilter={showDivisionFilter} />;
}
