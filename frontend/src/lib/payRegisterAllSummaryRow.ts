/**
 * Pay Register "All" view — summary column math (aligns with superadmin pay-register /activeTable === 'all' rows).
 * Monthly attendance summary uses the same basis as pay register when synced.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Same shape as MAS `contributingDates` partials used for overlap (pay register / totalsCalculationService). */
type ContributingDateEntry = { date?: string; value?: number };

export type MonthlySummaryLike = {
  totalPresentDays?: number;
  totalPayableShifts?: number;
  totalPartialDays?: number;
  totalPartialPresentPayableOverlap?: number;
  contributingDates?: {
    present?: ContributingDateEntry[];
    partial?: ContributingDateEntry[];
  };
  totalWeeklyOffs?: number;
  totalHolidays?: number;
  totalLeaves?: number;
  totalPaidLeaves?: number;
  totalLopLeaves?: number;
  totalODs?: number;
  totalAbsentDays?: number;
  lateInCount?: number;
  earlyOutCount?: number;
  lateOrEarlyCount?: number;
  totalAttendanceDeductionDays?: number;
  attendanceDeductionBreakdown?: { daysDeducted?: number };
  totalDaysInMonth?: number;
} | null;

export type PayRegisterAllRowOptions = {
  /** When `single_shift`, present matches pay register (present + partial − overlap). */
  processingMode?: 'single_shift' | 'multi_shift' | null;
  /** When true (Security division/department only), counts extra payable shifts towards paidDays. */
  isSecurity?: boolean;
};

/**
 * Universal security employee check for frontend UI (attendance, pay register, Excel export).
 * Checks department, division, designation, role across all object shapes (populated ref, flat object, etc.).
 */
export function isSecurityEmployee(empOrRow: any): boolean {
  if (!empOrRow) return false;
  const emp =
    typeof empOrRow === 'object' && empOrRow.employee && typeof empOrRow.employee === 'object'
      ? empOrRow.employee
      : typeof empOrRow === 'object' && empOrRow.employeeId && typeof empOrRow.employeeId === 'object'
      ? empOrRow.employeeId
      : empOrRow;

  const parts = [
    typeof emp?.department_id === 'object' ? emp.department_id?.name : '',
    typeof emp?.division_id === 'object' ? emp.division_id?.name : '',
    typeof emp?.designation_id === 'object'
      ? (emp.designation_id?.name || emp.designation_id?.title)
      : '',
    typeof emp?.department === 'object'
      ? emp.department?.name
      : typeof emp?.department === 'string'
      ? emp.department
      : '',
    typeof emp?.division === 'object'
      ? emp.division?.name
      : typeof emp?.division === 'string'
      ? emp.division
      : '',
    typeof emp?.designation === 'object'
      ? emp.designation?.name
      : typeof emp?.designation === 'string'
      ? emp.designation
      : '',
    emp?.department_name,
    emp?.division_name,
    emp?.designation_name,
    emp?.role,
    typeof empOrRow?.department === 'object'
      ? empOrRow.department?.name
      : typeof empOrRow?.department === 'string'
      ? empOrRow.department
      : '',
    typeof empOrRow?.division === 'object'
      ? empOrRow.division?.name
      : typeof empOrRow?.division === 'string'
      ? empOrRow.division
      : '',
    typeof empOrRow?.designation === 'object'
      ? empOrRow.designation?.name
      : typeof empOrRow?.designation === 'string'
      ? empOrRow.designation
      : '',
    empOrRow?.department_name,
    empOrRow?.division_name,
    empOrRow?.designation_name,
  ];

  return /security/i.test(parts.filter(Boolean).join(' '));
}


