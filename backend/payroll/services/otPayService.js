const cacheService = require('../../shared/services/cacheService');
const {
  getMergedOtConfig,
  resolveMonthlySalaryZ,
  resolveWorkingHoursPerDay,
  resolveDaysPerMonth,
  num,
} = require('../../overtime/services/otConfigResolver');

/**
 * OT Pay Calculation Service
 * flat_per_hour (legacy) or formula: (z/y)/x * eligibleHours * multiplier
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
      employee && merged.payCalculationMode === 'formula'
        ? resolveWorkingHoursPerDay(merged, employee)
        : resolveWorkingHoursPerDay(merged, employee || {});

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
      payCalculationMode: 'flat_per_hour',
      workingHoursPerDayResolved: 8,
    };
  }
}

/**
 * @param {number} otHours
 * @param {string} departmentId
 * @param {string|null} divisionId
 * @param {object} [options]
 * @param {object} [options.employee] - Required for formula mode
 * @param {number} [options.totalDaysInMonth] - For formula + calendar mode
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

  const mode = merged.payCalculationMode || 'flat_per_hour';

  if (mode === 'formula' && employee) {
    const z = resolveMonthlySalaryZ(employee, merged.otSalaryBasis, useSecondSalary);
    const y = resolveDaysPerMonth(merged, totalDaysInMonth);
    const x = resolveWorkingHoursPerDay(merged, employee);
    const mult = num(merged.multiplier, 1);
    let hourlyRate = 0;
    if (z > 0 && y > 0 && x > 0) {
      hourlyRate = z / y / x;
    }
    const otPayRaw = eligibleOTHours * hourlyRate * mult;
    const otPay = Math.round(otPayRaw * 100) / 100;

    return {
      otHours,
      eligibleOTHours,
      otPayPerHour: Math.round(hourlyRate * 10000) / 10000,
      minOTHours,
      otPay,
      isEligible: eligibleOTHours > 0,
      payCalculationMode: 'formula',
      formula: { z, y, x, multiplier: mult },
    };
  }

  const otPayPerHour = num(merged.otPayPerHour, 0);
  const mult = num(merged.multiplier, 1);
  const otPay = Math.round(eligibleOTHours * otPayPerHour * mult * 100) / 100;

  return {
    otHours,
    eligibleOTHours,
    otPayPerHour,
    minOTHours,
    otPay,
    isEligible: eligibleOTHours > 0,
    payCalculationMode: 'flat_per_hour',
    formula: null,
  };
}

module.exports = {
  getResolvedOTSettings,
  calculateOTPay,
};
