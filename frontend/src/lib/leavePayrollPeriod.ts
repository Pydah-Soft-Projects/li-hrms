import {
  formatPayrollPeriodRangeLabel,
  getPayrollPeriodForDate,
  leaveDatesInSinglePayrollPeriod,
} from './payPeriodRange';

export function getLeaveApplyPayrollPeriod(
  fromYmd: string,
  payrollCycleStartDay: number,
  payrollCycleEndDay: number | null | undefined
) {
  return getPayrollPeriodForDate(fromYmd, payrollCycleStartDay, payrollCycleEndDay);
}

/** User-facing error when from/to cross payroll period boundaries; null if OK. */
export function buildCrossPayrollPeriodLeaveError(
  fromYmd: string,
  toYmd: string,
  payrollCycleStartDay: number,
  payrollCycleEndDay: number | null | undefined
): string | null {
  if (!fromYmd?.trim()) return null;
  const to = (toYmd || fromYmd).trim();
  const check = leaveDatesInSinglePayrollPeriod(
    fromYmd,
    to,
    payrollCycleStartDay,
    payrollCycleEndDay
  );
  if (check.ok) return null;
  return (
    `One leave request cannot span payroll periods. ` +
    `${formatPayrollPeriodRangeLabel(check.fromPeriod.from, check.fromPeriod.to)} covers the start date; ` +
    `${formatPayrollPeriodRangeLabel(check.toPeriod.from, check.toPeriod.to)} covers the end date. ` +
    `Submit separate applications (e.g. apply only for ${fromYmd}, then apply again for dates in the next period). All dates use IST (Asia/Kolkata).`
  );
}

export function capToDateToPayrollPeriod(
  fromYmd: string,
  toYmd: string,
  payrollCycleStartDay: number,
  payrollCycleEndDay: number | null | undefined
): { toDate: string; adjusted: boolean; periodLabel?: string } {
  const period = getPayrollPeriodForDate(fromYmd, payrollCycleStartDay, payrollCycleEndDay);
  if (!period) return { toDate: toYmd || fromYmd, adjusted: false };
  const to = toYmd || fromYmd;
  if (to >= period.from && to <= period.to) {
    return { toDate: to, adjusted: false };
  }
  const capped = to > period.to ? period.to : fromYmd;
  return {
    toDate: capped,
    adjusted: true,
    periodLabel: formatPayrollPeriodRangeLabel(period.from, period.to),
  };
}

export function earliestIsoDate(...dates: (string | undefined)[]): string | undefined {
  const valid = dates.filter((d): d is string => !!d && d.trim().length > 0);
  if (!valid.length) return undefined;
  return valid.reduce((min, d) => (d < min ? d : min));
}
