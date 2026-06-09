"use client";

import { PayrollBatchDetailContent } from "@/components/payments/PayrollBatchDetailContent";

export default function BatchDetailsPage() {
  return (
    <PayrollBatchDetailContent
      payRegisterBasePath="/superadmin/pay-register"
      paymentsListPath="/superadmin/payments"
    />
  );
}
