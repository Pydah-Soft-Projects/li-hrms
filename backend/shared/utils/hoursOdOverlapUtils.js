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

/**
 * Hour-based OD waives late-in when it overlaps the shift-start → punch-in gap
 * by at least the counted late minutes (OD credits the pre-punch gap).
 */
const hoursOdWaivesLateIn = ({
  odStartTime,
  odEndTime,
  shiftStartTime,
  punchInTime,
  lateInMinutes,
}) => {
  const late = Number(lateInMinutes) || 0;
  if (late <= 0 || !odStartTime || !odEndTime || !shiftStartTime || !punchInTime) return false;
  const gapOverlap = overlapMinuteRanges(
    timeStrToMins(shiftStartTime),
    timeStrToMins(punchInTime),
    timeStrToMins(odStartTime),
    timeStrToMins(odEndTime)
  );
  return gapOverlap >= late;
};

/**
 * Hour-based OD waives early-out when it overlaps the punch-out → shift-end gap
 * by at least the counted early-out minutes (OD credits the post-punch gap).
 */
const hoursOdWaivesEarlyOut = ({
  odStartTime,
  odEndTime,
  shiftEndTime,
  punchOutTime,
  earlyOutMinutes,
}) => {
  const early = Number(earlyOutMinutes) || 0;
  if (early <= 0 || !odStartTime || !odEndTime || !shiftEndTime || !punchOutTime) return false;
  const gapOverlap = overlapMinuteRanges(
    timeStrToMins(punchOutTime),
    timeStrToMins(shiftEndTime),
    timeStrToMins(odStartTime),
    timeStrToMins(odEndTime)
  );
  return gapOverlap >= early;
};

/**
 * Resolve late/early waiver flags for a summary day from half/full-day OD flags
 * plus hour-based OD gap coverage on attendance shifts.
 */
const resolveHourOdLateEarlyWaiver = (day) => {
  let lateInWaved = !!day?.lateInWaved;
  let earlyOutWaved = !!day?.earlyOutWaved;
  if (lateInWaved && earlyOutWaved) return { lateInWaved, earlyOutWaved };

  const hourOds = (day?.ods || []).filter(
    (o) => String(o?.odType_extended || '') === 'hours' && o.odStartTime && o.odEndTime
  );
  if (hourOds.length === 0) return { lateInWaved, earlyOutWaved };

  const shifts =
    day?.attendance && Array.isArray(day.attendance.shifts) ? day.attendance.shifts : [];
  if (shifts.length === 0) return { lateInWaved, earlyOutWaved };

  for (const shift of shifts) {
    const punchIn = shift.inTime ? dateToIstTimeStr(shift.inTime) : null;
    const punchOut = shift.outTime ? dateToIstTimeStr(shift.outTime) : null;
    const shiftStart = shift.shiftStartTime || null;
    const shiftEnd = shift.shiftEndTime || null;
    const lateMin = Number(shift.lateInMinutes) || 0;
    const earlyMin = Number(shift.earlyOutMinutes) || 0;

    for (const od of hourOds) {
      if (
        !lateInWaved &&
        lateMin > 0 &&
        hoursOdWaivesLateIn({
          odStartTime: od.odStartTime,
          odEndTime: od.odEndTime,
          shiftStartTime: shiftStart,
          punchInTime: punchIn,
          lateInMinutes: lateMin,
        })
      ) {
        lateInWaved = true;
      }
      if (
        !earlyOutWaved &&
        earlyMin > 0 &&
        hoursOdWaivesEarlyOut({
          odStartTime: od.odStartTime,
          odEndTime: od.odEndTime,
          shiftEndTime: shiftEnd,
          punchOutTime: punchOut,
          earlyOutMinutes: earlyMin,
        })
      ) {
        earlyOutWaved = true;
      }
    }
  }

  return { lateInWaved, earlyOutWaved };
};

/** Half/full-day OD waiver flags (same rules as summary OD overlay). */
function applyHalfFullDayOdWaiverFlags(day) {
  let lateInWaved = !!day?.lateInWaved;
  let earlyOutWaved = !!day?.earlyOutWaved;
  for (const od of day?.ods || []) {
    if (String(od?.odType_extended || '') === 'hours') continue;
    const odDays = Number(od.numberOfDays) || 0;
    const isFullDayOd =
      (!od.isHalfDay && String(od.odType_extended || '') !== 'hours') ||
      od.odType_extended === 'full_day' ||
      odDays >= 1 - 1e-6;
    if (isFullDayOd) {
      lateInWaved = true;
      earlyOutWaved = true;
    } else if (od.halfDayType === 'first_half') {
      lateInWaved = true;
    } else if (od.halfDayType === 'second_half') {
      earlyOutWaved = true;
    } else {
      lateInWaved = true;
    }
  }
  return { lateInWaved, earlyOutWaved };
}

/** Combined late/early waiver for summary, deductions, and pay register. */
const resolveDayLateEarlyWaiver = (day) => {
  const flags = applyHalfFullDayOdWaiverFlags(day);
  return resolveHourOdLateEarlyWaiver({ ...day, ...flags });
};

module.exports = {
  timeStrToMins,
  formatMinsAsHm,
  formatMinsAsTime,
  overlapMinuteRanges,
  timeStringsOverlap,
  dateToIstTimeStr,
  computeHoursOdCredit,
  hoursOdWaivesLateIn,
  hoursOdWaivesEarlyOut,
  resolveHourOdLateEarlyWaiver,
  resolveDayLateEarlyWaiver,
};
