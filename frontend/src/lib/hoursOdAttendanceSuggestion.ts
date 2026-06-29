import {
  computeHoursOdCredit,
  formatMinsAsHm,
  timeStringsOverlap,
  type HoursOdCreditResult,
} from '@/lib/hoursOdOverlap';
import {
  formatAttendancePresenceLine,
  type ApprovedRecordsPayload,
  type ApplyDateCheckBannerState,
} from '@/lib/leaveApplyApprovedRecords';

export type HoursOdAttendanceContext = {
  punchInTime?: string | null;
  punchOutTime?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
};

export type HoursOdSuggestion = {
  blocked: boolean;
  suggestion: string | null;
  credit: HoursOdCreditResult | null;
  /** Fill OD start/end from a suggested gap */
  suggestWindow?: { odStartTime: string; odEndTime: string; label: string };
};

export function getHoursOdAttendanceSuggestion(
  attendance: HoursOdAttendanceContext | null | undefined,
  odStartTime: string,
  odEndTime: string
): HoursOdSuggestion {
  if (!odStartTime || !odEndTime) {
    return { blocked: false, suggestion: null, credit: null };
  }

  const [startH, startM] = odStartTime.split(':').map(Number);
  const [endH, endM] = odEndTime.split(':').map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  if (startMin >= endMin) {
    return { blocked: true, suggestion: 'End time must be after start time.', credit: null };
  }

  const credit = computeHoursOdCredit({
    odStartTime,
    odEndTime,
    shiftStartTime: attendance?.shiftStartTime,
    shiftEndTime: attendance?.shiftEndTime,
    punchInTime: attendance?.punchInTime,
    punchOutTime: attendance?.punchOutTime,
  });

  if (credit.fullyCoveredByPunches) {
    const punchLabel =
      attendance?.punchInTime && attendance?.punchOutTime
        ? `${attendance.punchInTime}–${attendance.punchOutTime}`
        : 'recorded punches';
    let suggestWindow: HoursOdSuggestion['suggestWindow'];
    const gap = credit.suggestedGaps[0];
    if (gap) {
      suggestWindow = { odStartTime: gap.startTime, odEndTime: gap.endTime, label: gap.label };
    }
    return {
      blocked: true,
      suggestion: `This OD window is fully covered by attendance (${punchLabel}). Only gap time counts — pick a time outside punches or correct attendance first.`,
      credit,
      suggestWindow,
    };
  }

  if (credit.odOutsideShift && attendance?.shiftStartTime && attendance?.shiftEndTime) {
    return {
      blocked: false,
      suggestion: `OD is outside shift ${attendance.shiftStartTime}–${attendance.shiftEndTime} and may not improve attendance.`,
      credit,
    };
  }

  if (credit.partialPunchOverlap) {
    return {
      blocked: false,
      suggestion: `Estimated credit: ${formatMinsAsHm(credit.creditableMinutes)} of ${formatMinsAsHm(credit.requestedMinutes)} after punch overlap.`,
      credit,
    };
  }

  if (!attendance?.punchInTime && !attendance?.punchOutTime) {
    return {
      blocked: false,
      suggestion: `Estimated credit: ${formatMinsAsHm(credit.creditableMinutes)}. No punches yet — OD credits when attendance is processed.`,
      credit,
    };
  }

  if (credit.creditableMinutes > 0) {
    return {
      blocked: false,
      suggestion: `Estimated credit: ${formatMinsAsHm(credit.creditableMinutes)} (gap not covered by punches).`,
      credit,
    };
  }

  return { blocked: false, suggestion: null, credit };
}

function isFullDayOdInfo(odInfo: ApprovedRecordsPayload['odInfo']): boolean {
  if (!odInfo) return false;
  if (odInfo.odType_extended === 'hours') return false;
  if (odInfo.isHalfDay || odInfo.odType_extended === 'half_day') return false;
  return true;
}

function isHalfDayOdInfo(odInfo: ApprovedRecordsPayload['odInfo']): boolean {
  if (!odInfo) return false;
  if (odInfo.odType_extended === 'hours') return false;
  return Boolean(odInfo.isHalfDay || odInfo.odType_extended === 'half_day');
}

