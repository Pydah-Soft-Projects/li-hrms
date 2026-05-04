/* eslint-disable @typescript-eslint/no-explicit-any -- monthly API rows and XLSX cell shapes are intentionally loose */
/**
 * Monthly attendance Excel export (multi-sheet, styled).
 * Shared by superadmin and workspace attendance pages so output stays identical.
 */
import { format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx-js-style';
import { formatCompleteDayCellForExcel } from '@/lib/attendanceCompleteDayCellText';
import { getPartialColumnTotal } from '@/lib/attendancePartialContribution';
import {
  computePayRegisterAllRowFromMonthlySummary,
  formatPolicyAttendanceDeductionDisplay,
  paidLopSublabel,
} from '@/lib/payRegisterAllSummaryRow';

/** Absent total from summary (fractional half-days); else totalAbsentDays; else ABSENT-only daily count. */
export function getAbsentCountForRow(item: { summary?: any }, dailyValues: any[]): number {
  const absentList = item.summary?.contributingDates?.absent;
  if (Array.isArray(absentList)) {
    return absentList.reduce((s: number, x: any) => {
      if (typeof x === 'string') return s + 1;
      return s + (Number(x?.value) || 1);
    }, 0);
  }
  if (item.summary?.totalAbsentDays != null && typeof item.summary.totalAbsentDays === 'number') {
    return item.summary.totalAbsentDays;
  }
  return dailyValues.filter((r: any) => r?.status === 'ABSENT').length;
}

/** Same shape normalization as attendance pages (flat vs nested API rows). */
export function normalizeMonthlyAttendanceRows(data: unknown[]): any[] {
  return (data || []).map((item: unknown) => {
    const row = item as Record<string, any>;
    if (row.employee && typeof row.employee === 'object') {
      return {
        ...row,
        dailyAttendance: row.dailyAttendance || row.attendance || {},
      };
    }
    return {
      ...row,
      employee: row.employee || {
        _id: row._id,
        emp_no: row.emp_no,
        employee_name: row.employee_name,
        department: { name: row.department_name },
        designation: { name: row.designation_name },
        division_id: row.division_id,
        leftDate: row.leftDate,
      },
      dailyAttendance: row.dailyAttendance || row.attendance || {},
    };
  });
}

export type AttendanceDayColumnFallback = 'calendar-month' | 'none';

/**
 * Day column keys: pay cycle when set; otherwise `calendar-month` (workspace UI) or `none` (superadmin — use first-row keys in export).
 */
export function getAttendanceExportDayStrings(
  cycleDates: { startDate?: string; endDate?: string },
  year: number,
  month: number,
  whenNoCycle: AttendanceDayColumnFallback = 'calendar-month'
): string[] {
  if (cycleDates.startDate && cycleDates.endDate) {
    const dates: string[] = [];
    const current = new Date(cycleDates.startDate);
    const end = new Date(cycleDates.endDate);
    let count = 0;
    while (current <= end && count <= 35) {
      dates.push(
        `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
      );
      current.setDate(current.getDate() + 1);
      count++;
    }
    return dates;
  }
  if (whenNoCycle === 'none') return [];
  const lastDay = new Date(year, month, 0).getDate();
  return Array.from({ length: lastDay }, (_, i) => {
    const d = i + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  });
}

function getPresentExcludingODForExport(summary: any): number | null {
  if (!summary) return null;
  return Math.max(0, Math.round((Number(summary.totalPresentDays) || 0) * 100) / 100);
}

/** Same inputs as the Complete table row when `usePayRegisterAllComplete` is on. */
function buildPrAllRowForExport(item: any) {
  const dailyAttendance = item.dailyAttendance && typeof item.dailyAttendance === 'object' ? item.dailyAttendance : {};
  const dailyVals = Object.values(dailyAttendance || []);

  const presentFromSummary = getPresentExcludingODForExport(item.summary);
  const daysPresent =
    presentFromSummary != null
      ? presentFromSummary
      : item.presentDays !== undefined
        ? item.presentDays
        : dailyVals.reduce((sum: number, record: any) => {
            if (!record) return sum;
            if (record.status === 'PRESENT') return sum + 1;
            if (record.status === 'HALF_DAY') return sum + 0.5;
            return sum;
          }, 0);

  const monthAbsent = dailyVals.filter((r: any) => r?.status === 'ABSENT').length;
  const leaveRecords = dailyVals.filter((r: any) => r?.status === 'LEAVE' || r?.hasLeave);
  const totalLeaves = item.summary?.totalLeaves ?? leaveRecords.length;
  const weekOffsCount = item.summary?.totalWeeklyOffs ?? dailyVals.filter((r: any) => r?.status === 'WEEK_OFF').length;
  const holidaysCount = item.summary?.totalHolidays ?? dailyVals.filter((r: any) => r?.status === 'HOLIDAY').length;
  const lopCount = leaveRecords.filter((r: any) => {
    const anyR = r as any;
    return (
      anyR?.leaveNature === 'lop' ||
      anyR?.leaveInfo?.leaveType?.toLowerCase().includes('lop') ||
      anyR?.leaveInfo?.leaveType?.toLowerCase().includes('loss of pay')
    );
  }).length;
  const summaryPaidLeaves = Number(item.summary?.totalPaidLeaves);
  const summaryLopLeaves = Number(item.summary?.totalLopLeaves);
  const paidLeaveCol = Number.isFinite(summaryPaidLeaves) ? summaryPaidLeaves : Math.max(0, totalLeaves - lopCount);
  const lopLeaveCol = Number.isFinite(summaryLopLeaves) ? summaryLopLeaves : lopCount;

  const totalODs = item.summary?.totalODs ?? dailyVals.filter((r: any) => r?.status === 'OD' || r?.hasOD).length;

  const monthAbsentUnits =
    item.summary != null && item.summary.totalAbsentDays != null ? Number(item.summary.totalAbsentDays) : monthAbsent;

  return computePayRegisterAllRowFromMonthlySummary(
    item.summary ??
      ({
        totalPresentDays: daysPresent,
        totalWeeklyOffs: weekOffsCount,
        totalHolidays: holidaysCount,
        totalLeaves,
        totalPaidLeaves: paidLeaveCol,
        totalLopLeaves: lopLeaveCol,
        totalODs,
        totalAbsentDays: monthAbsentUnits,
      } as any),
    { processingMode: 'single_shift' }
  );
}

export function writeMonthlyAttendanceExcelFile(
  data: any[],
  opts: {
    cycleDates: { startDate?: string; endDate?: string };
    year: number;
    month: number;
    monthLabel: string;
    /** When pay cycle is not set: workspace uses calendar month; superadmin uses first employee's day keys only. */
    whenNoCycle?: AttendanceDayColumnFallback;
    /** When `single_shift`, the Complete sheet matches the pay-register Complete table (columns + day cells). */
    processingMode?: 'single_shift' | 'multi_shift' | null;
  }
): void {
  const { cycleDates, year, month, monthLabel, whenNoCycle = 'calendar-month', processingMode = null } = opts;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const getDeptName = (emp: any) => {
    if (emp?.department && typeof emp.department === 'object') return emp.department.name;
    if (emp?.department_id && typeof emp.department_id === 'object') return emp.department_id.name;
    return '';
  };
  const getDivisionName = (emp: any) => {
    if (emp?.division && typeof emp.division === 'object') return emp.division.name;
    if (emp?.division_id && typeof emp.division_id === 'object') return emp.division_id.name;
    return '';
  };
  const getDesignationName = (emp: any) => {
    if (emp?.designation && typeof emp.designation === 'object') return emp.designation.name;
    if (emp?.designation_id && typeof emp.designation_id === 'object') return emp.designation_id.name;
    return 'Staff';
  };

  const wb = XLSX.utils.book_new();

  let totalPartials = 0;
  const summaryRows: Record<string, unknown>[] = data.map((item) => {
    const dailyAttendance = item.dailyAttendance && typeof item.dailyAttendance === 'object' ? item.dailyAttendance : {};
    const dailyValues = Object.values(dailyAttendance || {});
    const partialsCount = getPartialColumnTotal(item.summary, dailyAttendance as Record<string, any>);
    totalPartials += partialsCount;
    const leaveRecords = dailyValues.filter((r: any) => r?.status === 'LEAVE' || r?.hasLeave);
    const totalLeaves = item.summary?.totalLeaves ?? leaveRecords.length;
    const lopCount = leaveRecords.filter((r: any) => {
      const anyR = r as any;
      return (
        anyR?.leaveNature === 'lop' ||
        anyR?.leaveInfo?.leaveType?.toLowerCase().includes('lop') ||
        anyR?.leaveInfo?.leaveType?.toLowerCase().includes('loss of pay')
      );
    }).length;
    const paidLeaves = totalLeaves - lopCount;
    const totalODs = item.summary?.totalODs ?? dailyValues.filter((r: any) => r?.status === 'OD' || r?.hasOD).length;
    const weekOffs = item.summary?.totalWeeklyOffs ?? dailyValues.filter((r: any) => r?.status === 'WEEK_OFF').length;
    const holidays = item.summary?.totalHolidays ?? dailyValues.filter((r: any) => r?.status === 'HOLIDAY').length;
    const monthPresent = dailyValues.reduce((sum: number, r: any) => {
      if (r?.status === 'PRESENT' || r?.status === 'PARTIAL') return sum + 1;
      if (r?.status === 'HALF_DAY') return sum + 0.5;
      return sum;
    }, 0);
    const monthAbsent = getAbsentCountForRow(item, dailyValues);
    const otHours = dailyValues.reduce((sum: number, r: any) => sum + (r?.otHours || 0), 0);
    const payableShifts = item.payableShifts ?? item.summary?.totalPayableShifts ?? 0;
    return {
      'Emp No': item.employee?.emp_no || '',
      'Employee Name': item.employee?.employee_name || '',
      Designation: item.employee ? getDesignationName(item.employee) : '',
      Department: item.employee ? getDeptName(item.employee) : '',
      Division: item.employee ? getDivisionName(item.employee) : '',
      Present: monthPresent,
      Absent: monthAbsent,
      Partials: partialsCount,
      Leaves: totalLeaves,
      'Paid Leaves': paidLeaves,
      LOP: lopCount,
      'Week Offs': weekOffs,
      Holidays: holidays,
      OD: totalODs,
      'OT Hours': otHours.toFixed(1),
      'Payable Shifts': payableShifts,
      'Late/Early Count': item.summary?.lateOrEarlyCount ?? 0,
      'Attendance Deduction Days': item.summary?.totalAttendanceDeductionDays ?? 0,
    };
  });
  const summaryHeaders = Object.keys(summaryRows[0] || {});
  const summaryAoa = [
    ['Attendance Summary', monthLabel, '', '', '', '', '', '', '', '', '', '', '', '', `Total Partials: ${totalPartials}`],
    ['● = Late In', '◆ = Early Out', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    summaryHeaders,
    ...summaryRows.map((r) => Object.values(r)),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  if (wsSummary['A2']) {
    wsSummary['A2'].s = wsSummary['A2'].s || {};
    wsSummary['A2'].s.fill = { fgColor: { rgb: 'FEF3C7' }, patternType: 'solid' as const };
  }
  if (wsSummary['B2']) {
    wsSummary['B2'].s = wsSummary['B2'].s || {};
    wsSummary['B2'].s.fill = { fgColor: { rgb: 'DBEAFE' }, patternType: 'solid' as const };
  }
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summaries');

  let daysArrayExport = getAttendanceExportDayStrings(cycleDates, year, month, whenNoCycle);
  if (daysArrayExport.length === 0) {
    const firstKeys = Object.keys((data[0]?.dailyAttendance as Record<string, unknown>) || {});
    daysArrayExport = [...firstKeys].sort();
  }

  const getStatusWithLateEarly = (r: any, showShifts = false): { text: string; isLate: boolean; isEarly: boolean } => {
    if (!r) return { text: 'A', isLate: false, isEarly: false };
    const isLate =
      (r.lateInMinutes != null && r.lateInMinutes > 0) ||
      (r.isLateIn && (r.lateInMinutes ?? 0) > 0) ||
      (r.shifts && r.shifts.some((s: any) => s.lateInMinutes != null && s.lateInMinutes > 0));
    const isEarly =
      (r.earlyOutMinutes != null && r.earlyOutMinutes > 0) ||
      (r.isEarlyOut && (r.earlyOutMinutes ?? 0) > 0) ||
      (r.shifts && r.shifts.some((s: any) => s.earlyOutMinutes != null && s.earlyOutMinutes > 0));
    const suffix = (isLate ? '●' : '') + (isEarly ? '◆' : '');
    
    let text = '-';
    if (showShifts && r.shifts && r.shifts.length > 1) {
      const shiftLines = r.shifts.map((s: any, idx: number) => {
        const sLate = (s.lateInMinutes != null && s.lateInMinutes > 0);
        const sEarly = (s.earlyOutMinutes != null && s.earlyOutMinutes > 0);
        const sSuffix = (sLate ? '●' : '') + (sEarly ? '◆' : '');
        let sText = '-';
        if (s.status === 'PRESENT') sText = 'P';
        else if (s.status === 'HALF_DAY') sText = 'HD';
        else if (s.status === 'PARTIAL') sText = 'PT';
        else if (s.status === 'LEAVE' || s.hasLeave) sText = 'L';
        else if (s.status === 'OD' || s.hasOD) sText = 'OD';
        else if (s.status === 'HOLIDAY') sText = 'H';
        else if (s.status === 'WEEK_OFF') sText = 'WO';
        else if (s.status === 'ABSENT') sText = 'A';
        const shiftName = typeof s.shiftId === 'object' && s.shiftId?.name ? s.shiftId.name.substring(0, 3) : `S${idx + 1}`;
        const pay = s.payableShift != null ? s.payableShift : (s.basePayable ?? 0);
        return `${shiftName}: ${sText}${sSuffix} (${pay})`;
      });
      text = shiftLines.join('\n');
    } else {
      if (r.status === 'PRESENT') text = 'P' + suffix;
      else if (r.status === 'HALF_DAY') text = 'HD' + suffix;
      else if (r.status === 'PARTIAL') text = 'PT' + suffix;
      else if (r.status === 'LEAVE' || r.hasLeave) text = 'L';
      else if (r.status === 'OD' || r.hasOD) text = 'OD';
      else if (r.status === 'HOLIDAY') text = 'H';
      else if (r.status === 'WEEK_OFF') text = 'WO';
      else if (r.status === 'ABSENT') text = 'A';
      
      if (showShifts && r.payableShifts != null) {
        text += ` (${r.payableShifts})`;
      }
    }
    
    return { text, isLate, isEarly };
  };

  const applyCellFill = (ws: any, row: number, col: number, color: string) => {
    const ref = XLSX.utils.encode_cell({ r: row, c: col });
    if (!ws[ref]) return;
    ws[ref].s = ws[ref].s || {};
    ws[ref].s.fill = { fgColor: { rgb: color }, patternType: 'solid' as const };
  };

  const dayHeadersWithWeekday = daysArrayExport.map((d) => {
    const dt = new Date(`${d}T12:00:00`);
    return `${dt.getDate()}\n${dt.toLocaleDateString('en-IN', { weekday: 'short' })}`;
  });

  if (processingMode === 'single_shift') {
    const completeHeadersPr = [
      'Emp No',
      'Employee Name',
      'Designation',
      'Department',
      'Division',
      ...dayHeadersWithWeekday,
      'Present',
      'W.off',
      'Hol',
      'T.leave',
      'OD',
      'Abs',
      'Tot',
      'L/E',
      'Ded Absents',
      'Ded LOP',
      'Att ded',
      'Paid',
    ];
    const completeRowsPr: (string | number)[][] = data.map((item) => {
      const dailyAttendance = item.dailyAttendance && typeof item.dailyAttendance === 'object' ? item.dailyAttendance : {};
      const pr = buildPrAllRowForExport(item);
      const dayCells = daysArrayExport.map((d) =>
        formatCompleteDayCellForExcel((dailyAttendance as Record<string, any>)[d] ?? null)
      );
      const tLeave = `${pr.totalLeaves.toFixed(1)}\n${paidLopSublabel(pr.paidLeaves, pr.dedLop)}`;
      const attDedStr = formatPolicyAttendanceDeductionDisplay(pr.attDed, item.summary?.attendanceDeductionBreakdown);
      return [
        item.employee?.emp_no || '',
        item.employee?.employee_name || '',
        item.employee ? getDesignationName(item.employee) : '',
        item.employee ? getDeptName(item.employee) : '',
        item.employee ? getDivisionName(item.employee) : '',
        ...dayCells,
        pr.present.toFixed(1),
        pr.weekOffs.toFixed(1),
        pr.holidays.toFixed(1),
        tLeave,
        pr.od.toFixed(1),
        pr.absent.toFixed(1),
        pr.totalDaysSummed.toFixed(1),
        pr.lates,
        pr.dedAbsent.toFixed(1),
        pr.dedLop.toFixed(1),
        attDedStr,
        pr.paidDays.toFixed(1),
      ];
    });
    const wsCompletePr = XLSX.utils.aoa_to_sheet([completeHeadersPr, ...completeRowsPr]);
    XLSX.utils.book_append_sheet(wb, wsCompletePr, 'Complete');
  } else {
    const completeHeaders = [
      'Emp No',
      'Employee Name',
      'Designation',
      'Department',
      'Division',
      ...daysArrayExport.map((d) => format(parseISO(d), 'dd')),
      'Pres',
      'Leaves',
      'Abs',
      'WO',
      'Hol',
      'Partials',
      'OD',
      'OT',
      'Pay Shifts',
    ];
    const completeLateEarlyFlags: { isLate: boolean; isEarly: boolean }[][] = [];
    const completeRows: (string | number)[][] = data.map((item) => {
      const dailyAttendance = item.dailyAttendance && typeof item.dailyAttendance === 'object' ? item.dailyAttendance : {};
      const dailyValues = Object.values(dailyAttendance || {});
      const dayResults = daysArrayExport.map((d) => getStatusWithLateEarly((dailyAttendance as Record<string, any>)[d], true));
      completeLateEarlyFlags.push(dayResults.map((d) => ({ isLate: d.isLate, isEarly: d.isEarly })));
      const dayCells = dayResults.map((d) => d.text);
      const monthPresent = dailyValues.reduce((sum: number, r: any) => {
        if (r?.status === 'PRESENT' || r?.status === 'PARTIAL') return sum + 1;
        if (r?.status === 'HALF_DAY') return sum + 0.5;
        return sum;
      }, 0);
      const totalLeaves = item.summary?.totalLeaves ?? dailyValues.filter((r: any) => r?.status === 'LEAVE' || r?.hasLeave).length;
      const monthAbsentRow = getAbsentCountForRow(item, dailyValues);
      const wo = item.summary?.totalWeeklyOffs ?? dailyValues.filter((r: any) => r?.status === 'WEEK_OFF').length;
      const hol = item.summary?.totalHolidays ?? dailyValues.filter((r: any) => r?.status === 'HOLIDAY').length;
      const partials = getPartialColumnTotal(item.summary, dailyAttendance as Record<string, any>);
      const ods = item.summary?.totalODs ?? dailyValues.filter((r: any) => r?.status === 'OD' || r?.hasOD).length;
      const ot = dailyValues.reduce((sum: number, r: any) => sum + (r?.otHours || 0), 0);
      const ps = item.payableShifts ?? item.summary?.totalPayableShifts ?? 0;
      return [
        item.employee?.emp_no || '',
        item.employee?.employee_name || '',
        item.employee ? getDesignationName(item.employee) : '',
        item.employee ? getDeptName(item.employee) : '',
        item.employee ? getDivisionName(item.employee) : '',
        ...dayCells,
        monthPresent,
        totalLeaves,
        monthAbsentRow,
        wo,
        hol,
        partials,
        ods,
        ot.toFixed(1),
        ps,
      ];
    });
    const wsComplete = XLSX.utils.aoa_to_sheet([completeHeaders, ...completeRows]);
    completeLateEarlyFlags.forEach((rowFlags, rowIdx) => {
      rowFlags.forEach((flags, colIdx) => {
        const ref = XLSX.utils.encode_cell({ r: rowIdx + 1, c: 5 + colIdx });
        if (wsComplete[ref]) {
          wsComplete[ref].s = wsComplete[ref].s || {};
          wsComplete[ref].s.alignment = { wrapText: true };
        }
        if (flags.isLate && flags.isEarly) applyCellFill(wsComplete, rowIdx + 1, 5 + colIdx, 'EDE9FE');
        else if (flags.isLate) applyCellFill(wsComplete, rowIdx + 1, 5 + colIdx, 'FEF3C7');
        else if (flags.isEarly) applyCellFill(wsComplete, rowIdx + 1, 5 + colIdx, 'DBEAFE');
      });
    });
    XLSX.utils.book_append_sheet(wb, wsComplete, 'Complete');
  }

  const paHeaders = [
    'Emp No',
    'Employee Name',
    'Designation',
    'Department',
    'Division',
    ...daysArrayExport.map((d) => format(parseISO(d), 'dd')),
    'Present',
    'Absent',
  ];
  const paLateEarlyFlags: { isLate: boolean; isEarly: boolean }[][] = [];
  const paRows: (string | number)[][] = data.map((item) => {
    const dailyAttendance = item.dailyAttendance && typeof item.dailyAttendance === 'object' ? item.dailyAttendance : {};
    const dailyValues = Object.values(dailyAttendance || {});
    const dayResults = daysArrayExport.map((d) => getStatusWithLateEarly((dailyAttendance as Record<string, any>)[d]));
    paLateEarlyFlags.push(dayResults.map((d) => ({ isLate: d.isLate, isEarly: d.isEarly })));
    const dayCells = dayResults.map((d) => d.text);
    const monthPresent = dailyValues.reduce((sum: number, r: any) => {
      if (r?.status === 'PRESENT' || r?.status === 'PARTIAL') return sum + 1;
      if (r?.status === 'HALF_DAY') return sum + 0.5;
      return sum;
    }, 0);
    const monthAbsent = getAbsentCountForRow(item, dailyValues);
    return [
      item.employee?.emp_no || '',
      item.employee?.employee_name || '',
      item.employee ? getDesignationName(item.employee) : '',
      item.employee ? getDeptName(item.employee) : '',
      item.employee ? getDivisionName(item.employee) : '',
      ...dayCells,
      monthPresent,
      monthAbsent,
    ];
  });
  const wsPA = XLSX.utils.aoa_to_sheet([paHeaders, ...paRows]);
  paLateEarlyFlags.forEach((rowFlags, rowIdx) => {
    rowFlags.forEach((flags, colIdx) => {
      if (flags.isLate && flags.isEarly) applyCellFill(wsPA, rowIdx + 1, 5 + colIdx, 'EDE9FE');
      else if (flags.isLate) applyCellFill(wsPA, rowIdx + 1, 5 + colIdx, 'FEF3C7');
      else if (flags.isEarly) applyCellFill(wsPA, rowIdx + 1, 5 + colIdx, 'DBEAFE');
    });
  });
  XLSX.utils.book_append_sheet(wb, wsPA, 'Pres-Abs');

  const formatTimeShort = (t: string) => {
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return t.slice(0, 5);
    try {
      const d = new Date(t);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return t;
    }
  };
  const ioHeaders = [
    'Emp No',
    'Employee Name',
    'Designation',
    'Department',
    'Division',
    ...daysArrayExport.map((d) => format(parseISO(d), 'dd')),
    'Days Present',
  ];
  const ioLateEarlyFlags: { isLate: boolean; isEarly: boolean }[][] = [];
  const ioRows: (string | number)[][] = data.map((item) => {
    const dailyAttendance = item.dailyAttendance && typeof item.dailyAttendance === 'object' ? item.dailyAttendance : {};
    const dailyValues = Object.values(dailyAttendance || {});
    const dayCells: string[] = [];
    const rowFlags: { isLate: boolean; isEarly: boolean }[] = [];
    daysArrayExport.forEach((d) => {
      const r = (dailyAttendance as Record<string, any>)[d];
      if (!r) {
        dayCells.push('-');
        rowFlags.push({ isLate: false, isEarly: false });
        return;
      }
      let cellText = '-';
      if (r.shifts && r.shifts.length > 1) {
        const shiftTexts = r.shifts.map((s: any, idx: number) => {
          const sIn = s.inTime ? formatTimeShort(s.inTime) : '-';
          const sOut = s.outTime ? formatTimeShort(s.outTime) : '-';
          const sLate = s.lateInMinutes != null && s.lateInMinutes > 0;
          const sEarly = s.earlyOutMinutes != null && s.earlyOutMinutes > 0;
          const sSuffix = (sLate ? ' ●' : '') + (sEarly ? ' ◆' : '');
          const shiftName = typeof s.shiftId === 'object' && s.shiftId?.name ? s.shiftId.name.substring(0, 3) : `S${idx + 1}`;
          return `${shiftName}: ${sIn}/${sOut}${sSuffix}`;
        });
        cellText = shiftTexts.join('\n');
      } else {
        const singleShift = r.shifts && r.shifts.length === 1 ? r.shifts[0] : r;
        const inT = singleShift.inTime ? formatTimeShort(singleShift.inTime) : '-';
        const outT = singleShift.outTime ? formatTimeShort(singleShift.outTime) : '-';
        const sLate = (singleShift.lateInMinutes != null && singleShift.lateInMinutes > 0) || (r.isLateIn && (r.lateInMinutes ?? 0) > 0);
        const sEarly = (singleShift.earlyOutMinutes != null && singleShift.earlyOutMinutes > 0) || (r.isEarlyOut && (r.earlyOutMinutes ?? 0) > 0);
        const suffix = (sLate ? ' ●' : '') + (sEarly ? ' ◆' : '');
        cellText = `${inT}/${outT}${suffix}`;
      }
      
      const isLate =
        (r.lateInMinutes != null && r.lateInMinutes > 0) ||
        (r.isLateIn && (r.lateInMinutes ?? 0) > 0) ||
        (r.shifts && r.shifts.some((s: any) => s.lateInMinutes != null && s.lateInMinutes > 0));
      const isEarly =
        (r.earlyOutMinutes != null && r.earlyOutMinutes > 0) ||
        (r.isEarlyOut && (r.earlyOutMinutes ?? 0) > 0) ||
        (r.shifts && r.shifts.some((s: any) => s.earlyOutMinutes != null && s.earlyOutMinutes > 0));
      
      rowFlags.push({ isLate, isEarly });
      dayCells.push(cellText);
    });
    ioLateEarlyFlags.push(rowFlags);
    const daysPresent = dailyValues.reduce((sum: number, r: any) => {
      if (r?.status === 'PRESENT' || r?.status === 'PARTIAL') return sum + 1;
      if (r?.status === 'HALF_DAY') return sum + 0.5;
      return sum;
    }, 0);
    return [
      item.employee?.emp_no || '',
      item.employee?.employee_name || '',
      item.employee ? getDesignationName(item.employee) : '',
      item.employee ? getDeptName(item.employee) : '',
      item.employee ? getDivisionName(item.employee) : '',
      ...dayCells,
      daysPresent,
    ];
  });
  const wsIO = XLSX.utils.aoa_to_sheet([ioHeaders, ...ioRows]);
  ioLateEarlyFlags.forEach((rowFlags, rowIdx) => {
    rowFlags.forEach((flags, colIdx) => {
      const ref = XLSX.utils.encode_cell({ r: rowIdx + 1, c: 5 + colIdx });
      if (wsIO[ref]) {
        wsIO[ref].s = wsIO[ref].s || {};
        wsIO[ref].s.alignment = { wrapText: true };
      }
      if (flags.isLate && flags.isEarly) applyCellFill(wsIO, rowIdx + 1, 5 + colIdx, 'EDE9FE');
      else if (flags.isLate) applyCellFill(wsIO, rowIdx + 1, 5 + colIdx, 'FEF3C7');
      else if (flags.isEarly) applyCellFill(wsIO, rowIdx + 1, 5 + colIdx, 'DBEAFE');
    });
  });
  XLSX.utils.book_append_sheet(wb, wsIO, 'In-Out');

  const lvHeaders = [
    'Emp No',
    'Employee Name',
    'Designation',
    'Department',
    'Division',
    ...daysArrayExport.map((d) => format(parseISO(d), 'dd')),
    'Leaves',
    'Paid',
    'LOP',
  ];
  const lvRows: (string | number)[][] = data.map((item) => {
    const dailyAttendance = item.dailyAttendance && typeof item.dailyAttendance === 'object' ? item.dailyAttendance : {};
    const dailyValues = Object.values(dailyAttendance || {});
    const leaveRecords = dailyValues.filter((r: any) => r?.status === 'LEAVE' || r?.hasLeave);
    const totalLeaves = item.summary?.totalLeaves ?? leaveRecords.length;
    const lopCount = leaveRecords.filter((r: any) => {
      const anyR = r as any;
      return anyR?.leaveNature === 'lop' || anyR?.leaveInfo?.leaveType?.toLowerCase().includes('lop');
    }).length;
    const paidLeaves = totalLeaves - lopCount;
    const dayCells = daysArrayExport.map((d) => {
      const r = (dailyAttendance as Record<string, any>)[d];
      if (r?.status === 'LEAVE' || r?.hasLeave) return 'L';
      return '-';
    });
    return [
      item.employee?.emp_no || '',
      item.employee?.employee_name || '',
      item.employee ? getDesignationName(item.employee) : '',
      item.employee ? getDeptName(item.employee) : '',
      item.employee ? getDivisionName(item.employee) : '',
      ...dayCells,
      totalLeaves,
      paidLeaves,
      lopCount,
    ];
  });
  const wsLeaves = XLSX.utils.aoa_to_sheet([lvHeaders, ...lvRows]);
  XLSX.utils.book_append_sheet(wb, wsLeaves, 'Leaves');

  const odHeaders = [
    'Emp No',
    'Employee Name',
    'Designation',
    'Department',
    'Division',
    ...daysArrayExport.map((d) => format(parseISO(d), 'dd')),
    'OD Count',
  ];
  const odRows: (string | number)[][] = data.map((item) => {
    const dailyAttendance = item.dailyAttendance && typeof item.dailyAttendance === 'object' ? item.dailyAttendance : {};
    const dailyValues = Object.values(dailyAttendance || {});
    const totalODs = item.summary?.totalODs ?? dailyValues.filter((r: any) => r?.status === 'OD' || r?.hasOD).length;
    const dayCells = daysArrayExport.map((d) => {
      const r = (dailyAttendance as Record<string, any>)[d];
      if (r?.status === 'OD' || r?.hasOD) return 'OD';
      return '-';
    });
    return [
      item.employee?.emp_no || '',
      item.employee?.employee_name || '',
      item.employee ? getDesignationName(item.employee) : '',
      item.employee ? getDeptName(item.employee) : '',
      item.employee ? getDivisionName(item.employee) : '',
      ...dayCells,
      totalODs,
    ];
  });
  const wsOD = XLSX.utils.aoa_to_sheet([odHeaders, ...odRows]);
  XLSX.utils.book_append_sheet(wb, wsOD, 'OD');

  const otHeaders = [
    'Emp No',
    'Employee Name',
    'Designation',
    'Department',
    'Division',
    ...daysArrayExport.map((d) => format(parseISO(d), 'dd')),
    'OT Hrs',
    'Extra Hrs',
  ];
  const otRows: (string | number)[][] = data.map((item) => {
    const dailyAttendance = item.dailyAttendance && typeof item.dailyAttendance === 'object' ? item.dailyAttendance : {};
    const dailyValues = Object.values(dailyAttendance || {});
    const otHrs = dailyValues.reduce((sum: number, r: any) => sum + (r?.otHours || 0), 0);
    const extraHrs = dailyValues.reduce((sum: number, r: any) => sum + (r?.extraHours || 0), 0);
    const dayCells = daysArrayExport.map((d) => {
      const r = (dailyAttendance as Record<string, any>)[d];
      return r?.otHours ? String(r.otHours) : r?.extraHours ? String(r.extraHours) : '-';
    });
    return [
      item.employee?.emp_no || '',
      item.employee?.employee_name || '',
      item.employee ? getDesignationName(item.employee) : '',
      item.employee ? getDeptName(item.employee) : '',
      item.employee ? getDivisionName(item.employee) : '',
      ...dayCells,
      otHrs.toFixed(1),
      extraHrs.toFixed(1),
    ];
  });
  const wsOT = XLSX.utils.aoa_to_sheet([otHeaders, ...otRows]);
  XLSX.utils.book_append_sheet(wb, wsOT, 'OT');

  XLSX.writeFile(wb, `attendance_${monthStr}.xlsx`);
}
