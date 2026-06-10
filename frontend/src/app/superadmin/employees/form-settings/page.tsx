'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import FormSettingsBuilder from '@/components/form-settings/FormSettingsBuilder';
import { LoansPageShell } from '@/components/loans/LoansPageShell';
import { settingsLedgerBorder, settingsOutlineButtonClass, settingsOutlineButtonStyle } from '@/lib/settingsUi';

export default function SuperadminEmployeeFormSettingsPage() {
  return (
    <LoansPageShell>
      <div className="mb-4 sm:mb-6">
        <Link
          href="/superadmin/employees"
          className={`inline-flex items-center gap-2 ${settingsOutlineButtonClass()}`}
          style={settingsOutlineButtonStyle()}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to employees
        </Link>
      </div>
      <div className="border bg-white p-4 dark:bg-stone-950 sm:p-6 lg:p-8" style={settingsLedgerBorder}>
        <FormSettingsBuilder />
      </div>
    </LoansPageShell>
  );
}