function contributingDatesPartialPresentOverlap(s: NonNullable<MonthlySummaryLike>): number {
  const cd = s.contributingDates;
  if (!cd || typeof cd !== 'object') return 0;
  const partialArr = cd.partial;
  const presentArr = cd.present;
  if (!Array.isArray(partialArr) || !Array.isArray(presentArr) || partialArr.length === 0) return 0;

  const presentByDate = new Map<string, number>();
  for (const e of presentArr) {
    if (!e?.date) continue;
    const d = String(e.date);
    const v = Number(e.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    presentByDate.set(d, round2((presentByDate.get(d) || 0) + v));
  }
  const partialByDate = new Map<string, number>();
  for (const e of partialArr) {
    if (!e?.date) continue;
    const d = String(e.date);
    const v = Number(e.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    partialByDate.set(d, round2((partialByDate.get(d) || 0) + v));
  }
  let t = 0;
  for (const [d, partSum] of partialByDate) {
    const pSum = presentByDate.get(d);
    if (pSum == null || pSum <= 0 || partSum <= 0) continue;
    t += Math.min(pSum, partSum);
  }
  return round2(t);
}

function getPartialPresentOverlapForSync(s: NonNullable<MonthlySummaryLike>, partialRollup: number): number {
  const cdOverlap = contributingDatesPartialPresentOverlap(s);
  let stored = 0;
  if (Object.prototype.hasOwnProperty.call(s, 'totalPartialPresentPayableOverlap')) {
    const n = Number(s.totalPartialPresentPayableOverlap);
    if (Number.isFinite(n)) stored = round2(n);
  }
  const raw = round2(Math.max(stored, cdOverlap));
  const partCap = round2(partialRollup);
  if (partCap <= 0) return 0;
  return round2(Math.min(raw, partCap));
}

/** Mirrors `syncTotalsFromMonthlySummary` (single_shift branch) in totalsCalculationService. */
export function mergeSingleShiftPresentForPayRegisterLikeRow(s: NonNullable<MonthlySummaryLike>): number {
  const sPresRaw = round2(Number(s.totalPresentDays) || 0);
  const sPartRaw = round2(Number(s.totalPartialDays) || 0);
  const sOverlapRaw = getPartialPresentOverlapForSync(s, sPartRaw);
  let merged = round2(sPresRaw + sPartRaw - sOverlapRaw);
  const ceiling = round2(sPresRaw + sPartRaw);
  merged = Math.min(ceiling, Math.max(sPresRaw, merged));
  return merged;
}

export type PayRegisterAllRow = {
  present: number;
  weekOffs: number;
  holidays: number;
  totalLeaves: number;
  od: number;
  absent: number;
  totalDaysSummed: number;
  lates: number;
  dedAbsent: number;
  dedLop: number;
  attDed: number;
  paidLeaves: number;
  paidDays: number;
};

export function computePayRegisterAllRowFromMonthlySummary(
  s: MonthlySummaryLike,
  options?: PayRegisterAllRowOptions
): PayRegisterAllRow {
  if (!s) {
    return {
      present: 0,
      weekOffs: 0,
      holidays: 0,
      totalLeaves: 0,
      od: 0,
      absent: 0,
      totalDaysSummed: 0,
      lates: 0,
      dedAbsent: 0,
      dedLop: 0,
      attDed: 0,
      paidLeaves: 0,
      paidDays: 0,
    };
  }
  const isSingleShift = options?.processingMode === 'single_shift';
  const isSecurity = Boolean(options?.isSecurity);
  const useMerge = isSingleShift;
  const present = useMerge
    ? mergeSingleShiftPresentForPayRegisterLikeRow(s)
    : round2(Number(s.totalPresentDays) || 0);
  const rawPayableShifts = Number(s.totalPayableShifts);
  const usePayableShifts = Boolean(
    (isSecurity || (!isSingleShift && rawPayableShifts > present)) &&
    Number.isFinite(rawPayableShifts) &&
    rawPayableShifts > present
  );
  const payableBase = usePayableShifts ? round2(rawPayableShifts) : present;
  const weekOffs = round2(Number(s.totalWeeklyOffs) || 0);
  const holidays = round2(Number(s.totalHolidays) || 0);
  const paidLeaves = round2(Number(s.totalPaidLeaves) || 0);
  const lop = round2(Number(s.totalLopLeaves) || 0);
  const totalLeaves = round2(
    s.totalLeaves != null
      ? Number(s.totalLeaves)
      : (Number(s.totalPaidLeaves) || 0) + (Number(s.totalLopLeaves) || 0)
  );
  const od = round2(Number(s.totalODs) || 0);
  const absent = round2(Number(s.totalAbsentDays) || 0);
  const lates =
    s.lateInCount != null || s.earlyOutCount != null
      ? (Number(s.lateInCount) || 0) + (Number(s.earlyOutCount) || 0)
      : Number(s.lateOrEarlyCount) || 0;
  const attRaw = s.totalAttendanceDeductionDays ?? s.attendanceDeductionBreakdown?.daysDeducted ?? 0;
  const attDed = Number.isFinite(Number(attRaw)) ? round2(Number(attRaw)) : 0;
  const totalDaysSummed = round2(present + weekOffs + holidays + totalLeaves + od + absent);
  let paidDays = Math.max(
    0,
    round2(
      usePayableShifts
        ? payableBase + weekOffs + holidays + od + paidLeaves - attDed
        : present + weekOffs + holidays + od + paidLeaves - attDed
    )
  );
  if (isSingleShift && !isSecurity) {
    const maxDays = Number((s as any)?.totalDaysInMonth) || totalDaysSummed || 31;
    if (maxDays > 0) {
      paidDays = Math.min(paidDays, maxDays);
    }
  }
  return {
    present,
    weekOffs,
    holidays,
    totalLeaves,
    od,
    absent,
    totalDaysSummed,
    lates,
    dedAbsent: absent,
    dedLop: lop,
    attDed,
    paidLeaves,
    paidDays,
  };
}

export function formatPolicyAttendanceDeductionDisplay(
  total: number,
  _breakdown?: { daysDeducted?: number } | null
): string {
  const n = Number(total);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(2).replace(/\.?0+$/, '') || '0';
}

export function paidLopSublabel(paid: number, lop: number): string {
  const p = round2(paid);
  const l = round2(lop);
  return `paid ${p} · lop ${l}`;
}
