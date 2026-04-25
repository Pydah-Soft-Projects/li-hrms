/**
 * Day cell text for attendance PDF — mirrors workspace attendance page
 * (getBaseDisplayStatus + buildSplitCellStatus) for a merged daily display record
 * (same shape as getMonthlyTableViewData dailyAttendance[date]).
 */

function timeToMins(t) {
  if (!t) return 0;
  if (t instanceof Date) return t.getHours() * 60 + t.getMinutes();
  const str = String(t);
  if (str.includes('AM') || str.includes('PM')) {
    const [time, modifier] = str.split(' ');
    let [hours, minutes] = (time || '').split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return (hours || 0) * 60 + (minutes || 0);
  }
  const [h, m] = str.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function appendHalfStatus(base, marker) {
  if (!marker) return base || '-';
  if (!base || base === '-') return marker;
  if (base === marker) return base;
  if (base === 'A') return marker;
  return `${base}/${marker}`;
}

function getBaseDisplayStatus(record) {
  if (!record) return 'A';
  const st = String(record.status || '');
  if (st === 'PRESENT') return 'P';
  if (st === 'HALF_DAY') return 'HD';
  if (st === 'PARTIAL') return 'PT';
  if (st === 'HOLIDAY' || st === 'HOL') return 'H';
  if (st === 'WEEK_OFF' || st === 'WO') return 'WO';
  if (st === 'LEAVE' || record.hasLeave) {
    const n = record.leaveInfo && record.leaveInfo.numberOfDays;
    return n && n >= 3 ? 'LL' : 'L';
  }
  if (st === 'OD' || record.hasOD) return 'OD';
  if (st === 'ABSENT' || st === 'A') return 'A';
  if (st === '' || st === '-') return st || '';
  return 'A';
}

function buildSplitCellStatus(record) {
  if (!record) return null;
  const leaveInfo = record.leaveInfo;
  const odInfo = record.odInfo;
  const leaveMarker = leaveInfo ? (leaveInfo.numberOfDays && leaveInfo.numberOfDays >= 3 ? 'LL' : 'L') : '';
  const odMarker = odInfo ? 'OD' : '';
  const hasHalfLeave = !!leaveInfo && !!leaveInfo.isHalfDay;
  const isHoursOD = !!(odInfo && odInfo.odType_extended === 'hours');
  const hasHalfOD = !!(odInfo && (odInfo.odType_extended === 'half_day' || odInfo.isHalfDay));
  const hasFullLeave = !!(leaveInfo && !leaveInfo.isHalfDay);
  const hasFullOD = !!(odInfo && odInfo.odType_extended === 'full_day');
  const partialRule = record.policyMeta && record.policyMeta.partialDayRule;
  const hasPartialPolicySplit = String(record.status) === 'PARTIAL' && partialRule && partialRule.applied === true;
  const shouldSplit =
    !isHoursOD &&
    (String(record.status) === 'HALF_DAY' ||
      hasHalfLeave ||
      hasHalfOD ||
      hasPartialPolicySplit);
  if (!shouldSplit) return null;

  let top = 'A';
  let bottom = 'A';

  if (String(record.status) === 'PRESENT') {
    top = 'P';
    bottom = 'P';
  } else if (String(record.status) === 'PARTIAL') {
    if (hasPartialPolicySplit) {
      const toCell = (status) => {
        const s = String(status || '').toLowerCase();
        if (s === 'present') return 'PT';
        if (s === 'leave') return 'L';
        if (s === 'od') return 'OD';
        if (s === 'absent') return 'A';
        return 'PT';
      };
      top = toCell(partialRule.firstHalfStatus);
      bottom = toCell(partialRule.secondHalfStatus);
    } else {
      top = 'PT';
      bottom = 'PT';
    }
  } else if (String(record.status) === 'HALF_DAY') {
    const eo = Number(record.earlyOutMinutes) || 0;
    const li = Number(record.lateInMinutes) || 0;
    let workedHalf = eo > li ? 'first' : li > eo ? 'second' : 'first';
    if (eo === li && record.shifts && record.shifts.length > 0) {
      const s = record.shifts[0];
      const sStart = s.shiftStartTime || (typeof s.shiftId === 'object' && s.shiftId ? s.shiftId.startTime : null);
      const sEnd = s.shiftEndTime || (typeof s.shiftId === 'object' && s.shiftId ? s.shiftId.endTime : null);
      if (s.inTime && sStart && s.outTime && sEnd) {
        const inDiff = Math.max(0, timeToMins(s.inTime) - timeToMins(sStart));
        const outDiff = Math.max(0, timeToMins(sEnd) - timeToMins(s.outTime));
        if (inDiff > outDiff) workedHalf = 'second';
        else if (outDiff > inDiff) workedHalf = 'first';
      }
    }
    if (eo === li && odInfo && odInfo.halfDayType) {
      workedHalf = odInfo.halfDayType === 'first_half' ? 'second' : 'first';
    }
    if (workedHalf === 'first') {
      top = 'HD';
      bottom = 'A';
    } else {
      top = 'A';
      bottom = 'HD';
    }
  }

  if (hasHalfOD && String(record.status) === 'OD') {
    const hasIn = !!(record.inTime || (record.shifts && record.shifts.length && record.shifts.some((s) => s.inTime)));
    const hasOut = !!(record.outTime || (record.shifts && record.shifts.length && record.shifts.some((s) => s.outTime)));
    if (odInfo.halfDayType === 'second_half' && hasIn) top = 'HD';
    else if (odInfo.halfDayType === 'first_half' && hasOut) bottom = 'HD';
  }

  if (hasFullLeave && leaveMarker) {
    top = appendHalfStatus(top, leaveMarker);
    bottom = appendHalfStatus(bottom, leaveMarker);
  } else if (hasHalfLeave && leaveMarker) {
    if (leaveInfo.halfDayType === 'second_half') bottom = appendHalfStatus(bottom, leaveMarker);
    else top = appendHalfStatus(top, leaveMarker);
  }

  if (hasFullOD && odMarker) {
    top = appendHalfStatus(top, odMarker);
    bottom = appendHalfStatus(bottom, odMarker);
  } else if (hasHalfOD && odMarker) {
    if (odInfo.halfDayType === 'second_half') bottom = appendHalfStatus(bottom, odMarker);
    else top = appendHalfStatus(top, odMarker);
  }

  return { top, bottom };
}

/**
 * @param {object} displayRecord - getMonthlyTableViewData dailyAttendance[date] object
 * @param {{ in: string, out: string }} io
 * @returns {string} multi-line text for the PDF cell
 */
function formatPdfDayCellText(displayRecord, io) {
  if (!displayRecord) return 'A\n-\n-';
  const st = String(displayRecord.status || '');
  if (st === '') return '';
  if (st === '-') return '-';

  const split = buildSplitCellStatus(displayRecord);
  const inStr = (io && io.in) || '-';
  const outStr = (io && io.out) || '-';
  if (split) {
    return `1H: ${split.top}\nIN ${inStr} · OUT ${outStr}\n2H: ${split.bottom}`;
  }
  const one = getBaseDisplayStatus(displayRecord);
  return `${one}\nIN ${inStr}\nOUT ${outStr}`;
}

module.exports = {
  formatPdfDayCellText,
  getBaseDisplayStatus,
  buildSplitCellStatus,
};
