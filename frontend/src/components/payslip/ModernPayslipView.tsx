'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PayslipLoans, PayslipSections } from '@/lib/api';
import { fetchCompanyProfile } from '@/lib/companyProfile';
import { payslipHasLoans } from '@/lib/payslipLoans';
import { formatInr, formatSectionValue, type PayslipSectionItem } from '@/lib/payslipSections';
import { PAYSLIP_ACCENT_FALLBACK, payslipAccentCssVars, resolvePayslipAccentHex } from '@/lib/payslipTheme';

type EmployeeLike = {
  employee_name?: string;
  emp_no?: string;
  department_id?: { name?: string } | string;
  designation_id?: { name?: string } | string;
  bank_account_no?: string;
};

type PayrollLike = {
  monthName?: string;
  year?: number;
  status?: string;
};

const ATTENDANCE_FIELDS_PER_ROW = 5;

function deptName(d: EmployeeLike['department_id']) {
  return typeof d === 'object' && d?.name ? d.name : String(d || '—');
}
function desigName(d: EmployeeLike['designation_id']) {
  return typeof d === 'object' && d?.name ? d.name : String(d || '—');
}

function chunkRows<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}

export function ModernPayslipView({
  payroll,
  employee,
  sections,
  loans,
  backHref,
  onDownload,
  downloading = false,
}: {
  payroll: PayrollLike;
  employee: EmployeeLike;
  sections: PayslipSections;
  loans?: PayslipLoans;
  backHref: string;
  onDownload: () => void;
  downloading?: boolean;
}) {
  const [accentHex, setAccentHex] = useState(PAYSLIP_ACCENT_FALLBACK);

  useEffect(() => {
    fetchCompanyProfile().then((p) => setAccentHex(resolvePayslipAccentHex(p)));
  }, []);

  const themeStyle = payslipAccentCssVars(accentHex) as CSSProperties;
  const totalEarnings = sections.totalEarnings ?? 0;
  const totalDeductions = sections.totalDeductions ?? 0;
  const netPayable = sections.netPayable ?? totalEarnings - totalDeductions;
  const configured = sections.hasConfiguredSections;
  const loanSection =
    loans && payslipHasLoans(loans) && loans.items.length > 0 ? loans : null;
  const attendanceRows = chunkRows(sections.attendance, ATTENDANCE_FIELDS_PER_ROW);

  return (
    <div
      className="min-h-[calc(100dvh-5rem)] px-4 py-5 sm:px-6 sm:py-6 lg:px-8"
      style={{
        ...themeStyle,
        background: `linear-gradient(165deg, rgba(var(--ps-accent-rgb), 0.05) 0%, #f8faf9 50%, #f1f5f4 100%)`,
      }}
    >
      <div className="mx-auto mb-4 flex w-full max-w-6xl items-center justify-between">
        <Link
          href={backHref}
          className="text-xs font-medium tracking-wide text-stone-500 transition hover:text-[var(--ps-accent)]"
        >
          ← Back to payslips
        </Link>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading || !configured}
          className="rounded-md px-4 py-2 text-xs font-semibold tracking-wide text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--ps-accent)' }}
        >
          {downloading ? 'Preparing PDF…' : 'Download PDF'}
        </button>
      </div>

      <article
        className="mx-auto flex w-full max-w-6xl flex-col overflow-hidden border bg-white dark:bg-stone-950"
        style={{ ...themeStyle, borderColor: 'var(--ps-accent-border)' }}
      >
      <div className="flex min-h-0 flex-1 flex-col">
        <header
          className="shrink-0 border-b px-5 py-5 text-center sm:px-8"
          style={{
            borderColor: 'var(--ps-accent-border)',
            background: 'linear-gradient(180deg, var(--ps-accent-soft) 0%, transparent 100%)',
          }}
        >
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.35em]"
            style={{ color: 'var(--ps-accent-ink)' }}
          >
            Confidential
          </p>
          <h1 className="mt-1 font-serif text-2xl font-light tracking-tight text-stone-900 dark:text-stone-50 sm:text-3xl">
            Payslip
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {payroll.monthName} {payroll.year}
          </p>
          <div className="mx-auto mt-3 h-0.5 w-16 rounded-full" style={{ backgroundColor: 'var(--ps-accent)' }} />
        </header>

        {!configured ? (
          <div className="flex flex-1 items-center justify-center px-8 py-12 text-center">
            <div>
              <p className="font-serif text-xl text-stone-800 dark:text-stone-100">Layout not configured</p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-stone-500">
                In Payroll Configuration, set each column&apos;s <strong>Payslip section</strong> to Attendance,
                Earnings, or Deductions.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <section
              className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-3 border-b px-5 py-4 text-sm sm:grid-cols-4 sm:px-8"
              style={{ borderColor: 'var(--ps-accent-border)' }}
            >
              <Field label="Employee" value={employee.employee_name} />
              <Field label="ID" value={employee.emp_no} />
              <Field label="Department" value={deptName(employee.department_id)} />
              <Field label="Designation" value={desigName(employee.designation_id)} />
            </section>

            <section
              className="grid shrink-0 grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0"
              style={{ borderColor: 'var(--ps-accent-border)' }}
            >
              <Stat label="Total earnings" value={formatInr(totalEarnings)} accent />
              <Stat label="Total deductions" value={formatInr(totalDeductions)} muted />
              <Stat label="Net payable" value={formatInr(netPayable)} highlight />
            </section>

            {sections.attendance.length > 0 && (
              <section
                className="shrink-0 border-b px-5 py-4 sm:px-8"
                style={{ borderColor: 'var(--ps-accent-border)' }}
              >
                <BlockTitle>Attendance</BlockTitle>
                <div className="mt-3 space-y-2">
                  {attendanceRows.map((row, rowIdx) => (
                    <div
                      key={`att-row-${rowIdx}`}
                      className="grid gap-x-4 gap-y-1"
                      style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                    >
                      {row.map((item, i) => (
                        <AttendanceField key={`${item.header}-${rowIdx}-${i}`} item={item} />
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section
              className="grid min-h-0 flex-1 lg:grid-cols-2 lg:divide-x"
              style={{ borderColor: 'var(--ps-accent-border)' }}
            >
              {sections.earnings.length > 0 && (
                <Ledger
                  title="Earnings"
                  items={sections.earnings}
                  section="earnings"
                  totalLabel="Total earnings"
                  total={totalEarnings}
                />
              )}
              {sections.deductions.length > 0 && (
                <Ledger
                  title="Deductions"
                  items={sections.deductions}
                  section="deductions"
                  totalLabel="Total deductions"
                  total={totalDeductions}
                  isDeduction
                />
              )}
            </section>

            {loanSection && (
              <section
                className="shrink-0 border-t px-5 py-4 sm:px-8"
                style={{ borderColor: 'var(--ps-accent-border)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1 rounded-full bg-amber-600" />
                  <BlockTitle>Loans</BlockTitle>
                </div>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr
                      className="border-b text-left text-[10px] uppercase tracking-wider text-stone-400"
                      style={{ borderColor: 'var(--ps-accent-border)' }}
                    >
                      <th className="pb-2 pr-4 font-semibold">Loan</th>
                      <th className="pb-2 pr-4 text-right font-semibold">Balance before</th>
                      <th className="pb-2 pr-4 text-right font-semibold">EMI deducted</th>
                      <th className="pb-2 text-right font-semibold">Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loanSection.items.map((item, i) => (
                      <tr key={`${item.loanId || item.label}-${i}`} className="border-b border-stone-100 dark:border-stone-800">
                        <td className="py-2 pr-4 text-stone-700 dark:text-stone-300">{item.label}</td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums text-stone-600 dark:text-stone-400">
                          {formatInr(item.balanceBefore)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums text-rose-700 dark:text-rose-400">
                          {formatInr(item.emiDeducted)}
                        </td>
                        <td className="py-2 text-right font-mono font-medium tabular-nums text-stone-900 dark:text-stone-100">
                          {formatInr(item.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="pt-3 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Total</td>
                      <td className="pt-3" />
                      <td className="pt-3 text-right font-mono text-base font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                        {formatInr(loanSection.totalEmiDeducted)}
                      </td>
                      <td className="pt-3 text-right font-mono text-base font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                        {formatInr(loanSection.totalBalanceAfter)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            )}

            <footer
              className="mt-auto shrink-0 px-5 py-5 text-white sm:px-8"
              style={{
                background: `linear-gradient(135deg, color-mix(in srgb, var(--ps-accent) 88%, #0f172a) 0%, #0f172a 100%)`,
              }}
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-200/90">Amount credited</p>
                  <p className="mt-1 font-mono text-3xl font-light tracking-tight sm:text-4xl">{formatInr(netPayable)}</p>
                  <p className="mt-1 text-xs text-stone-300">
                    {formatInr(totalEarnings)} earnings − {formatInr(totalDeductions)} deductions
                  </p>
                </div>
                {payroll.status && (
                  <span
                    className="rounded-sm border px-3 py-1 text-[10px] uppercase tracking-widest"
                    style={{ borderColor: 'var(--ps-accent-muted)', color: 'rgba(255,255,255,0.85)' }}
                  >
                    {payroll.status}
                  </span>
                )}
              </div>
            </footer>
          </div>
        )}
      </div>
      </article>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-0.5 font-medium text-stone-900 dark:text-stone-100">{value || '—'}</p>
    </div>
  );
}

function AttendanceField({ item }: { item: PayslipSectionItem }) {
  return (
    <div className="min-w-0">
      <span className="text-xs text-stone-500">{item.header}: </span>
      <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
        {formatSectionValue(item.value, 'attendance')}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
  accent,
  highlight,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
  highlight?: boolean;
}) {
  if (highlight) {
    return (
      <div className="px-5 py-4 text-white sm:px-8" style={{ backgroundColor: 'var(--ps-accent)' }}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/80">{label}</p>
        <p className="mt-1 font-mono text-lg font-medium tabular-nums sm:text-xl">{value}</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 sm:px-8" style={accent ? { backgroundColor: 'var(--ps-accent-soft)' } : undefined}>
      <p
        className="text-[10px] uppercase tracking-[0.2em]"
        style={{ color: accent ? 'var(--ps-accent-ink)' : 'rgb(120 113 108)' }}
      >
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-lg font-medium tabular-nums sm:text-xl ${
          muted ? 'text-rose-800/90 dark:text-rose-300' : 'text-stone-900 dark:text-stone-100'
        }`}
        style={accent ? { color: 'var(--ps-accent)' } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function BlockTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--ps-accent-ink)' }}>
      {children}
    </h2>
  );
}

function Ledger({
  title,
  items,
  section,
  totalLabel,
  total,
  isDeduction,
}: {
  title: string;
  items: PayslipSections['earnings'];
  section: 'earnings' | 'deductions';
  totalLabel: string;
  total: number;
  isDeduction?: boolean;
}) {
  return (
    <div className="flex flex-col px-5 py-4 sm:px-8">
      <div className="flex items-center gap-2">
        <span className="h-4 w-1 rounded-full" style={{ backgroundColor: isDeduction ? '#e11d48' : 'var(--ps-accent)' }} />
        <BlockTitle>{title}</BlockTitle>
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {items.map((item, i) => (
            <tr key={`${item.header}-${i}`} className="border-b border-stone-100 dark:border-stone-800">
              <td className="py-2 pr-4 text-stone-600 dark:text-stone-400">{item.header}</td>
              <td className="py-2 text-right font-mono font-medium tabular-nums text-stone-900 dark:text-stone-100">
                {formatSectionValue(item.value, section, true)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-3 text-[10px] font-semibold uppercase tracking-wider text-stone-500">{totalLabel}</td>
            <td
              className="pt-3 text-right font-mono text-base font-semibold tabular-nums sm:text-lg"
              style={{ color: isDeduction ? '#be123c' : 'var(--ps-accent)' }}
            >
              {formatInr(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
