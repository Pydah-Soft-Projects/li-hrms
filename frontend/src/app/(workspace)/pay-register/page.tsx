'use client';

import { PayRegisterContent } from '@/components/pay-register/PayRegisterContent';

export default function PayRegisterPage() {
  return (
    <PayRegisterContent
      paymentsBasePath="/payments"
      payrollTransactionsBasePath="/payroll-transactions"
      showDivisionFilter
      autoSelectSingleDivision
    />
  );
}
