/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Day-cell status text for the Complete attendance table (same rules as workspace/superadmin UI).
 * Used by monthly Excel export so single-shift exports match the on-screen grid.
 */

function appendHalfStatus(base: string, marker: string): string {
  if (!marker) return base || '-';
  if (!base || base === '-') return marker;
  if (base === marker) return base;
  if (base === 'A') return marker;
  return `${base}/${marker}`;
}

function timeToMins(t: any): number {
  if (!t) return 0;
  if (t instanceof Date) return t.getHours() * 60 + t.getMinutes();
  const str = String(t);
  if (str.includes('AM') || str.includes('PM')) {
    const [time, modifier] = str.split(' ');
    const timeParts = time.split(':').map(Number);
    let hours = timeParts[0] || 0;
    const minutes = timeParts[1] || 0;
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const [h, m] = str.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function getBaseDisplayStatus(record: any | null): string {
  if (!record) return 'A';
  if (record.status === 'PRESENT') return 'P';
  if (record.status === 'HALF_DAY') return 'HD';
  if (record.status === 'PARTIAL') return 'PT';
  if (record.status === 'HOLIDAY') return 'H';
  if (record.status === 'WEEK_OFF') return 'WO';
  if (record.status === 'LEAVE' || record.hasLeave) {
    return record.leaveInfo?.numberOfDays && record.leaveInfo.numberOfDays >= 3 ? 'LL' : 'L';
  }
  if (record.status === 'OD' || record.hasOD) return 'OD';
  return 'A';
}

export function buildSplitCellStatus(record: any | null): { top: string; bottom: string } | null {
  if (!record) return null;

  const leaveInfo = record.leaveInfo;
  const odInfo = record.odInfo;

  const leaveMarker = leaveInfo ? (leaveInfo.numberOfDays && leaveInfo.numberOfDays >= 3 ? 'LL' : 'L') : '';
  const odMarker = odInfo ? 'OD' : '';
  const hasHalfLeave = !!leaveInfo?.isHalfDay;
  const isHoursOD = !!(odInfo && odInfo.odType_extended === 'hours');
  const hasHalfOD = !!(odInfo && odInfo.odType_extended === 'half_day' && odInfo.isHalfDay);
  const hasFullLeave = !!(leaveInfo && !leaveInfo.isHalfDay);
  const hasFullOD = !!(odInfo && odInfo.odType_extended === 'full_day');

  const partialRule = record.policyMeta?.partialDayRule;
  const hasPartialPolicySplit = record.status === 'PARTIAL' && partialRule?.applied === true;
  const shouldSplit = !isHoursOD && (record.status === 'HALF_DAY' || hasHalfLeave || hasHalfOD || hasPartialPolicySplit);
  if (!shouldSplit) return null;

  let top = 'A';
  let bottom = 'A';

  if (record.status === 'PRESENT') {
    top = 'P';
    bottom = 'P';
  } else if (record.status === 'PARTIAL') {
    if (hasPartialPolicySplit) {
      const toCell = (status?: string | null) => {
        const s = String(status || '').toLowerCase();
        if (s === 'present') return 'PT';
        if (s === 'leave') return 'L';
        if (s === 'od') return 'OD';
        if (s === 'absent') return 'A';
        return 'PT';
      };
      top = toCell(partialRule?.firstHalfStatus);
      bottom = toCell(partialRule?.secondHalfStatus);
    } else {
      top = 'PT';
      bottom = 'PT';
    }
  } else if (record.status === 'HALF_DAY') {
    const eo = Number(record.earlyOutMinutes) || 0;
    const li = Number(record.lateInMinutes) || 0;
    let workedHalf: 'first' | 'second' = eo > li ? 'first' : li > eo ? 'second' : 'first';

    if (eo === li && record.shifts && record.shifts.length > 0) {
      const s = record.shifts[0];
      const sStart = s.shiftStartTime || (typeof s.shiftId === 'object' ? s.shiftId?.startTime : null);
      const sEnd = s.shiftEndTime || (typeof s.shiftId === 'object' ? s.shiftId?.endTime : null);
      if (s.inTime && sStart && s.outTime && sEnd) {
        const inDiff = Math.max(0, timeToMins(s.inTime) - timeToMins(sStart));
        const outDiff = Math.max(0, timeToMins(sEnd) - timeToMins(s.outTime));
        if (inDiff > outDiff) workedHalf = 'second';
        else if (outDiff > inDiff) workedHalf = 'first';
      }
    }

    if (eo === li && record.odInfo?.halfDayType) {
      workedHalf = record.odInfo.halfDayType === 'first_half' ? 'second' : 'first';
    }

    if (workedHalf === 'first') {
      top = 'HD';
      bottom = 'A';
    } else {
      top = 'A';
      bottom = 'HD';
    }
  }

  if (hasHalfOD && record.status === 'OD') {
    const hasIn = !!record.inTime || (record.shifts?.length && record.shifts.some((s: any) => s.inTime));
    const hasOut = !!record.outTime || (record.shifts?.length && record.shifts.some((s: any) => s.outTime));
    if (odInfo?.halfDayType === 'second_half' && hasIn) top = 'HD';
    else if (odInfo?.halfDayType === 'first_half' && hasOut) bottom = 'HD';
  }

  if (hasFullLeave && leaveMarker) {
    top = appendHalfStatus(top, leaveMarker);
    bottom = appendHalfStatus(bottom, leaveMarker);
  } else if (hasHalfLeave && leaveMarker) {
    if (leaveInfo?.halfDayType === 'second_half') bottom = appendHalfStatus(bottom, leaveMarker);
    else top = appendHalfStatus(top, leaveMarker);
  }

  if (hasFullOD && odMarker) {
    top = appendHalfStatus(top, odMarker);
    bottom = appendHalfStatus(bottom, odMarker);
  } else if (hasHalfOD && odMarker) {
    if (odInfo?.halfDayType === 'second_half') bottom = appendHalfStatus(bottom, odMarker);
    else top = appendHalfStatus(top, odMarker);
  }

  return { top, bottom };
}

function formatHoursCell(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '-';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Multi-line text aligned with Complete table day cells (status + optional late/early + shift/hours badges). */
export function formatCompleteDayCellForExcel(record: any | null): string {
  if (!record) return '-';
  const hasData = !!(record.status || record.hasLeave || record.hasOD);
  if (!hasData) return '-';

  const displayStatus = getBaseDisplayStatus(record);
  const splitStatus = buildSplitCellStatus(record);
  const shifts = record?.shifts || [];

  const isLate =
    (record.lateInMinutes != null && record.lateInMinutes > 0) ||
    (shifts && shifts.some((s: any) => s.lateInMinutes != null && s.lateInMinutes > 0));
  const isEarlyOut =
    (record.earlyOutMinutes != null && record.earlyOutMinutes > 0) ||
    (shifts && shifts.some((s: any) => s.earlyOutMinutes != null && s.earlyOutMinutes > 0));
  const suffix = isLate && isEarlyOut ? ' ●◆' : isLate ? ' ●' : isEarlyOut ? ' ◆' : '';

  let text: string;
  if (splitStatus) {
    text = `${splitStatus.top}\n${splitStatus.bottom}`;
  } else {
    text = displayStatus;
  }
  const lines = text.split('\n');
  lines[0] = `${lines[0]}${suffix}`;
  text = lines.join('\n');

  const shiftName = record?.shiftId && typeof record.shiftId === 'object' ? record.shiftId.name : '';
  const shiftBit = shiftName && shiftName !== '-' ? shiftName.substring(0, 3) : '';
  const hoursBit = record.totalHours != null ? formatHoursCell(record.totalHours) : '';
  let odh = '';
  if (record?.odInfo?.odType_extended === 'hours') {
    odh = `ODh${record.odInfo.durationHours != null ? `(${record.odInfo.durationHours}h)` : ''}`;
  }
  const tail = [shiftBit, hoursBit, odh].filter(Boolean).join(' ');
  if (tail) text += `\n${tail}`;
  return text;
}
