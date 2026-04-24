/**
 * Partial column = sum of payable contributions on PARTIAL-status days (aligned with Payable / monthly summary).
 */

export type PartialContributionDailyRecord = {
  status?: string | null;
  payableShifts?: number | null;
  shifts?: Array<{ payableShift?: number | null }> | null;
};

export type PartialContributingSummary = {
  totalPartialDays?: number | null;
  /** PARTIAL days: sum(min(dayPresent, dayPayable)) from monthly summary calc (pay register overlap guard). */
  totalPartialPresentPayableOverlap?: number | null;
  contributingDates?: {
    partial?: Array<string | { date?: string; value?: number; label?: string }> | null;
  } | null;
};

export function getPartialRecordPayableContribution(
  record: PartialContributionDailyRecord | null | undefined
): number {
  if (!record || record.status !== 'PARTIAL') return 0;
  const ps = Number(record.payableShifts);
  const shifts = record.shifts;
  const fromShifts = Array.isArray(shifts)
    ? shifts.reduce((a, sh) => a + (Number(sh?.payableShift) || 0), 0)
    : 0;
  const v = Number.isFinite(ps) && ps >= 0 ? ps : fromShifts;
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(Math.min(v, 1) * 100) / 100;
}

export function sumPartialContributionsFromDaily(
  daily: Record<string, PartialContributionDailyRecord | null | undefined>
): number {
  return Math.round(
    Object.values(daily).reduce((s, r) => s + getPartialRecordPayableContribution(r), 0) * 100
  ) / 100;
}

export function getPartialColumnTotal(
  summary: PartialContributingSummary | null | undefined,
  daily: Record<string, PartialContributionDailyRecord | null | undefined>
): number {
  const partial = summary?.contributingDates?.partial;
  if (Array.isArray(partial) && partial.length > 0) {
    return Math.round(
      partial.reduce((acc, e) => {
        if (typeof e === 'string') return acc + 1;
        const v = (e as { value?: number }).value;
        return acc + (Number.isFinite(Number(v)) ? Number(v) : 1);
      }, 0) * 100
    ) / 100;
  }
  const t = Number(summary?.totalPartialDays);
  if (Number.isFinite(t)) return Math.round(t * 100) / 100;
  return sumPartialContributionsFromDaily(daily);
}
