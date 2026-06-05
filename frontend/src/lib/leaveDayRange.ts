/** Leave date-range: single-day half (any half) vs multi-day boundary halves. */

export type HalfDayType = 'first_half' | 'second_half';

export type LeaveBoundaryInput = {
  fromDate: string;
  toDate: string;
  isHalfDay?: boolean;
  halfDayType?: HalfDayType | null;
  fromIsHalfDay?: boolean;
  fromHalfDayType?: HalfDayType | null;
  toIsHalfDay?: boolean;
  toHalfDayType?: HalfDayType | null;
};

export type NormalizedLeaveBoundaries = {
  fromIsHalfDay: boolean;
  fromHalfDayType: HalfDayType | null;
  toIsHalfDay: boolean;
  toHalfDayType: HalfDayType | null;
  isHalfDay: boolean;
  halfDayType: HalfDayType | null;
};

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isSameCalendarDay(fromDate: string, toDate: string): boolean {
  if (!fromDate || !toDate) return true;
  return fromDate === toDate;
}

export function eachDateInRange(fromDate: string, toDate: string): string[] {
  if (!fromDate) return [];
  const end = toDate || fromDate;
  const dates: string[] = [];
  const cur = parseDateOnly(fromDate);
  const endD = parseDateOnly(end);
  cur.setHours(0, 0, 0, 0);
  endD.setHours(0, 0, 0, 0);
  while (cur <= endD) {
    dates.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function normalizeLeaveBoundaries(input: LeaveBoundaryInput): NormalizedLeaveBoundaries {
  const sameDay = isSameCalendarDay(input.fromDate, input.toDate || input.fromDate);
  let fromIsHalfDay = Boolean(input.fromIsHalfDay);
  let toIsHalfDay = Boolean(input.toIsHalfDay);
  let fromHalfDayType = input.fromHalfDayType ?? null;
  let toHalfDayType = input.toHalfDayType ?? null;

  if (sameDay) {
    if (input.isHalfDay && !fromIsHalfDay) {
      fromIsHalfDay = true;
      fromHalfDayType = (input.halfDayType as HalfDayType) || fromHalfDayType;
    }
    if (fromIsHalfDay) {
      const half: HalfDayType = fromHalfDayType === 'second_half' ? 'second_half' : 'first_half';
      return {
        fromIsHalfDay: true,
        fromHalfDayType: half,
        toIsHalfDay: false,
        toHalfDayType: null,
        isHalfDay: true,
        halfDayType: half,
      };
    }
    return {
      fromIsHalfDay: false,
      fromHalfDayType: null,
      toIsHalfDay: false,
      toHalfDayType: null,
      isHalfDay: false,
      halfDayType: null,
    };
  }

  if (fromIsHalfDay) fromHalfDayType = 'second_half';
  else fromHalfDayType = null;
  if (toIsHalfDay) toHalfDayType = 'first_half';
  else toHalfDayType = null;

  return {
    fromIsHalfDay,
    fromHalfDayType: fromIsHalfDay ? fromHalfDayType : null,
    toIsHalfDay,
    toHalfDayType: toIsHalfDay ? toHalfDayType : null,
    isHalfDay: false,
    halfDayType: null,
  };
}

export function calculateLeaveNumberOfDays(input: LeaveBoundaryInput): number {
  const b = normalizeLeaveBoundaries(input);
  const dates = eachDateInRange(input.fromDate, input.toDate || input.fromDate);
  if (dates.length === 0) return 0;
  if (dates.length === 1) return b.fromIsHalfDay ? 0.5 : 1;

  let total = 0;
  const start = dates[0];
  const end = dates[dates.length - 1];
  for (const d of dates) {
    if (d === start) total += b.fromIsHalfDay ? 0.5 : 1;
    else if (d === end) total += b.toIsHalfDay ? 0.5 : 1;
    else total += 1;
  }
  return total;
}

export type LeaveDaySegment = {
  dateStr: string;
  isHalfDay: boolean;
  halfDayType: HalfDayType | null;
  numberOfDays: number;
};

export function checkDayHalfCoverageConflict(
  req: { isHalfDay: boolean; halfDayType?: HalfDayType | null },
  other: { isHalfDay: boolean; halfDayType?: HalfDayType | null }
): boolean {
  if (!req.isHalfDay || !other.isHalfDay) return true;
  const a = req.halfDayType || 'first_half';
  const b = other.halfDayType || 'first_half';
  return a === b;
}

export function toCalendarDateStr(value: string | Date | undefined | null): string {
  if (!value) return '';
  if (typeof value === 'string') return value.length >= 10 ? value.slice(0, 10) : value;
  return toISODate(value);
}

export function halfDayTypeShortLabel(half: HalfDayType | string | null | undefined): string {
  if (half === 'second_half') return '2nd half';
  if (half === 'first_half') return '1st half';
  return '';
}

export function formatDayPortionLabel(
  isHalf: boolean,
  halfType?: HalfDayType | string | null,
  role?: 'start' | 'end' | 'single'
): string {
  if (!isHalf) return 'Full day';
  if (role === 'start') return 'Half · 2nd half';
  if (role === 'end') return 'Half · 1st half';
  const h = halfDayTypeShortLabel(halfType);
  return h ? `Half · ${h}` : 'Half day';
}

export type LeaveDetailDisplay = {
  durationText: string;
  fromPortion: string;
  toPortion: string;
  durationNote: string | null;
};

export function getLeaveDetailDisplay(
  leave: LeaveBoundaryInput & { numberOfDays?: number; fromDate: string | Date; toDate: string | Date }
): LeaveDetailDisplay {
  const fromDate = toCalendarDateStr(leave.fromDate);
  const toDate = toCalendarDateStr(leave.toDate || leave.fromDate);
  const input: LeaveBoundaryInput = {
    fromDate,
    toDate,
    isHalfDay: leave.isHalfDay,
    halfDayType: leave.halfDayType as HalfDayType | null,
    fromIsHalfDay: leave.fromIsHalfDay,
    fromHalfDayType: leave.fromHalfDayType as HalfDayType | null,
    toIsHalfDay: leave.toIsHalfDay,
    toHalfDayType: leave.toHalfDayType as HalfDayType | null,
  };
  const b = normalizeLeaveBoundaries(input);
  const days = Number(leave.numberOfDays) || calculateLeaveNumberOfDays(input);
  const same = isSameCalendarDay(fromDate, toDate);

  const fromPortion = same
    ? formatDayPortionLabel(b.isHalfDay, b.halfDayType, 'single')
    : formatDayPortionLabel(b.fromIsHalfDay, b.fromHalfDayType, b.fromIsHalfDay ? 'start' : undefined);

  const toPortion = same
    ? fromPortion
    : formatDayPortionLabel(b.toIsHalfDay, b.toHalfDayType, b.toIsHalfDay ? 'end' : undefined);

  let durationNote: string | null = null;
  if (!same && (b.fromIsHalfDay || b.toIsHalfDay)) {
    const parts: string[] = [];
    if (b.fromIsHalfDay) parts.push('start: 2nd half');
    if (b.toIsHalfDay) parts.push('end: 1st half');
    durationNote = parts.join(' · ');
  } else if (same && b.isHalfDay) {
    durationNote = halfDayTypeShortLabel(b.halfDayType);
  }

  return {
    durationText: `${days} day${days === 1 ? '' : 's'}`,
    fromPortion,
    toPortion,
    durationNote,
  };
}

/** How much leave applies on the viewed calendar day (after per-day segmentation). */
/** Sum leave credit (0.5 / 1 per day) from attendance daily rows when summary is missing or stale. */
export function sumLeaveCreditFromDailyRecords(
  dailyAttendance: Record<string, { hasLeave?: boolean; status?: string; leaveInfo?: { isHalfDay?: boolean; segmentDaysOnDate?: number } | null } | null | undefined> | null | undefined
): number {
  if (!dailyAttendance) return 0;
  let sum = 0;
  for (const record of Object.values(dailyAttendance)) {
    if (!record?.hasLeave && record?.status !== 'LEAVE') continue;
    const li = record.leaveInfo;
    if (!li) {
      sum += 1;
      continue;
    }
    if (typeof li.segmentDaysOnDate === 'number' && li.segmentDaysOnDate > 0) {
      sum += li.segmentDaysOnDate;
    } else if (li.isHalfDay) {
      sum += 0.5;
    } else {
      sum += 1;
    }
  }
  return Math.round(sum * 100) / 100;
}

export function formatAttendanceLeaveDayPortion(leaveInfo: {
  isHalfDay?: boolean;
  halfDayType?: HalfDayType | string | null;
  fromDate?: string | Date;
  toDate?: string | Date;
} | null | undefined): string {
  if (!leaveInfo) return '—';
  if (!leaveInfo.isHalfDay) return 'Full day';
  const from = toCalendarDateStr(leaveInfo.fromDate);
  const to = toCalendarDateStr(leaveInfo.toDate || leaveInfo.fromDate);
  if (isSameCalendarDay(from, to)) {
    return formatDayPortionLabel(true, leaveInfo.halfDayType, 'single');
  }
  if (leaveInfo.halfDayType === 'second_half') {
    return formatDayPortionLabel(true, 'second_half', 'start');
  }
  if (leaveInfo.halfDayType === 'first_half') {
    return formatDayPortionLabel(true, 'first_half', 'end');
  }
  return 'Half day';
}

export function expandLeaveToDailySegments(input: LeaveBoundaryInput): LeaveDaySegment[] {
  const b = normalizeLeaveBoundaries(input);
  const dates = eachDateInRange(input.fromDate, input.toDate || input.fromDate);
  const start = dates[0];
  const end = dates[dates.length - 1];

  return dates.map((dateStr) => {
    if (dates.length === 1) {
      if (b.fromIsHalfDay) {
        return {
          dateStr,
          isHalfDay: true,
          halfDayType: b.fromHalfDayType,
          numberOfDays: 0.5,
        };
      }
      return { dateStr, isHalfDay: false, halfDayType: null, numberOfDays: 1 };
    }
    if (dateStr === start && b.fromIsHalfDay) {
      return { dateStr, isHalfDay: true, halfDayType: 'second_half', numberOfDays: 0.5 };
    }
    if (dateStr === end && b.toIsHalfDay) {
      return { dateStr, isHalfDay: true, halfDayType: 'first_half', numberOfDays: 0.5 };
    }
    return { dateStr, isHalfDay: false, halfDayType: null, numberOfDays: 1 };
  });
}
