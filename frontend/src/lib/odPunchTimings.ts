/** Attendance-derived punch window for legacy CO ODs (GET /leaves/od/:id). */
export type OdAttendancePunchTimings = {
  date?: string;
  odStartTime?: string | null;
  odEndTime?: string | null;
  durationHours?: number | null;
  fromAttendance?: boolean;
};

export type OdPunchTimingSource = {
  odStartTime?: string | null;
  odEndTime?: string | null;
  durationHours?: number | null;
  isCOEligible?: boolean;
  attendancePunchTimings?: OdAttendancePunchTimings | null;
  /** GET /leaves/od/:id — CO OD with no attendance punches for fromDate */
  attendanceNotLoggedForDay?: boolean;
  attendanceNotLoggedDate?: string;
};

export function isCoEligibleOdForPunchDisplay(od: OdPunchTimingSource | null | undefined): boolean {
  if (!od) return false;
  return Boolean(od.isCOEligible || od.attendancePunchTimings || od.attendanceNotLoggedForDay);
}

export function getOdDisplayPunchTimings(od: OdPunchTimingSource | null | undefined) {
  if (!od) {
    return { start: null as string | null, end: null as string | null, duration: null as number | null, fromAttendance: false };
  }
  const att = od.attendancePunchTimings;
  const start = od.odStartTime || att?.odStartTime || null;
  const end = od.odEndTime || att?.odEndTime || null;
  const duration = od.durationHours ?? att?.durationHours ?? null;
  return {
    start,
    end,
    duration,
    fromAttendance: Boolean(!od.odStartTime && att?.odStartTime),
  };
}

export function formatOdPunchTimeHHMM(time: string | null | undefined): string {
  const [h, m] = (time || '').split(':');
  if (!h) return 'N/A';
  const date = new Date();
  date.setHours(parseInt(h, 10), parseInt(m || '0', 10));
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}
