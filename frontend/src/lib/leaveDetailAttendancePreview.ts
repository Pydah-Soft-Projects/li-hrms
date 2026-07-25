/** Types + helpers for leave-detail attendance occupancy preview (approve/reject). */

export type LeaveAttendanceOccupancy = 'free' | 'partial' | 'occupied';

export type LeaveAttendancePreviewDay = {
  date: string;
  leaveIsHalfDay: boolean;
  leaveHalfDayType: 'first_half' | 'second_half' | null;
  leaveLabel: string;
  occupancy: LeaveAttendanceOccupancy;
  attendance: {
    hasAttendance: boolean;
    status: string | null;
    firstHalfPresent: boolean;
    secondHalfPresent: boolean;
    fullDayPresent: boolean;
    label: string | null;
    punchInTime: string | null;
    punchOutTime: string | null;
  } | null;
  note: string;
};

export type LeaveAttendancePreview = {
  days: LeaveAttendancePreviewDay[];
  totalDays: number;
  occupiedDays: number;
  freeDays: number;
  partialDays: number;
  allOccupied: boolean;
  someOccupied: boolean;
  approveBlocked: boolean;
  summary: string;
  fromDate: string;
  toDate: string;
};

export function formatPreviewDate(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
