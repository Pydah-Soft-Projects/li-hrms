/**
 * Shared helpers for monthly summary → day-cell highlight badges (workspace + superadmin).
 */

export type AttendanceHighlightDateEntry = { value: number; label: string };

type AttendanceDailyLike = {
  status?: string;
  hasLeave?: boolean;
  leaveNature?: string;
  leaveInfo?: {
    leaveType?: string;
    leaveNature?: string;
    isHalfDay?: boolean;
    segmentDaysOnDate?: number;
  } | null;
  policyMeta?: {
    partialDayRule?: { lopPortion?: number } | null;
    sandwichRule?: { applied?: boolean; effect?: string | null } | null;
  } | null;
};

export function normalizeContributingDateKey(date: unknown): string {
  if (!date) return '';
  if (typeof date === 'string') return date.substring(0, 10);
  if (date instanceof Date) return date.toISOString().substring(0, 10);
  try {
    return new Date(date as string | number).toISOString().substring(0, 10);
  } catch {
    return String(date).substring(0, 10);
  }
}

export function contributingEntryMatchesDate(
  entry: string | { date?: unknown },
  dStr: string
): boolean {
  if (typeof entry === 'string') return normalizeContributingDateKey(entry) === dStr;
  return normalizeContributingDateKey(entry?.date) === dStr;
}

function mergeHighlightEntry(
  map: Map<string, AttendanceHighlightDateEntry>,
  dateStr: string,
  value: number,
  label: string
) {
  const v = Math.round(value * 100) / 100;
  if (!dateStr || v <= 0) return;
  const existing = map.get(dateStr);
  if (!existing) {
    map.set(dateStr, { value: v, label: label || '' });
    return;
  }
  const merged = Math.round((existing.value + v) * 100) / 100;
  map.set(dateStr, { value: merged, label: label || existing.label });
}

export function buildContributingCategoryDateMap(
  items: Array<string | { date?: unknown; value?: number; label?: string }> | undefined
): Map<string, AttendanceHighlightDateEntry> {
  const map = new Map<string, AttendanceHighlightDateEntry>();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (typeof item === 'string') {
      mergeHighlightEntry(map, normalizeContributingDateKey(item), 1, '');
      continue;
    }
    const dateStr = normalizeContributingDateKey(item?.date);
    if (!dateStr) continue;
    const value =
      item && 'value' in item && item.value != null && Number.isFinite(Number(item.value))
        ? Number(item.value)
        : 1;
    const label = item && 'label' in item ? String(item.label ?? '') : '';
    mergeHighlightEntry(map, dateStr, value, label);
  }
  return map;
}

export function isAttendanceRecordLop(record: AttendanceDailyLike | null | undefined): boolean {
  if (!record) return false;
  const nature = String(record.leaveNature || record.leaveInfo?.leaveNature || '').toLowerCase();
  const leaveType = String(record.leaveInfo?.leaveType || '').toLowerCase();
  return (
    nature === 'lop' ||
    nature === 'without_pay' ||
    leaveType.includes('lop') ||
    leaveType.includes('loss of pay') ||
    leaveType.includes('sandwich')
  );
}

export function isAttendanceRecordPaidLeave(record: AttendanceDailyLike | null | undefined): boolean {
  if (!record?.hasLeave && record?.status !== 'LEAVE') return false;
  return !isAttendanceRecordLop(record);
}

function leaveCreditOnAttendanceRecord(record: AttendanceDailyLike): number {
  const li = record.leaveInfo;
  if (!li) return 1;
  if (typeof li.segmentDaysOnDate === 'number' && li.segmentDaysOnDate > 0) {
    return li.segmentDaysOnDate;
  }
  if (li.isHalfDay) return 0.5;
  return 1;
}

function appendLopLeavesFallbackFromDaily(
  map: Map<string, AttendanceHighlightDateEntry>,
  dailyAttendance: Record<string, AttendanceDailyLike | null | undefined> | null | undefined
) {
  if (!dailyAttendance) return;
  for (const [dateStr, record] of Object.entries(dailyAttendance)) {
    if (!record) continue;
    if (record.hasLeave || record.status === 'LEAVE') {
      if (isAttendanceRecordLop(record)) {
        const v = leaveCreditOnAttendanceRecord(record);
        mergeHighlightEntry(map, dateStr, v, v === 1 ? 'LOP' : `LOP (${v})`);
      }
    }
    const lopPortion = record.policyMeta?.partialDayRule?.lopPortion;
    if (typeof lopPortion === 'number' && lopPortion > 0) {
      mergeHighlightEntry(map, dateStr, lopPortion, `LOP (${lopPortion})`);
    }
    const sandwich = record.policyMeta?.sandwichRule;
    if (sandwich?.applied && String(sandwich.effect || '').toLowerCase().includes('lop')) {
      mergeHighlightEntry(map, dateStr, 1, 'LOP');
    }
  }
}

