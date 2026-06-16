const XLSX = require('xlsx');
const { getAllDatesInRange } = require('../../shared/utils/dateUtils');
const { getMonthlyTableViewData } = require('./attendanceViewService');

function statusAbbrev(status) {
  const map = {
    PRESENT: 'P',
    ABSENT: 'A',
    PARTIAL: 'PT',
    LEAVE: 'L',
    OD: 'OD',
    HOLIDAY: 'H',
    WEEK_OFF: 'WO',
    HALF_DAY: 'HD',
    '-': '-',
  };
  return map[String(status || '').toUpperCase()] || String(status || '');
}

function refName(ref) {
  if (!ref) return '';
  if (typeof ref === 'object') return ref.name || ref.title || ref.code || '';
  return '';
}

/**
 * Build XLSX buffer for monthly attendance export (server-side; no giant JSON to browser).
 */
async function buildMonthlyAttendanceExportBuffer(employees, year, month, periodStartStr, periodEndStr) {
  const rows = await getMonthlyTableViewData(employees, year, month, periodStartStr, periodEndStr, {
    mode: 'export',
    includeContributingDates: true,
  });

  const dayColumns = getAllDatesInRange(periodStartStr, periodEndStr);
  const header = [
    'Emp No',
    'Name',
    'Department',
    'Designation',
    ...dayColumns,
    'Present',
    'Absent',
    'Leaves',
    'OD',
    'Payable Shifts',
    'OT Hours',
    'Extra Hours',
  ];

  const aoa = [header];
  for (const item of rows) {
    const emp = item.employee || {};
    const s = item.summary || {};
    const daily = item.dailyAttendance || {};
    const dayCells = dayColumns.map((d) => statusAbbrev(daily[d]?.status));
    const absentCount =
      s.totalAbsentDays != null
        ? Number(s.totalAbsentDays)
        : dayCells.filter((c) => c === 'A').length;

    aoa.push([
      emp.emp_no || '',
      emp.employee_name || '',
      refName(emp.department_id),
      refName(emp.designation_id),
      ...dayCells,
      s.totalPresentDays ?? item.presentDays ?? 0,
      absentCount,
      s.totalLeaves ?? 0,
      s.totalODs ?? 0,
      s.totalPayableShifts ?? item.payableShifts ?? 0,
      s.totalOTHours ?? 0,
      s.totalExtraHours ?? 0,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildMonthlyAttendanceExportBuffer };
