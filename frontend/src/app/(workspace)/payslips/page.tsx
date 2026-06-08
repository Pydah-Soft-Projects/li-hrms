'use client';

import { PayslipsContent } from '@/app/superadmin/payslips/page';

export default function PayslipsPage() {
  return <PayslipsContent basePath="/payslips" showDivisionFilter={false} />;
}
