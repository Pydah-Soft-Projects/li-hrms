/**
 * Resolves global + department OT configuration and per-employee working hours (x).
 */

const OvertimeSettings = require('../model/OvertimeSettings');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const Settings = require('../../settings/model/Settings');

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Merge OvertimeSettings + DepartmentSettings.ot + legacy Settings keys.
 * @param {string|null} departmentId
 * @param {string|null} divisionId
 */
async function getMergedOtConfig(departmentId, divisionId = null) {
  const global = await OvertimeSettings.getActiveSettings();
  const deptDoc =
    departmentId && mongooseId(departmentId)
      ? await DepartmentSettings.getByDeptAndDiv(departmentId, divisionId)
      : null;
  const d = deptDoc?.ot || {};
  const g = global || {};

  const [legacyPay, legacyMin] = await Promise.all([
    Settings.findOne({ key: 'ot_pay_per_hour', category: 'overtime' }).lean(),
    Settings.findOne({ key: 'ot_min_hours', category: 'overtime' }).lean(),
  ]);

  const pick = (key, def) => {
    if (d[key] !== undefined && d[key] !== null) return d[key];
    if (g[key] !== undefined && g[key] !== null) return g[key];
    return def;
  };

  const minFromDeptOrGlobal =
    d.minOTHours !== undefined && d.minOTHours !== null
      ? d.minOTHours
      : g.minOTHours !== undefined && g.minOTHours !== null
        ? g.minOTHours
        : legacyMin?.value;

  const autoInherited =
    d.autoCreateOtRequest !== undefined && d.autoCreateOtRequest !== null
      ? Boolean(d.autoCreateOtRequest)
      : Boolean(g.autoCreateOtRequest);

  const roundingMinutesMerged =
    d.roundingMinutes !== undefined && d.roundingMinutes !== null
      ? num(d.roundingMinutes, 0)
      : g.roundingMinutes !== undefined && g.roundingMinutes !== null
        ? num(g.roundingMinutes, 0)
        : 15;

  return {
    recognitionMode: pick('recognitionMode', 'none'),
    thresholdHours: pick('thresholdHours', null),
    minOTHours: num(minFromDeptOrGlobal, 0),
    roundingMinutes: roundingMinutesMerged,
    roundUpIfFractionMinutesGte: pick('roundUpIfFractionMinutesGte', null),
    otHourRanges: Array.isArray(d.otHourRanges)
      ? d.otHourRanges
      : Array.isArray(g.otHourRanges)
        ? g.otHourRanges
        : [],
    autoCreateOtRequest: autoInherited,
    defaultWorkingHoursPerDay: num(pick('defaultWorkingHoursPerDay', 8), 8),
    workingHoursPerDay:
      d.workingHoursPerDay !== undefined && d.workingHoursPerDay !== null
        ? num(d.workingHoursPerDay, null)
        : null,
    groupWorkingHours: Array.isArray(d.groupWorkingHours) ? d.groupWorkingHours : [],
    otPayPerHour: num(
      d.otPayPerHour !== undefined && d.otPayPerHour !== null
        ? d.otPayPerHour
        : g.payPerHour !== undefined && g.payPerHour !== null
          ? g.payPerHour
          : legacyPay?.value,
      0
    ),
    multiplier: num(
      d.otMultiplier !== undefined && d.otMultiplier !== null ? d.otMultiplier : g.multiplier,
      1.5
    ),
  };
}

function mongooseId(id) {
  if (!id) return false;
  return String(id).length >= 12;
}

/**
 * Monthly salary (z) for OT formula: basis basic | gross, or second salary cycle.
 */
function resolveMonthlySalaryZ(employee, salaryBasis, useSecondSalary) {
  if (!employee) return 0;
  if (useSecondSalary) {
    return num(employee.second_salary, 0);
  }
  const basis = (salaryBasis || 'gross').toLowerCase();
  if (basis === 'gross') {
    return num(employee.gross_salary, 0);
  }
  // basic: scan salaries / dynamicFields for a "basic" component
  const salaries = employee.salaries && typeof employee.salaries === 'object' ? employee.salaries : {};
  for (const [k, v] of Object.entries(salaries)) {
    if (/basic/i.test(String(k))) {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (v && typeof v === 'object' && typeof v.amount === 'number') return num(v.amount, 0);
    }
  }
  const df = employee.dynamicFields;
  if (df && typeof df === 'object') {
    const sal = df.salaries && typeof df.salaries === 'object' ? df.salaries : df;
    for (const [k, v] of Object.entries(sal)) {
      if (/basic/i.test(String(k))) {
        const n = num(v, NaN);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return num(employee.gross_salary, 0);
}

/**
 * Working hours per day (x): group override → department default → global default.
 */
function resolveWorkingHoursPerDay(merged, employee) {
  const fallback = num(merged.defaultWorkingHoursPerDay, 8) || 8;
  const gid =
    employee?.employee_group_id?._id?.toString?.() ||
    employee?.employee_group_id?.toString?.() ||
    null;
  if (gid && merged.groupWorkingHours?.length) {
    const row = merged.groupWorkingHours.find(
      (r) => String(r.employeeGroupId) === String(gid)
    );
    if (row && num(row.hoursPerDay, 0) > 0) {
      return num(row.hoursPerDay, fallback);
    }
  }
  if (merged.workingHoursPerDay != null && num(merged.workingHoursPerDay, 0) > 0) {
    return num(merged.workingHoursPerDay, fallback);
  }
  return fallback;
}

module.exports = {
  getMergedOtConfig,
  resolveMonthlySalaryZ,
  resolveWorkingHoursPerDay,
  num,
};
