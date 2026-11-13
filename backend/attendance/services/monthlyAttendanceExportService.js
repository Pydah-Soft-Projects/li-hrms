const XLSX = require('xlsx');
const { getAllDatesInRange } = require('../../shared/utils/dateUtils');
const { getMonthlyTableViewData } = require('./attendanceViewService');

function isNightShift(cell) {
  if (!cell) return false;
  const s0 = Array.isArray(cell.shifts) && cell.shifts.length > 0 ? cell.shifts[0] : null;
  const shiftName = String(s0?.shiftName || cell.shiftId?.name || cell.shiftName || '').trim();
  if (/night/i.test(shiftName) || /^c([-_ ]|$)/i.test(shiftName)) {
    return true;
  }
  const startTime = String(s0?.shiftStartTime || cell.shiftId?.startTime || cell.shiftStartTime || '').trim();
  const endTime = String(s0?.shiftEndTime || cell.shiftId?.endTime || cell.shiftEndTime || '').trim();
  if (startTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    if (!isNaN(sh)) {
      if (sh >= 18 || sh < 4) return true;
      if (endTime) {
        const [eh, em] = endTime.split(':').map(Number);
        if (!isNaN(eh) && (sh * 60 + (sm || 0)) > (eh * 60 + (em || 0))) {
          return true; // Crosses midnight
        }
      }
    }
  }
  const punchTime = s0?.inTime || cell.inTime;
  if (punchTime) {
    const d = new Date(punchTime);
    const istMins = d.getUTCHours() * 60 + d.getUTCMinutes() + 330;
    const istHour = Math.floor(istMins / 60) % 24;
    if (istHour >= 18 || istHour < 4) return true;
  }
  return false;
}

function statusAbbrev(cell) {
  if (!cell) return '-';
  const status = typeof cell === 'string' ? cell : cell.status;
  const st = String(status || '').toUpperCase();

  if (st === 'PRESENT' || st === 'P') {
    const pay = typeof cell === 'object' && cell !== null
      ? Number(cell.payableShifts ?? cell.payableShift ?? 1)
      : 1;
    if (pay >= 1.75) {
      return 'PP'; // Double Duty
    }
    if (pay >= 1.25 && pay < 1.75) {
      return 'PH'; // 1.5 Duty
    }
    if (typeof cell === 'object' && cell !== null && isNightShift(cell)) {
      return 'PN'; // Present Night
    }
    return 'PD'; // Present Day
  }

  const map = {
    ABSENT: 'A',
    PARTIAL: 'PT',
    LEAVE: 'L',
    OD: 'OD',
    HOLIDAY: 'H',
    WEEK_OFF: 'WO',
    HALF_DAY: 'HD',
    '-': '-',
  };
  return map[st] || st;
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
    const dayCells = dayColumns.map((d) => statusAbbrev(daily[d]));
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
