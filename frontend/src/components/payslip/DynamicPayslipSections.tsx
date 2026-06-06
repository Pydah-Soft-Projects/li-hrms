'use client';

import type { PayrollOutputColumn, PayslipSections } from '@/lib/api';
import {
  buildPayslipSections,
  formatSectionValue,
  withSectionTotals,
  type PayslipSectionItem,
} from '@/lib/payslipSections';

export type PayslipPayrollInput = {
  payslipSections?: PayslipSections;
  earnings?: { grossSalary?: number };
  deductions?: { totalDeductions?: number };
};

export function resolvePayslipSections(
  payroll: PayslipPayrollInput,
  outputColumns?: PayrollOutputColumn[] | null
): PayslipSections {
  if (payroll.payslipSections?.hasConfiguredSections) {
    return withSectionTotals(payroll.payslipSections);
  }
  if (outputColumns && outputColumns.length > 0) {
    return buildPayslipSections(outputColumns, payroll as Record<string, unknown>);
  }
  return withSectionTotals({
    attendance: [],
    earnings: [],
    deductions: [],
    hasConfiguredSections: false,
  });
}

export function DynamicAttendanceGrid({ items }: { items: PayslipSectionItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
      {items.map((item, i) => (
        <div
          key={`${item.header}-${i}`}
          className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 px-3 py-2"
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {item.header}
          </div>
          <div className="text-sm font-black text-slate-800 dark:text-white mt-0.5">
            {formatSectionValue(item.value, 'attendance')}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DynamicSalaryRows({
  items,
  section,
  isDeduction = false,
}: {
  items: PayslipSectionItem[];
  section: 'earnings' | 'deductions';
  isDeduction?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item, i) => (
        <SalaryRow
          key={`${item.header}-${i}`}
          label={item.header}
          value={typeof item.value === 'number' ? item.value : Number(item.value) || 0}
          isDeduction={isDeduction}
          displayValue={formatSectionValue(item.value, section, true)}
        />
      ))}
    </>
  );
}

function SalaryRow({
  label,
  value,
  isDeduction,
  displayValue,
}: {
  label: string;
  value: number;
  isDeduction?: boolean;
  displayValue?: string;
}) {
  const formatted =
    displayValue ??
    `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="flex justify-between items-center py-1.5 px-1 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 rounded-lg transition-colors">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={`text-sm font-bold ${isDeduction ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-white'}`}
      >
        {formatted}
      </span>
    </div>
  );
}
