'use client';

import { SettingsToggleRow } from '@/components/settings/SettingsPageShell';
import { settingsFieldHelpClass } from '@/lib/settingsUi';

export type IncludeMissingPayrollComponentsCardProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Shown under the standard description (e.g. department override copy). */
  contextNote?: string;
  className?: string;
};

/**
 * Shared UI for "include missing allowances & deductions" — used on
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
    <div className={className}>
      <SettingsToggleRow
        id="include-missing-payroll-components"
        label="Include Missing Components"
        description="Include standard allowances/deductions even if employee has no overrides."
        checked={checked}
        onChange={onChange}
      />
      {contextNote ? <p className={`${settingsFieldHelpClass} mt-2`}>{contextNote}</p> : null}
    </div>
  );
}
