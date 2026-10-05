/**
 * Resolves global + department OT configuration and per-employee working hours (x).
 */

const OvertimeSettings = require('../model/OvertimeSettings');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const DivisionWorkflowSettings = require('../../departments/model/DivisionWorkflowSettings');
const { mergeWorkflowObjects } = require('../../departments/services/divisionWorkflowResolver');
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
  const hasDept = departmentId && mongooseId(departmentId);
  const hasDiv = divisionId && mongooseId(divisionId);
  const deptDoc =
    hasDept || hasDiv
      ? await DepartmentSettings.getByDeptAndDiv(hasDept ? departmentId : null, hasDiv ? divisionId : null)
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

  const boolPick = (key, fallback) => {
    if (d[key] !== undefined && d[key] !== null) return Boolean(d[key]);
    if (g[key] !== undefined && g[key] !== null) return Boolean(g[key]);
    return Boolean(fallback);
  };

  const intPick = (key, fallback) => {
    if (d[key] !== undefined && d[key] !== null) return num(d[key], fallback);
    if (g[key] !== undefined && g[key] !== null) return num(g[key], fallback);
    return num(fallback, 0);
  };

  // OT workflow: global OvertimeSettings, then optional division override (department `ot.workflow` is not used for approvals).
  let workflowMerged =
    g.workflow && typeof g.workflow === 'object'
      ? g.workflow
      : { isEnabled: false, steps: [], finalAuthority: { role: 'hr', anyHRCanApprove: false } };

  if (divisionId && mongooseId(divisionId)) {
    const divDoc = await DivisionWorkflowSettings.findOne({ division: divisionId }).lean();
    const divOt = divDoc?.workflows?.ot;
    workflowMerged = mergeWorkflowObjects(workflowMerged, divOt);
  }

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
    // Only treat department slabs as an override when at least one range is defined;
    // an empty array would otherwise wipe global slabs after save.
    otHourRanges:
      Array.isArray(d.otHourRanges) && d.otHourRanges.length > 0
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
    allowBackdated: boolPick('allowBackdated', false),
    maxBackdatedDays: intPick('maxBackdatedDays', 0),
    allowFutureDated: boolPick('allowFutureDated', true),
    maxAdvanceDays: intPick('maxAdvanceDays', 365),
    workflow: workflowMerged,
  };
}

function mongooseId(id) {
  if (!id) return false;
  return String(id).length >= 12;
}

/**
 * Monthly salary (z) for OT formula: use gross salary for regular OT,
 * or employee.second_salary when the second-salary flow is enabled.
 */
function resolveMonthlySalaryZ(employee, salaryBasis, useSecondSalary) {
  if (!employee) return 0;
  if (useSecondSalary) {
    return num(employee.second_salary, 0);
  }

  // Regular OT uses the employee's gross salary as the monthly basis Z.
  // The salary components object should not override this for OT pay.
  return num(employee.gross_salary, 0);
}

function parseHoursFromGroupName(nameOrCode) {
  if (!nameOrCode) return null;
  const str = String(nameOrCode).trim();
  const match = str.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)/i) || str.match(/^(\d+(?:\.\d+)?)/);
  if (match) {
    const val = parseFloat(match[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return null;
}

let groupHoursCacheMap = null;
let groupHoursCacheTime = 0;

function getCachedGroupHours(gid) {
  if (!gid) return null;
  if (!groupHoursCacheMap || Date.now() - groupHoursCacheTime > 60000) {
    try {
      const EmployeeGroup = require('../../employees/model/EmployeeGroup');
      EmployeeGroup.find({}).select('_id name code').lean().then((groups) => {
        const map = new Map();
        for (const g of groups) {
          const parsed = parseHoursFromGroupName(g.name) || parseHoursFromGroupName(g.code);
          if (parsed) map.set(g._id.toString(), parsed);
        }
        groupHoursCacheMap = map;
        groupHoursCacheTime = Date.now();
      }).catch(() => {});
    } catch (e) {}
  }
  return groupHoursCacheMap?.get(String(gid)) || null;
}

/**
 * Working hours per day (x): group override → employee group name/code → department default → global default.
 */
function resolveWorkingHoursPerDay(merged, employee) {
  const fallback = num(merged.defaultWorkingHoursPerDay, 8) || 8;
  const gid =
    employee?.employee_group_id?._id?.toString?.() ||
    (typeof employee?.employee_group_id === 'string' ? employee.employee_group_id : null) ||
    null;

  // 1. Explicit Department OT Settings Group Matrix Override
  if (gid && merged.groupWorkingHours?.length) {
    const row = merged.groupWorkingHours.find(
      (r) => String(r.employeeGroupId) === String(gid)
    );
    if (row && num(row.hoursPerDay, 0) > 0) {
      return num(row.hoursPerDay, fallback);
    }
  }

  // 2. Direct Employee Group Name/Code/Doc parsing
  const groupObj = typeof employee?.employee_group_id === 'object' ? employee.employee_group_id : null;
  const groupName = groupObj?.name || groupObj?.code || employee?.employeeGroup || employee?.groupName || null;
  if (groupName) {
    const parsed = parseHoursFromGroupName(groupName);
    if (parsed) return parsed;
  }

  // 3. Employee Group ID cached lookup
  if (gid) {
    const cachedHours = getCachedGroupHours(gid);
    if (cachedHours) return cachedHours;
  }

  // 4. Department Working Hours
  if (merged.workingHoursPerDay != null && num(merged.workingHoursPerDay, 0) > 0) {
    return num(merged.workingHoursPerDay, fallback);
  }

  return fallback;
}

module.exports = {
  getMergedOtConfig,
  resolveMonthlySalaryZ,
  resolveWorkingHoursPerDay,
  parseHoursFromGroupName,
  num,
};
