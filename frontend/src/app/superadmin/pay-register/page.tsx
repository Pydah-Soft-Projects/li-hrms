'use client';

import { PayRegisterContent } from '@/components/pay-register/PayRegisterContent';

export default function PayRegisterPage() {
  return (
    <PayRegisterContent
      paymentsBasePath="/superadmin/payments"
      payrollTransactionsBasePath="/superadmin/payroll-transactions"
      showDivisionFilter
    />
  );
}