export function getHoursOdApplyDateCheckBannerState(
  info: ApprovedRecordsPayload | null | undefined,
  odStartTime: string,
  odEndTime: string
): ApplyDateCheckBannerState | null {
  if (!info) return null;

  const hasLeave = Boolean(info.hasLeave);
  const hasOD = Boolean(info.hasOD);
  const hasAttendance = Boolean(info.attendanceInfo?.hasAttendance);
  const hoursOds = info.hoursOdsOnDate || [];

  if (!hasLeave && !hasOD && !hasAttendance && hoursOds.length === 0 && !odStartTime) {
    return null;
  }

  const attendanceLabel = formatAttendancePresenceLine(info.attendanceInfo);
  const leaveLine = hasLeave
    ? info.leaveInfo?.isHalfDay
      ? `${info.leaveInfo.halfDayType === 'first_half' ? 'First' : 'Second'} half leave (approved)`
      : 'Full day leave (approved)'
    : null;

  const odLine = hasOD
    ? info.odInfo?.odType_extended === 'hours'
      ? `Hour OD ${info.odInfo.odStartTime || ''}–${info.odInfo.odEndTime || ''} (approved)`
      : info.odInfo?.isHalfDay
        ? `${info.odInfo.halfDayType === 'first_half' ? 'First' : 'Second'} half OD (approved)`
        : 'Full day OD (approved)'
    : null;

  if (hasLeave && !info.leaveInfo?.isHalfDay) {
    return {
      variant: 'error',
      headline: 'Cannot apply hour-based OD on this date',
      body: 'An approved full-day leave already exists on this date.',
      blocked: true,
      dateFullyCovered: false,
      showOppositeHalfNote: false,
      attendanceLabel,
      leaveLine,
      odLine,
      halfDayAction: null,
      coverage: null,
    };
  }

  if (isFullDayOdInfo(info.odInfo)) {
    return {
      variant: 'error',
      headline: 'Cannot apply hour-based OD on this date',
      body: 'An approved full-day OD already exists on this date.',
      blocked: true,
      dateFullyCovered: false,
      showOppositeHalfNote: false,
      attendanceLabel,
      leaveLine,
      odLine,
      halfDayAction: null,
      coverage: null,
    };
  }

  if (odStartTime && odEndTime) {
    for (const h of hoursOds) {
      if (h.odStartTime && h.odEndTime && timeStringsOverlap(odStartTime, odEndTime, h.odStartTime, h.odEndTime)) {
        return {
          variant: 'error',
          headline: 'OD time overlaps existing hour-based OD',
          body: `Approved/pending hour OD ${h.odStartTime}–${h.odEndTime} overlaps your window ${odStartTime}–${odEndTime}.`,
          blocked: true,
          dateFullyCovered: false,
          showOppositeHalfNote: false,
          attendanceLabel,
          leaveLine,
          odLine,
          halfDayAction: null,
          coverage: null,
        };
      }
    }
  }

  const hoursGuidance = getHoursOdAttendanceSuggestion(info.attendanceInfo, odStartTime, odEndTime);

  if (hoursGuidance.blocked) {
    return {
      variant: 'error',
      headline: 'OD window fully covered by attendance',
      body: hoursGuidance.suggestion || 'Adjust OD times to cover a gap not already punched.',
      blocked: true,
      dateFullyCovered: false,
      showOppositeHalfNote: false,
      attendanceLabel,
      leaveLine,
      odLine,
      halfDayAction: null,
      coverage: null,
    };
  }

  const shiftLine =
    info.attendanceInfo?.shiftStartTime && info.attendanceInfo?.shiftEndTime
      ? `Shift ${info.attendanceInfo.shiftStartTime}–${info.attendanceInfo.shiftEndTime}`
      : null;
  const punchLine =
    info.attendanceInfo?.punchInTime || info.attendanceInfo?.punchOutTime
      ? `Punches ${info.attendanceInfo.punchInTime || '—'}–${info.attendanceInfo.punchOutTime || '—'}`
      : null;

  let body = hoursGuidance.suggestion || 'Confirm OD times cover a gap outside attendance punches.';
  if (isHalfDayOdInfo(info.odInfo)) {
    body = `Half-day OD exists on this date. ${body}`;
  } else if (hasLeave && info.leaveInfo?.isHalfDay) {
    body = `Half-day leave exists on this date. ${body}`;
  }

  const extra = [shiftLine, punchLine].filter(Boolean).join(' · ');
  if (extra) body = `${body} ${extra}.`;

  return {
    variant: hoursGuidance.suggestion?.includes('outside shift') ? 'warning' : 'info',
    headline: 'Hour-based OD — gap credit preview',
    body,
    blocked: false,
    dateFullyCovered: false,
    showOppositeHalfNote: false,
    attendanceLabel,
    leaveLine,
    odLine,
    halfDayAction: null,
    coverage: null,
  };
}
