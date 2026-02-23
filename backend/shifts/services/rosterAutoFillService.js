/**
 * Roster Auto-Fill Service
 * Fills the next pay cycle roster from the previous cycle by weekday; respects holidays in target period.
 */

const PreScheduledShift = require('../model/PreScheduledShift');
const Employee = require('../../employees/model/Employee');
const Holiday = require('../../holidays/model/Holiday');
const HolidayGroup = require('../../holidays/model/HolidayGroup');
const { getPayrollDateRange, getAllDatesInRange } = require('../../shared/utils/dateUtils');

function getWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0 = Sun, 1 = Mon, ...
}

/**
 * Get payroll cycle range for a given month (YYYY-MM). Month is the calendar month containing the cycle end.
 * @param {string} monthStr - YYYY-MM
 * @returns {Promise<{ startDate: string, endDate: string }>}
 */
async function getCycleRangeForMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const range = await getPayrollDateRange(year, month);
  return { startDate: range.startDate, endDate: range.endDate };
}

/**
 * Build map (employeeNumber, weekday) -> { shiftId, status } from roster in [startDate, endDate].
 * Uses first occurrence per weekday per employee.
 */
async function getRosterByWeekday(startDate, endDate, filters = {}) {
  const query = { date: { $gte: startDate, $lte: endDate } };
  if (filters.departmentId || filters.divisionId) {
    const empFilter = {};
    if (filters.departmentId) empFilter.department_id = filters.departmentId;
    if (filters.divisionId) empFilter.division_id = filters.divisionId;
    const emps = await Employee.find(empFilter).select('emp_no').lean();
    query.employeeNumber = { $in: emps.map((e) => String(e.emp_no || '').toUpperCase()) };
  }

  const rows = await PreScheduledShift.find(query)
    .select('employeeNumber date shiftId status')
    .lean();

  const map = new Map(); // key: `${empNo}|${weekday}` -> { shiftId, status }
  for (const r of rows) {
    const empNo = String(r.employeeNumber || '').toUpperCase();
    const weekday = getWeekday(r.date);
    const key = `${empNo}|${weekday}`;
    if (!map.has(key)) {
      map.set(key, {
        shiftId: r.shiftId || null,
        status: r.status || null,
      });
    }
  }
  return map;
}

/**
 * Get holiday dates per employee for date range. Returns Map<empNo, Set<dateStr>>.
 * Reuses same logic as syncHolidayToRoster (division_id, department_id).
 */
async function getHolidayDatesForEmployees(empNos, startDate, endDate) {
  const result = new Map();
  empNos.forEach((emp) => result.set(emp, new Set()));

  const start = new Date(startDate);
  const end = new Date(endDate);

  const holidays = await Holiday.find({
    date: { $lte: endDate },
    $or: [
      { endDate: { $gte: startDate } },
      { endDate: null, date: { $gte: startDate } },
    ],
  })
    .populate('groupId')
    .populate('targetGroupIds')
    .lean();

  const employees = await Employee.find({ emp_no: { $in: empNos } })
    .select('emp_no division_id department_id')
    .lean();
  const empMap = new Map(employees.map((e) => [String(e.emp_no || '').toUpperCase(), e]));

  for (const h of holidays) {
    let targetEmpNos = [];
    if (h.scope === 'GLOBAL') {
      if (h.applicableTo === 'ALL') {
        targetEmpNos = [...empNos];
      } else if (h.applicableTo === 'SPECIFIC_GROUPS' && h.targetGroupIds && h.targetGroupIds.length > 0) {
        const groups = await HolidayGroup.find({ _id: { $in: h.targetGroupIds.map((g) => (g && g._id) || g) } }).lean();
        const allMappings = [];
        for (const g of groups) {
          (g.divisionMapping || []).forEach((m) => {
            allMappings.push({
              division_id: m.division,
              ...(m.departments && m.departments.length > 0 ? { department_id: { $in: m.departments } } : {}),
            });
          });
        }
        if (allMappings.length > 0) {
          const empsInScope = await Employee.find({ emp_no: { $in: empNos }, $or: allMappings }).select('emp_no').lean();
          targetEmpNos = empsInScope.map((e) => String(e.emp_no || '').toUpperCase());
        }
      }
    } else if (h.scope === 'GROUP' && h.groupId) {
      const group = await HolidayGroup.findById(h.groupId).lean();
      if (group && group.divisionMapping && group.divisionMapping.length > 0) {
        const mappingConditions = group.divisionMapping.map((m) => ({
          division_id: m.division,
          ...(m.departments && m.departments.length > 0 ? { department_id: { $in: m.departments } } : {}),
        }));
        const empsInScope = await Employee.find({ emp_no: { $in: empNos }, $or: mappingConditions }).select('emp_no').lean();
        targetEmpNos = empsInScope.map((e) => String(e.emp_no || '').toUpperCase());
      }
    }

    const dateStrs = [];
    let current = new Date(h.date);
    const stop = h.endDate ? new Date(h.endDate) : new Date(h.date);
    while (current <= stop) {
      const d = current.toISOString().split('T')[0];
      if (d >= startDate && d <= endDate) dateStrs.push(d);
      current.setDate(current.getDate() + 1);
    }
    targetEmpNos.forEach((empNo) => {
      const set = result.get(empNo) || new Set();
      dateStrs.forEach((d) => set.add(d));
      result.set(empNo, set);
    });
  }
  return result;
}

