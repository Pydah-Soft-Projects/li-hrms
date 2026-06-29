/** Hour-based OD overlap math (mirrors backend AttendanceDaily gap-fill). */

export type HoursOdCreditResult = {
  requestedMinutes: number;
  requestedHours: number;
  odInShiftMinutes: number;
  odInPunchMinutes: number;
  creditableMinutes: number;
  creditableHours: number;
  odOutsideShift: boolean;
  fullyCoveredByPunches: boolean;
  partialPunchOverlap: boolean;
  suggestedGaps: Array<{
    kind: 'before_punch_in' | 'after_punch_out';
    startTime: string;
    endTime: string;
    label: string;
  }>;
};

const timeStrToMins = (t: string | null | undefined): number => {
  if (!t || typeof t !== 'string') return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const formatMinsAsHm = (mins: number): string => {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h}h ${r}m`;
  if (h > 0) return `${h}h`;
  return `${r}m`;
};

const formatMinsAsTime = (mins: number): string => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

const overlapMinuteRanges = (startA: number, endA: number, startB: number, endB: number): number => {
  const expand = (s: number, e: number): [number, number][] => {
    if (e > s) return [[s, e]];
    return [
      [s, 24 * 60],
      [0, e],
    ];
  };
  const aParts = expand(startA, endA);
  const bParts = expand(startB, endB);
  let total = 0;
  for (const [as, ae] of aParts) {
    for (const [bs, be] of bParts) {
      const start = Math.max(as, bs);
      const end = Math.min(ae, be);
      if (end > start) total += end - start;
    }
  }
  return total;
};

export const timeStringsOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean => {
  return (
    overlapMinuteRanges(
      timeStrToMins(startA),
      timeStrToMins(endA),
      timeStrToMins(startB),
      timeStrToMins(endB)
    ) > 0
  );
};

export const computeHoursOdCredit = (input: {
  odStartTime: string;
  odEndTime: string;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  punchInTime?: string | null;
  punchOutTime?: string | null;
}): HoursOdCreditResult => {
  const odStart = timeStrToMins(input.odStartTime);
  const odEnd = timeStrToMins(input.odEndTime);
  const requestedMinutes = odEnd > odStart ? odEnd - odStart : 0;

  let odInShiftMinutes = requestedMinutes;
  if (input.shiftStartTime && input.shiftEndTime) {
    odInShiftMinutes = overlapMinuteRanges(
      odStart,
      odEnd,
      timeStrToMins(input.shiftStartTime),
      timeStrToMins(input.shiftEndTime)
    );
  }

  let odInPunchMinutes = 0;
  if (input.punchInTime && input.punchOutTime) {
    odInPunchMinutes = overlapMinuteRanges(
      odStart,
      odEnd,
      timeStrToMins(input.punchInTime),
      timeStrToMins(input.punchOutTime)
    );
  }

  const creditableMinutes = Math.max(0, odInShiftMinutes - odInPunchMinutes);

  const gapBeforeStart = input.shiftStartTime ? timeStrToMins(input.shiftStartTime) : null;
  const gapBeforeEnd = input.punchInTime ? timeStrToMins(input.punchInTime) : null;
  const gapAfterStart = input.punchOutTime ? timeStrToMins(input.punchOutTime) : null;
  const gapAfterEnd = input.shiftEndTime ? timeStrToMins(input.shiftEndTime) : null;

  const suggestedGaps: HoursOdCreditResult['suggestedGaps'] = [];
  if (gapBeforeStart != null && gapBeforeEnd != null && gapBeforeEnd > gapBeforeStart) {
    suggestedGaps.push({
      kind: 'before_punch_in',
      startTime: formatMinsAsTime(gapBeforeStart),
      endTime: formatMinsAsTime(gapBeforeEnd),
      label: `Before punch-in (${formatMinsAsTime(gapBeforeStart)}–${formatMinsAsTime(gapBeforeEnd)})`,
    });
  }
  if (gapAfterStart != null && gapAfterEnd != null && gapAfterEnd > gapAfterStart) {
    suggestedGaps.push({
      kind: 'after_punch_out',
      startTime: formatMinsAsTime(gapAfterStart),
      endTime: formatMinsAsTime(gapAfterEnd),
      label: `After punch-out (${formatMinsAsTime(gapAfterStart)}–${formatMinsAsTime(gapAfterEnd)})`,
    });
  }

  return {
    requestedMinutes,
    requestedHours: Math.round((requestedMinutes / 60) * 100) / 100,
    odInShiftMinutes,
    odInPunchMinutes,
    creditableMinutes,
    creditableHours: Math.round((creditableMinutes / 60) * 100) / 100,
    odOutsideShift: Boolean(
      input.shiftStartTime && input.shiftEndTime && odInShiftMinutes === 0 && requestedMinutes > 0
    ),
    fullyCoveredByPunches: Boolean(
      input.punchInTime && input.punchOutTime && creditableMinutes === 0 && requestedMinutes > 0
    ),
    partialPunchOverlap: Boolean(
      input.punchInTime && odInPunchMinutes > 0 && creditableMinutes > 0 && odInPunchMinutes < requestedMinutes
    ),
    suggestedGaps,
  };
};
