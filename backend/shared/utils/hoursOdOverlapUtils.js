/**
 * Hour-based OD overlap math (mirrors AttendanceDaily gap-fill logic).
 * creditable = (OD ∩ shift) − (OD ∩ punches)
 */

const { extractISTComponents } = require('./dateUtils');

const timeStrToMins = (t) => {
  if (!t || typeof t !== 'string') return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const formatMinsAsHm = (mins) => {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h}h ${r}m`;
  if (h > 0) return `${h}h`;
  return `${r}m`;
};

const formatMinsAsTime = (mins) => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

/** Overlap in minutes between two same-day minute ranges (end exclusive if end <= start → overnight). */
const overlapMinuteRanges = (startA, endA, startB, endB) => {
  const expand = (s, e) => {
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

const timeStringsOverlap = (startA, endA, startB, endB) => {
  return overlapMinuteRanges(timeStrToMins(startA), timeStrToMins(endA), timeStrToMins(startB), timeStrToMins(endB)) > 0;
};

const dateToIstTimeStr = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
};

/**
 * @param {Object} input
 * @param {string} input.odStartTime - HH:MM
 * @param {string} input.odEndTime - HH:MM
 * @param {string|null} input.shiftStartTime - HH:MM
 * @param {string|null} input.shiftEndTime - HH:MM
 * @param {string|null} input.punchInTime - HH:MM IST
 * @param {string|null} input.punchOutTime - HH:MM IST
 */
const computeHoursOdCredit = ({
  odStartTime,
  odEndTime,
  shiftStartTime,
  shiftEndTime,
  punchInTime,
  punchOutTime,
}) => {
  const odStart = timeStrToMins(odStartTime);
  const odEnd = timeStrToMins(odEndTime);
  const requestedMinutes = odEnd > odStart ? odEnd - odStart : 0;

  let odInShiftMinutes = requestedMinutes;
  if (shiftStartTime && shiftEndTime) {
    odInShiftMinutes = overlapMinuteRanges(
      odStart,
      odEnd,
      timeStrToMins(shiftStartTime),
      timeStrToMins(shiftEndTime)
    );
  }

  let odInPunchMinutes = 0;
  if (punchInTime && punchOutTime) {
    odInPunchMinutes = overlapMinuteRanges(
      odStart,
      odEnd,
      timeStrToMins(punchInTime),
      timeStrToMins(punchOutTime)
    );
  }

  const creditableMinutes = Math.max(0, odInShiftMinutes - odInPunchMinutes);

  const gapBeforeStart =
    shiftStartTime && punchInTime
      ? Math.max(timeStrToMins(shiftStartTime), 0)
      : shiftStartTime
        ? timeStrToMins(shiftStartTime)
        : null;
  const gapBeforeEnd = punchInTime ? timeStrToMins(punchInTime) : null;
  const gapAfterStart = punchOutTime ? timeStrToMins(punchOutTime) : null;
  const gapAfterEnd = shiftEndTime ? timeStrToMins(shiftEndTime) : null;

  const suggestedGaps = [];
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
    odOutsideShift: Boolean(shiftStartTime && shiftEndTime && odInShiftMinutes === 0 && requestedMinutes > 0),
    fullyCoveredByPunches: Boolean(
      punchInTime && punchOutTime && creditableMinutes === 0 && requestedMinutes > 0
    ),
    partialPunchOverlap: Boolean(
      punchInTime && odInPunchMinutes > 0 && creditableMinutes > 0 && odInPunchMinutes < requestedMinutes
    ),
    suggestedGaps,
    formatMinsAsHm,
  };
};

module.exports = {
  timeStrToMins,
  formatMinsAsHm,
  formatMinsAsTime,
  overlapMinuteRanges,
  timeStringsOverlap,
  dateToIstTimeStr,
  computeHoursOdCredit,
};
