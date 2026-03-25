"use client";

import PayrollBatchesHub from "@/components/payments/PayrollBatchesHub";

export default function PaymentsPage() {
  return <PayrollBatchesHub detailBasePath="/superadmin/payments" showDivisionFilter />;
}
