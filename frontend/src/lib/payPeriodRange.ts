/**
 * Payroll month date range aligned with attendance / payroll settings (IST).
 * Same rules as backend dateCycleService + payroll_cycle_start_day / payroll_cycle_end_day.
 */

import { istYmdToParts, normalizeToISTYmd } from './istDate';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month1Based: number): number {
  return new Date(year, month1Based, 0).getDate();
}

/**
 * Payroll period (from/to YYYY-MM-DD, IST) that contains a calendar date.
 * e.g. cycle 26–25 → 26 Jan–25 Feb is the February-labelled period.
 */
export function getPayrollPeriodForDate(
  dateInput: string,
  payrollCycleStartDay: number,
  payrollCycleEndDay: number | null | undefined
): { from: string; to: string; month: number; year: number } | null {
  const ymd = normalizeToISTYmd(dateInput);
  if (!ymd) return null;
  const parts = istYmdToParts(ymd);
  if (!parts) return null;
  const year = parts.year;
  const month1 = parts.month;
  const day = parts.day;
  const startDay =
    payrollCycleStartDay >= 1 && payrollCycleStartDay <= 31 ? payrollCycleStartDay : 1;
  const rawEnd = payrollCycleEndDay;
  const endDay =
    rawEnd != null && !Number.isNaN(Number(rawEnd)) && Number(rawEnd) >= 1 && Number(rawEnd) <= 31
      ? Number(rawEnd)
      : startDay > 1
        ? startDay - 1
        : 31;

  if (startDay <= 1 && endDay >= 28) {
    const actualEnd = Math.min(endDay, lastDayOfMonth(year, month1));
    return {
      from: `${year}-${pad2(month1)}-01`,
      to: `${year}-${pad2(month1)}-${pad2(actualEnd)}`,
      month: month1,
      year,
    };
  }

  if (day >= startDay) {
    let nextMonth = month1 + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const endActual = Math.min(endDay, lastDayOfMonth(nextYear, nextMonth));
    const periodEndMonth = nextMonth;
    const periodEndYear = nextYear;
    return {
      from: `${year}-${pad2(month1)}-${pad2(startDay)}`,
      to: `${nextYear}-${pad2(nextMonth)}-${pad2(endActual)}`,
      month: periodEndMonth,
      year: periodEndYear,
    };
  }

  let prevMonth = month1 - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const endActual = Math.min(endDay, lastDayOfMonth(year, month1));
  return {
    from: `${prevYear}-${pad2(prevMonth)}-${pad2(startDay)}`,
    to: `${year}-${pad2(month1)}-${pad2(endActual)}`,
    month: month1,
    year,
  };
}

