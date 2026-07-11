/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { formatEmployeeFieldDisplay, getFieldAliases } from '@/lib/employeeDynamicFieldValue';

export type EmployeeFormGroupViewProps = {
  groupId: string;
  employee: Record<string, any> | null | undefined;
  formSettings: any;
  excludeFieldIds?: string[];
  /** Override labels for specific field ids (e.g. proposedSalary → Gross Salary) */
  fieldLabelOverrides?: Record<string, string>;
  /** Wider cells for address-like fields */
  wideFieldIds?: string[];
  className?: string;
};

function formatViewValue(field: any, raw: string): string {
  if (raw === '-') return raw;
  if (field.type === 'boolean') return raw === 'true' || raw === '1' ? 'Yes' : raw === 'false' || raw === '0' ? 'No' : raw;
  if (field.type === 'date' && raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  return raw;
}

export default function EmployeeFormGroupView({
  groupId,
  employee,
  formSettings,
  excludeFieldIds = [],
  fieldLabelOverrides = {},
  wideFieldIds = ['present_address', 'permanent_address', 'address'],
  className = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4',
}: EmployeeFormGroupViewProps) {
  const group = formSettings?.groups?.find((g: any) => g.id === groupId);
  if (!group || group.isEnabled === false) return null;

  const fields = (group.fields || [])
    .filter((f: any) => f.isEnabled !== false && !excludeFieldIds.includes(f.id))
    .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

  if (!fields.length) return null;

  return (
    <>
      {fields.map((field: any) => {
        const aliases = getFieldAliases(field.id);
        const raw = formatEmployeeFieldDisplay(employee, groupId, field.id, aliases, field.label);
        const colClass = wideFieldIds.includes(field.id) ? 'sm:col-span-2' : '';
        return (
          <div key={field.id} className={colClass}>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {fieldLabelOverrides[field.id] ?? field.label}
            </label>
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{formatViewValue(field, raw)}</p>
          </div>
        );
      })}
    </>
  );
}
