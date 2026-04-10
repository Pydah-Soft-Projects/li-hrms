const cacheService = require('../../shared/services/cacheService');
const {
  getMergedOtConfig,
  resolveMonthlySalaryZ,
  resolveWorkingHoursPerDay,
  num,
} = require('../../overtime/services/otConfigResolver');

/**
 * OT Pay Calculation Service
 * OT pay calculation:
 * per-hour = per-day-basic / working-hours-per-day
 * OT pay = eligibleHours * per-hour * multiplier
 */

async function getResolvedOTSettings(departmentId, divisionId = null, employee = null) {
  try {
    const cacheKey = `settings:ot:v3:dept:${departmentId}:div:${divisionId || 'none'}`;
    let merged = await cacheService.get(cacheKey);
    if (!merged) {
      merged = await getMergedOtConfig(departmentId, divisionId);
      await cacheService.set(cacheKey, merged, 300);
    }

    const x =
      resolveWorkingHoursPerDay(merged, employee || {});

    return {
      ...merged,
      workingHoursPerDayResolved: x,
    };
  } catch (error) {
    console.error('Error getting resolved OT settings:', error);
    return {
      otPayPerHour: 0,
      minOTHours: 0,
      multiplier: 1.5,
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
 * @param {boolean} [options.useSecondSalary] - Use employee.second_salary as z
 */
async function calculateOTPay(otHours, departmentId, divisionId = null, options = {}) {
  if (otHours === null || otHours === undefined) {
    otHours = 0;
  }
  if (otHours < 0) {
    otHours = 0;
  }

  const { employee, totalDaysInMonth, useSecondSalary = false } = options;

  const merged = await getMergedOtConfig(departmentId, divisionId);
  const minOTHours = num(merged.minOTHours, 0);
  let eligibleOTHours = 0;
  if (otHours + 1e-9 >= minOTHours) {
    eligibleOTHours = otHours;
  }

  const mult = num(merged.multiplier, 1);
  const x = resolveWorkingHoursPerDay(merged, employee || {});
  const y = num(totalDaysInMonth, 0) > 0 ? num(totalDaysInMonth, 30) : 30;
  const monthlyBasic = employee ? resolveMonthlySalaryZ(employee, 'basic', useSecondSalary) : 0;
  const perDayBasic = y > 0 ? monthlyBasic / y : 0;
  const otPayPerHour = x > 0 ? perDayBasic / x : 0;
  const otPay = Math.round(eligibleOTHours * otPayPerHour * mult * 100) / 100;

  return {
    otHours,
    eligibleOTHours,
    otPayPerHour,
    minOTHours,
    otPay,
    isEligible: eligibleOTHours > 0,
    formula: { monthlyBasic, perDayBasic, x, multiplier: mult, daysDivisor: y },
  };
}

module.exports = {
  getResolvedOTSettings,
  calculateOTPay,
};
