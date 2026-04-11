const cacheService = require('../../shared/services/cacheService');
const {
  getMergedOtConfig,
  resolveMonthlySalaryZ,
  resolveWorkingHoursPerDay,
  num,
} = require('../../overtime/services/otConfigResolver');

/**
 * OT Pay Calculation Service
 *
 * - Monthly basis Z: basic salary from employee (see resolveMonthlySalaryZ with basis "basic"),
 *   or second_salary when options.useSecondSalary is true.
 * - per-day basic = Z / totalDaysInMonth (payroll month length from caller).
 * - Working hours per day (x): department ot.groupWorkingHours → ot.workingHoursPerDay →
 *   ot.defaultWorkingHoursPerDay / global default (see resolveWorkingHoursPerDay).
 * - per-hour basic (rate used here) = per-day basic / x
 * - OT pay = OT hours × per-hour basic (no minimum-hours gate, no OT multiplier on pay).
 *
 * Each calculateOTPay call logs a short trace to the console with prefix [OTPay].
 */

async function getResolvedOTSettings(departmentId, divisionId = null, employee = null) {
  try {
    const cacheKey = `settings:ot:v3:dept:${departmentId}:div:${divisionId || 'none'}`;
    let merged = await cacheService.get(cacheKey);
    if (!merged) {
      merged = await getMergedOtConfig(departmentId, divisionId);
      await cacheService.set(cacheKey, merged, 300);
    }

    const x = resolveWorkingHoursPerDay(merged, employee || {});

    return {
      ...merged,
      workingHoursPerDayResolved: x,
    };
  } catch (error) {
    console.error('Error getting resolved OT settings:', error);
    return {
      otPayPerHour: 0,
      minOTHours: 0,
      multiplier: 1,
      workingHoursPerDayResolved: 8,
    };
  }
}

/**
 * @param {number} otHours
 * @param {string} departmentId
 * @param {string|null} divisionId
 * @param {object} [options]
 * @param {object} [options.employee]
 * @param {number} [options.totalDaysInMonth]
 * @param {boolean} [options.useSecondSalary] - Use employee.second_salary as Z (second salary payroll)
 */
async function calculateOTPay(otHours, departmentId, divisionId = null, options = {}) {
  const rawOtHoursIn = otHours;
  if (otHours === null || otHours === undefined) {
    otHours = 0;
  }
  if (otHours < 0) {
    otHours = 0;
  }

  const { employee, totalDaysInMonth, useSecondSalary = false } = options;

  const merged = await getMergedOtConfig(departmentId, divisionId);
  const x = resolveWorkingHoursPerDay(merged, employee || {});
  const y = num(totalDaysInMonth, 0) > 0 ? num(totalDaysInMonth, 30) : 30;
  const monthlyBasic = employee ? resolveMonthlySalaryZ(employee, 'basic', useSecondSalary) : 0;
  const perDayBasic = y > 0 ? monthlyBasic / y : 0;
  const otPayPerHour = x > 0 ? perDayBasic / x : 0;
  const otPay = Math.round(otHours * otPayPerHour * 100) / 100;

  const gid =
    employee?.employee_group_id?._id?.toString?.() ||
    employee?.employee_group_id?.toString?.() ||
    null;
  let groupHoursRow = null;
  if (gid && Array.isArray(merged.groupWorkingHours)) {
    groupHoursRow = merged.groupWorkingHours.find((r) => String(r.employeeGroupId) === String(gid)) || null;
  }

  const empLabel = employee?.emp_no
    ? `${employee.emp_no}${employee?.employee_name ? ` (${employee.employee_name})` : ''}`
    : employee?._id
      ? String(employee._id)
      : '(no employee)';
  console.log('[OTPay] ---------- OT pay ----------');
  console.log('[OTPay] Employee:', empLabel);
  console.log('[OTPay] Dept / division:', String(departmentId ?? '—'), '/', divisionId != null ? String(divisionId) : '—');
  console.log('[OTPay] Salary basis: useSecondSalary =', useSecondSalary, '(Z = basic or second_salary via resolver)');
  console.log('[OTPay] OT hours: input =', rawOtHoursIn, '→ used in formula =', otHours, '(negative clamped to 0)');
  console.log('[OTPay] Month days (divisor y) =', y, '| totalDaysInMonth from options =', totalDaysInMonth ?? '—');
  console.log('[OTPay] Monthly Z =', monthlyBasic, '| per-day basic = Z/y =', perDayBasic);
  console.log(
    '[OTPay] Working hours/day (x):',
    x,
    '| dept defaultWorkingHoursPerDay =',
    merged.defaultWorkingHoursPerDay,
    '| dept workingHoursPerDay =',
    merged.workingHoursPerDay ?? '—',
    '| employee group =',
    gid ?? '—',
    '| group row hours =',
    groupHoursRow?.hoursPerDay ?? '—'
  );
  console.log('[OTPay] Per-hour rate = perDayBasic/x =', otPayPerHour, '(config minOTHours / multiplier are not applied to this pay line)');
  console.log('[OTPay] OT pay = hours × rate =', otHours, '×', otPayPerHour, '=', otPay);
  console.log('[OTPay] ------------------------------');

  return {
    otHours,
    /** Kept for callers; same as otHours (no minimum-hours filter). */
    eligibleOTHours: otHours,
    otPayPerHour,
    minOTHours: 0,
    otPay,
    isEligible: otHours > 0 && otPayPerHour > 0,
    formula: { monthlyBasic, perDayBasic, x, daysDivisor: y },
  };
}

module.exports = {
  getResolvedOTSettings,
  calculateOTPay,
};
