"use client";

import { PayrollBatchDetailContent } from "@/components/payments/PayrollBatchDetailContent";

export default function BatchDetailsPage() {
  return (
    <PayrollBatchDetailContent
      payRegisterBasePath="/pay-register"
      paymentsListPath="/payments"
    />
  );
}
