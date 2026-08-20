'use client';

import {
  formatLoanAttendanceQty,
  loanAttendanceShowsPayableShifts,
  type LoanAttendanceSummary,
} from '@/lib/loanAttendanceUi';

export default function LoanAttendanceSummaryTable({
  summary,
}: {
  summary: LoanAttendanceSummary;
}) {
  const showPayable = loanAttendanceShowsPayableShifts(summary);
  const rows = summary.last6Months || [];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-300">
            <th className="px-2 py-2 font-semibold">Month</th>
            <th className="px-2 py-2 font-semibold">Working days</th>
            <th className="px-2 py-2 font-semibold">Present</th>
            {showPayable && <th className="px-2 py-2 font-semibold">Payable shifts</th>}
            <th className="px-2 py-2 font-semibold">Leave</th>
            <th className="px-2 py-2 font-semibold">LOP</th>
            <th className="px-2 py-2 font-semibold">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.month || row.monthName}
              className="border-b border-slate-100 dark:border-slate-800"
            >
              <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-100">
                {row.monthName || row.month}
              </td>
              <td className="px-2 py-2">{formatLoanAttendanceQty(row.workingDays)}</td>
              <td className="px-2 py-2">{formatLoanAttendanceQty(row.present)}</td>
              {showPayable && (
                <td className="px-2 py-2 font-medium text-emerald-700 dark:text-emerald-400">
                  {formatLoanAttendanceQty(row.payableShifts)}
                </td>
              )}
              <td className="px-2 py-2">{formatLoanAttendanceQty(row.leave)}</td>
              <td className="px-2 py-2">{formatLoanAttendanceQty(row.lop)}</td>
              <td className="px-2 py-2">
                {row.attendancePercent != null ? `${row.attendancePercent}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
