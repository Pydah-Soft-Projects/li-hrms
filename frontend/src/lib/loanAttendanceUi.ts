/** Shared loan attendance-summary helpers (apply dialog, detail, print). */

export type LoanAttendanceMonth = {
  month?: string;
  monthName?: string;
  workingDays?: number;
  present?: number;
  payableShifts?: number;
  leave?: number;
  lop?: number;
  attendancePercent?: number | null;
};

export type LoanAttendanceSummary = {
  last6Months?: LoanAttendanceMonth[];
  overallPercentage?: number | null;
  totalWorkingDays?: number;
  totalPresentDays?: number;
  totalPayableShifts?: number;
  processingMode?: string;
  isMultiShift?: boolean;
};

export function loanAttendanceShowsPayableShifts(
  summary?: LoanAttendanceSummary | null,
): boolean {
  if (!summary) return false;
  if (summary.isMultiShift === true || summary.processingMode === 'multi_shift') return true;
  return (summary.last6Months || []).some(
    (row) => Number(row.payableShifts || 0) > Number(row.present || 0) + 0.01,
  );
}

export function formatLoanAttendanceQty(n?: number | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 100) / 100);
}