/**
 * Auto-fill next pay cycle roster from previous cycle by weekday; holidays in target period are set to HOL.
 * @param {Object} options
 * @param {string} [options.targetMonth] - YYYY-MM; month containing the end of the cycle to fill (e.g. 2026-03 for Feb26-Mar25). Default: next month from today.
 * @param {string} [options.departmentId]
 * @param {string} [options.divisionId]
 * @param {ObjectId} options.scheduledBy
 * @returns {Promise<{ filled: number, holidaysRespected: number, previousRange: {}, nextRange: {}, message: string }>}
 */
async function autoFillNextCycleFromPrevious(options = {}) {
  const { targetMonth: targetMonthParam, departmentId, divisionId, scheduledBy } = options;
  if (!scheduledBy) {
    throw new Error('scheduledBy is required');
  }

  let targetMonth = targetMonthParam;
  if (!targetMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    targetMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }

  const [targetYear, targetMonthNum] = targetMonth.split('-').map(Number);
  const prevMonth = targetMonthNum === 1 ? 12 : targetMonthNum - 1;
  const prevYear = targetMonthNum === 1 ? targetYear - 1 : targetYear;
  const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  const nextRange = await getCycleRangeForMonth(targetMonth);
  const previousRange = await getCycleRangeForMonth(prevMonthStr);

  const filters = {};
  if (departmentId) filters.departmentId = departmentId;
  if (divisionId) filters.divisionId = divisionId;

  const rosterByWeekday = await getRosterByWeekday(previousRange.startDate, previousRange.endDate, filters);

  const empFilter = { is_active: true, leftDate: null };
  if (departmentId) empFilter.department_id = departmentId;
  if (divisionId) empFilter.division_id = divisionId;
  const employees = await Employee.find(empFilter).select('emp_no').lean();
  const empNos = employees.map((e) => String(e.emp_no || '').toUpperCase()).filter(Boolean);

  if (empNos.length === 0) {
    return {
      filled: 0,
      holidaysRespected: 0,
      previousRange,
      nextRange,
      message: 'No employees in scope.',
    };
  }

  const holidayDatesByEmp = await getHolidayDatesForEmployees(empNos, nextRange.startDate, nextRange.endDate);
  const targetDays = getAllDatesInRange(nextRange.startDate, nextRange.endDate);

  const entries = [];
  let holidaysRespected = 0;

  for (const empNo of empNos) {
    const holSet = holidayDatesByEmp.get(empNo) || new Set();
    for (const dateStr of targetDays) {
      if (holSet.has(dateStr)) {
        entries.push({
          employeeNumber: empNo,
          date: dateStr,
          shiftId: null,
          status: 'HOL',
          notes: 'Holiday',
          scheduledBy,
        });
        holidaysRespected++;
        continue;
      }
      const weekday = getWeekday(dateStr);
      const key = `${empNo}|${weekday}`;
      const cell = rosterByWeekday.get(key);
      if (!cell) continue;
      if (cell.status === 'WO' || cell.status === 'HOL') {
        entries.push({
          employeeNumber: empNo,
          date: dateStr,
          shiftId: null,
          status: cell.status,
          notes: cell.status === 'WO' ? 'Week Off' : 'Holiday',
          scheduledBy,
        });
      } else if (cell.shiftId) {
        entries.push({
          employeeNumber: empNo,
          date: dateStr,
          shiftId: cell.shiftId,
          status: null,
          notes: null,
          scheduledBy,
        });
      }
    }
  }

  if (entries.length === 0) {
    return {
      filled: 0,
      holidaysRespected: 0,
      previousRange,
      nextRange,
      message: 'No previous cycle roster data found for these employees; nothing to fill.',
    };
  }

  await PreScheduledShift.deleteMany({
    employeeNumber: { $in: empNos },
    date: { $gte: nextRange.startDate, $lte: nextRange.endDate },
  });

  const bulk = entries.map((e) => ({
    employeeNumber: e.employeeNumber,
    date: e.date,
    shiftId: e.shiftId,
    status: e.status,
    notes: e.notes,
    scheduledBy: e.scheduledBy,
  }));

  let saved = 0;
  for (const entry of bulk) {
    try {
      await PreScheduledShift.create(entry);
      saved++;
    } catch (err) {
      if (err.code !== 11000) console.warn('[RosterAutoFill] Create error:', err.message);
    }
  }

  return {
    filled: saved,
    holidaysRespected,
    previousRange,
    nextRange,
    message: `Filled ${saved} roster entries (${holidaysRespected} days as holiday).`,
  };
}

module.exports = {
  getWeekday,
  getCycleRangeForMonth,
  getRosterByWeekday,
  getHolidayDatesForEmployees,
  autoFillNextCycleFromPrevious,
};
