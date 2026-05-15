/**
 * Payroll month date range aligned with attendance / payroll settings
 * (same rules as workspace attendance month + payroll_cycle_start_day / payroll_cycle_end_day).
 */

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
