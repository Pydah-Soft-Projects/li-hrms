'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import FormSettingsBuilder from '@/components/form-settings/FormSettingsBuilder';

export default function EmployeeFormSettingsPage() {
  return (
    <>
      <Link
        href="/superadmin/employees"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to employees
      </Link>
      <FormSettingsBuilder />
    </>
  );
}