function appendPaidLeavesFallbackFromDaily(
  map: Map<string, AttendanceHighlightDateEntry>,
  dailyAttendance: Record<string, AttendanceDailyLike | null | undefined> | null | undefined
) {
  if (!dailyAttendance) return;
  for (const [dateStr, record] of Object.entries(dailyAttendance)) {
    if (!record) continue;
    if (!(record.hasLeave || record.status === 'LEAVE')) continue;
    if (!isAttendanceRecordPaidLeave(record)) continue;
    const v = leaveCreditOnAttendanceRecord(record);
    mergeHighlightEntry(map, dateStr, v, 'Paid');
  }
}

function appendAbsentFallbackFromDaily(
  map: Map<string, AttendanceHighlightDateEntry>,
  dailyAttendance: Record<string, { status?: string } | null | undefined> | null | undefined
) {
  if (!dailyAttendance) return;
  for (const [dateStr, record] of Object.entries(dailyAttendance)) {
    if (record?.status === 'ABSENT') {
      map.set(dateStr, { value: 1, label: '' });
    }
  }
}

/**
 * Resolve which calendar days contribute to a monthly summary column highlight.
 * Uses stored contributingDates when present; falls back to dailyAttendance for absent / LOP / paid leave.
 */
export function resolveAttendanceHighlightDateMap(
  summary:
    | {
        contributingDates?: Record<
          string,
          Array<string | { date?: unknown; value?: number; label?: string }>
        >;
      }
    | null
    | undefined,
  dailyAttendance: Record<string, AttendanceDailyLike | null | undefined> | null | undefined,
  category: string,
  partialPayableFn?: (record: AttendanceDailyLike) => number
): Map<string, AttendanceHighlightDateEntry> {
  const cd = summary?.contributingDates as
    | Record<string, Array<string | { date?: unknown; value?: number; label?: string }>>
    | undefined;
  const fromSummary = buildContributingCategoryDateMap(cd?.[category]);
  if (fromSummary.size > 0) return fromSummary;

  const map = new Map<string, AttendanceHighlightDateEntry>();
  if (category === 'absent') {
    appendAbsentFallbackFromDaily(map, dailyAttendance);
  } else if (category === 'lopLeaves') {
    appendLopLeavesFallbackFromDaily(map, dailyAttendance);
  } else if (category === 'paidLeaves') {
    appendPaidLeavesFallbackFromDaily(map, dailyAttendance);
  } else if (category === 'partial' && dailyAttendance && partialPayableFn) {
    for (const [dateStr, record] of Object.entries(dailyAttendance)) {
      if (record?.status === 'PARTIAL') {
        const v = partialPayableFn(record);
        map.set(dateStr, { value: v, label: v > 0 ? `PT (${v})` : 'PARTIAL' });
      }
    }
  }
  return map;
}

/** True if the attendance detail has at least one check-in or check-out (shift-level or legacy root fields). */
export function hasAttendancePunches(detail: unknown): boolean {
  const d = detail as Record<string, unknown> | null | undefined;
  if (!d) return false;
  const shifts = d.shifts as Array<{ inTime?: unknown; outTime?: unknown }> | undefined;
  if (Array.isArray(shifts) && shifts.some((s) => s?.inTime || s?.outTime)) return true;
  if (d.inTime || d.outTime) return true;
  return false;
}

/**
 * Full-day OD (not hour-based, not half-day) with an OD id we can revoke.
 * Matches legacy rows where odType_extended is unset and isHalfDay is false.
 */
export function isFullDayOdEligibleForConflictRevoke(detail: unknown): boolean {
  const d = detail as Record<string, unknown> | null | undefined;
  const oi = d?.odInfo as Record<string, unknown> | undefined;
  if (!d?.hasOD || !oi || !oi.odId) return false;
  if (oi.odType_extended === 'hours') return false;
  if (oi.odType_extended === 'half_day' || oi.isHalfDay) return false;
  return oi.odType_extended === 'full_day' || !oi.isHalfDay;
}

export function formatHighlightContribution(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 1000) / 1000;
  if (Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Second line under the numeric contribution. Omit for absent (value-only) and for
 * redundant single-letter codes that match "present" style (P, Pay, OD, etc.).
 * For leaves, show leave type only (strip legacy " (0.5)" suffix from API label).
 */
export function highlightBadgeSubtitle(
  category: string,
  label: string | undefined | null
): string | null {
  const L = (label || '').trim();
  if (!L) return null;
  if (category === 'absent') return null;
  if (category === 'present' && L === 'P') return null;
  if (category === 'payableShifts' && L === 'Pay') return null;
  if (category === 'ods' && L === 'OD') return null;
  if (category === 'partial' && L === 'PARTIAL') return null;
  if (category === 'weeklyOffs' && (L === 'WO' || L === 'WEEK_OFF')) return null;
  if (category === 'holidays' && (L === 'HOL' || L === 'HOLIDAY')) return null;
  if (category === 'permissions' && L === 'Perm') return null;
  if (category === 'otHours' && /^OT\s*\(/i.test(L)) return null;
  if (category === 'extraHours' && /^Ex\s*\(/i.test(L)) return null;
  if (category === 'leaves' || category === 'paidLeaves' || category === 'lopLeaves') {
    const stripped = L.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return stripped || null;
  }
  return L;
}