export function formatPayrollPeriodRangeLabel(fromYmd: string, toYmd: string): string {
  const fmt = (ymd: string) => {
    const p = ymd.split('-').map((x) => parseInt(x, 10));
    const d = new Date(p[0], p[1] - 1, p[2]);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  return `${fmt(fromYmd)} – ${fmt(toYmd)}`;
}

/** True when from and to (inclusive) lie in the same payroll period. */
export function leaveDatesInSinglePayrollPeriod(
  fromYmd: string,
  toYmd: string,
  payrollCycleStartDay: number,
  payrollCycleEndDay: number | null | undefined
): { ok: true; period: { from: string; to: string } } | { ok: false; fromPeriod: { from: string; to: string }; toPeriod: { from: string; to: string } } {
  const to = toYmd?.trim() || fromYmd;
  const fromPeriod = getPayrollPeriodForDate(fromYmd, payrollCycleStartDay, payrollCycleEndDay);
  const toPeriod = getPayrollPeriodForDate(to, payrollCycleStartDay, payrollCycleEndDay);
  if (!fromPeriod || !toPeriod) {
    return { ok: true, period: fromPeriod || toPeriod || { from: fromYmd, to: to } };
  }
  if (fromPeriod.from === toPeriod.from && fromPeriod.to === toPeriod.to) {
    return { ok: true, period: { from: fromPeriod.from, to: fromPeriod.to } };
  }
  return { ok: false, fromPeriod: { from: fromPeriod.from, to: fromPeriod.to }, toPeriod: { from: toPeriod.from, to: toPeriod.to } };
}

export function getPayPeriodRangeForCalendarMonth(
  year: number,
  month1Based: number,
  payrollCycleStartDay: number,
  payrollCycleEndDay: number | null | undefined
): { from: string; to: string } {
  const startDay =
    payrollCycleStartDay >= 1 && payrollCycleStartDay <= 31 ? payrollCycleStartDay : 1;
  const rawEnd = payrollCycleEndDay;
  const endD =
    rawEnd != null && !Number.isNaN(Number(rawEnd)) && Number(rawEnd) >= 1 && Number(rawEnd) <= 31
      ? Number(rawEnd)
      : startDay > 1
        ? startDay - 1
        : 31;

  if (startDay <= 1) {
    const lastDay = new Date(year, month1Based, 0).getDate();
    const actualEnd = Math.min(endD, lastDay);
    return {
      from: `${year}-${String(month1Based).padStart(2, '0')}-01`,
      to: `${year}-${String(month1Based).padStart(2, '0')}-${String(actualEnd).padStart(2, '0')}`,
    };
  }

  let startYear = year;
  let startMonth = month1Based - 1;
  if (startMonth < 1) {
    startMonth = 12;
    startYear -= 1;
  }
  const from = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;

  const endDateObj = new Date(year, month1Based - 1, endD);
  const ey = endDateObj.getFullYear();
  const em = endDateObj.getMonth() + 1;
  const ed = endDateObj.getDate();
  const to = `${ey}-${String(em).padStart(2, '0')}-${String(ed).padStart(2, '0')}`;
  return { from, to };
}

export type LeaveODPayPeriodOption = {
  value: string;
  label: string;
  range: { from: string; to: string };
};

export function buildLeaveODPayPeriodOptions(args: {
  payrollCycleStartDay: number;
  payrollCycleEndDay: number | null | undefined;
  monthsBack: number;
  /** Additional future payroll months (e.g. loan EMI start scheduling). */
  monthsForward?: number;
  getDefaultRange: () => { from: string; to: string };
  defaultLabel?: string;
}): LeaveODPayPeriodOption[] {
  const {
    payrollCycleStartDay,
    payrollCycleEndDay,
    monthsBack,
    monthsForward = 0,
    getDefaultRange,
    defaultLabel = 'Current period (default)',
  } = args;

  const opts: LeaveODPayPeriodOption[] = [];
  const seen = new Set<string>();

  const pushOption = (opt: LeaveODPayPeriodOption) => {
    if (seen.has(opt.value)) return;
    seen.add(opt.value);
    opts.push(opt);
  };

  pushOption({
    value: '__default__',
    label: defaultLabel,
    range: getDefaultRange(),
  });

  const now = new Date();

  for (let i = 1; i <= monthsForward; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const range = getPayPeriodRangeForCalendarMonth(y, m, payrollCycleStartDay, payrollCycleEndDay);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    pushOption({
      value: `full:${y}-${String(m).padStart(2, '0')}`,
      label: `${label} (upcoming)`,
      range,
    });
  }

  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const range = getPayPeriodRangeForCalendarMonth(y, m, payrollCycleStartDay, payrollCycleEndDay);
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    pushOption({
      value: `full:${y}-${String(m).padStart(2, '0')}`,
      label,
      range,
    });
  }
  return opts;
}

/** Human label for a payroll month key using pay cycle settings. */
/** Legacy approved loan/advance with no locked first deduction month from final approval. */
export function loanNeedsDisbursementPayPeriod(loan: {
  approvals?: { final?: { firstDeductionPayrollMonth?: string } };
  advanceConfig?: { deductionStartCycle?: string };
}): boolean {
  const locked = String(loan.approvals?.final?.firstDeductionPayrollMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(locked)) return false;
  const cycle = String(loan.advanceConfig?.deductionStartCycle || '').trim();
  if (/^\d{4}-\d{2}$/.test(cycle)) return false;
  return true;
}

export function formatPayrollMonthKeyLabel(
  monthKey: string,
  payrollCycleStartDay: number,
  payrollCycleEndDay: number | null | undefined
): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  if (!m) return monthKey;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const range = getPayPeriodRangeForCalendarMonth(y, mo, payrollCycleStartDay, payrollCycleEndDay);
  const label = new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return `${label} (${range.from} → ${range.to})`;
}

/** Map leave/OD pay-period dropdown value to payroll month key (YYYY-MM). */
export function payPeriodSelectValueToMonthKey(
  value: string,
  presentPayrollMonthKey?: string | null
): string | null {
  const v = String(value || '').trim();
  if (!v) return null;
  if (v === '__custom__') return null;
  if (v === '__default__') {
    const pk = String(presentPayrollMonthKey || '').trim();
    return /^\d{4}-\d{2}$/.test(pk) ? pk : null;
  }
  const full = /^full:(\d{4}-\d{2})$/.exec(v);
  if (full) return full[1];
  if (/^\d{4}-\d{2}$/.test(v)) return v;
  return null;
}

export function payrollMonthKeyToPayPeriodSelectValue(monthKey: string): string {
  return `full:${monthKey}`;
}

export function matchLeaveODPayPeriodSelectValue(
  dateRange: { from: string; to: string },
  options: LeaveODPayPeriodOption[],
  /** Live match for "default" range (e.g. through today) so it stays correct when options are memoized. */
  getDefaultRange?: () => { from: string; to: string }
): string {
  if (getDefaultRange) {
    const d = getDefaultRange();
    if (d.from === dateRange.from && d.to === dateRange.to) return '__default__';
  }
  for (const o of options) {
    if (o.value === '__default__') continue;
    if (o.range.from === dateRange.from && o.range.to === dateRange.to) return o.value;
  }
  return '__custom__';
}
