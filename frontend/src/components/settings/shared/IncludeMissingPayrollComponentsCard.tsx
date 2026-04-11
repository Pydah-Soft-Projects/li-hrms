'use client';

import { Info } from 'lucide-react';

export type IncludeMissingPayrollComponentsCardProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Shown under the standard description (e.g. department override copy). */
  contextNote?: string;
  className?: string;
};

/**
 * Shared UI for “include missing allowances & deductions” — used on
 * global Payroll settings and departmental overrides so behavior and
 * visuals stay aligned.
 */
export function IncludeMissingPayrollComponentsCard({
  checked,
  onChange,
  contextNote,
  className = '',
}: IncludeMissingPayrollComponentsCardProps) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-xl border border-blue-100 bg-blue-50/50 p-6 dark:border-blue-900/20 dark:bg-blue-900/10 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className="shrink-0 rounded-lg border border-blue-100/50 bg-white p-2.5 shadow-sm dark:border-blue-800 dark:bg-[#1E293B]">
          <Info className="h-4 w-4 text-blue-500" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Include Missing Components</p>
          <p className="text-[10px] text-blue-700 dark:text-blue-400/80">
            Include standard allowances/deductions even if employee has no overrides.
          </p>
          {contextNote ? (
            <p className="pt-1 text-[10px] text-blue-800/90 dark:text-blue-300/90">{contextNote}</p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all duration-300 ${checked ? 'bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.3)]' : 'bg-gray-200 dark:bg-gray-700'}`}
        aria-pressed={checked}
        aria-label={checked ? 'Disable include missing components' : 'Enable include missing components'}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </section>
  );
}
