const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Permission = require('../../permissions/model/Permission');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const PermissionDeductionSettings = require('../../permissions/model/PermissionDeductionSettings');
const AttendanceDeductionSettings = require('../../attendance/model/AttendanceDeductionSettings');
const AllowanceDeductionMaster = require('../../allowances-deductions/model/AllowanceDeductionMaster');
const cacheService = require('../../shared/services/cacheService');

/**
 * Deduction Calculation Service
 * Handles all types of deductions: attendance, permission, leave, and other deductions
 */

/**
 * Resolve permission deduction settings for a department and optional division, falling back to global settings when values are not defined.
 * @param {String} departmentId - Department identifier to resolve rules for.
 * @param {String|null} [divisionId=null] - Optional division identifier to resolve division-specific overrides.
 * @returns {{countThreshold: number|null, deductionType: string|null, deductionAmount: number|null, minimumDuration: number|null, calculationMode: string|null}} An object containing the resolved permission deduction fields. Each field will be the department/division-specific value if present, otherwise the global value if present, or `null` when no value is available (also returned as `null` for all fields on error).
 */
async function getResolvedPermissionDeductionRules(departmentId, divisionId = null) {
  try {
    const cacheKey = `settings:deduction:permission:dept:${departmentId}:div:${divisionId || 'none'}`;
    let resolved = await cacheService.get(cacheKey);
    console.log('resolved', resolved);
    if (resolved) return resolved;

    const deptSettings = await DepartmentSettings.getByDeptAndDiv(departmentId, divisionId);
    const globalSettings = await PermissionDeductionSettings.getActiveSettings();

    resolved = {
      countThreshold: deptSettings?.permissions?.deductionRules?.countThreshold ?? globalSettings?.deductionRules?.countThreshold ?? null,
      deductionType: deptSettings?.permissions?.deductionRules?.deductionType ?? globalSettings?.deductionRules?.deductionType ?? null,
      deductionAmount: deptSettings?.permissions?.deductionRules?.deductionAmount ?? globalSettings?.deductionRules?.deductionAmount ?? null,
      minimumDuration: deptSettings?.permissions?.deductionRules?.minimumDuration ?? globalSettings?.deductionRules?.minimumDuration ?? null,
      calculationMode: deptSettings?.permissions?.deductionRules?.calculationMode ?? globalSettings?.deductionRules?.calculationMode ?? null,
    };

    await cacheService.set(cacheKey, resolved, 300);
    console.log(' after cache resolved', resolved);
    return resolved;
  } catch (error) {
    console.error('Error getting resolved permission deduction rules:', error);
    return {
      countThreshold: null,
      deductionType: null,
      deductionAmount: null,
      minimumDuration: null,
      calculationMode: null,
    };
  }
}

/**
 * Resolve attendance deduction rules for a department and optional division, preferring division/department-specific settings and falling back to global settings.
 * @param {String} departmentId - Department identifier to resolve rules for.
 * @param {String|null} [divisionId=null] - Optional division identifier to prefer division-level overrides.
 * @returns {Object} An object containing resolved attendance deduction rule fields:
 *  - {number|null} combinedCountThreshold - Threshold of combined late/early occurrences required to trigger a deduction.
 *  - {string|null} deductionType - Type of deduction (e.g., "half_day", "full_day", "custom_amount").
 *  - {number|null} deductionAmount - Amount used for custom_amount deductions (in days or currency depending on context).
 *  - {number|null} minimumDuration - Minimum minutes required for a single late/early occurrence to be counted.
 *  - {string|null} calculationMode - Mode used to calculate deductions (e.g., "proportional", "strict").
 */
async function getResolvedAttendanceDeductionRules(departmentId, divisionId = null) {
  try {
    const cacheKey = `settings:deduction:attendance:dept:${departmentId}:div:${divisionId || 'none'}`;
    let resolved = await cacheService.get(cacheKey);
    console.log('resolved', resolved);
    if (resolved) return resolved;

    const deptSettings = await DepartmentSettings.getByDeptAndDiv(departmentId, divisionId);
    const globalSettings = await AttendanceDeductionSettings.getActiveSettings();

    resolved = {
      combinedCountThreshold: deptSettings?.attendance?.deductionRules?.combinedCountThreshold ?? globalSettings?.deductionRules?.combinedCountThreshold ?? null,
      deductionType: deptSettings?.attendance?.deductionRules?.deductionType ?? globalSettings?.deductionRules?.deductionType ?? null,
      deductionAmount: deptSettings?.attendance?.deductionRules?.deductionAmount ?? globalSettings?.deductionRules?.deductionAmount ?? null,
      minimumDuration: deptSettings?.attendance?.deductionRules?.minimumDuration ?? globalSettings?.deductionRules?.minimumDuration ?? null,
      calculationMode: deptSettings?.attendance?.deductionRules?.calculationMode ?? globalSettings?.deductionRules?.calculationMode ?? null,
    };

    await cacheService.set(cacheKey, resolved, 300);
    console.log(' after cache resolved', resolved);
    return resolved;
  } catch (error) {
    console.error('Error getting resolved attendance deduction rules:', error);
    return {
      combinedCountThreshold: null,
      deductionType: null,
      deductionAmount: null,
      minimumDuration: null,
      calculationMode: null,
    };
  }
}

/**
 * Calculate days to deduct based on deduction type
 * @param {Number} multiplier - Multiplier from calculation
 * @param {Number} remainder - Remainder from calculation
 * @param {String} deductionType - 'half_day', 'full_day', or 'custom_amount'
 * @param {Number} customAmount - Custom amount if type is 'custom_amount'
 * @param {Number} perDayBasicPay - Per day basic pay for custom amount conversion
 * @param {String} calculationMode - 'proportional' or 'floor'
 * @returns {Number} Days to deduct
 */
function calculateDaysToDeduct(multiplier, remainder, threshold, deductionType, customAmount, perDayBasicPay, calculationMode) {
  let days = 0;

  if (deductionType === 'half_day') {
    days = multiplier * 0.5;
    if (calculationMode === 'proportional' && remainder > 0 && threshold > 0) {
      days += (remainder / threshold) * 0.5;
    }
  } else if (deductionType === 'full_day') {
    days = multiplier * 1;
    if (calculationMode === 'proportional' && remainder > 0 && threshold > 0) {
      days += (remainder / threshold) * 1;
    }
  } else if (deductionType === 'custom_amount' && customAmount && perDayBasicPay > 0) {
    // Convert custom amount to days
    const amountPerThreshold = customAmount;
    days = (multiplier * amountPerThreshold) / perDayBasicPay;
    if (calculationMode === 'proportional' && remainder > 0 && threshold > 0) {
      days += ((remainder / threshold) * amountPerThreshold) / perDayBasicPay;
    }
  }

  return Math.round(days * 100) / 100; // Round to 2 decimals
}

/**
 * Compute the attendance-based deduction (from late-ins and early-outs) for an employee for a given month.
 * @param {String} employeeId - Employee identifier.
 * @param {String} month - Month in `YYYY-MM` format for which to calculate the deduction.
 * @param {String} departmentId - Department identifier used to resolve deduction rules.
 * @param {Number} perDayBasicPay - Per-day basic pay used to convert deducted days into an amount.
 * @param {String|null} [divisionId=null] - Optional division identifier used when resolving department/division-specific rules.
 * @returns {Object} Result object containing:
 *  - {Number} attendanceDeduction - Deduction amount rounded to 2 decimals.
 *  - {Object} breakdown - Details including:
 *      - {Number} lateInsCount
 *      - {Number} earlyOutsCount
 *      - {Number} combinedCount
 *      - {Number} daysDeducted
 *      - {String|null} deductionType
 *      - {String|null} calculationMode
 */
async function calculateAttendanceDeduction(employeeId, month, departmentId, perDayBasicPay, divisionId = null) {
  try {
    // 1. Fetch counts FIRST (so we can return them even if no deduction rules apply)
    const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
    // Using lean() to bypass strict mode filtering if fields are missing from schema but present in DB
    let payRegister = await PayRegisterSummary.findOne({ employeeId, month }).lean();
    let lateInsCount = 0;
    let earlyOutsCount = 0;
    let source = 'attendance_logs';

    // Priority 1: Check Pay Register Summary
    if (payRegister && payRegister.totals) {
      const prLates = payRegister.totals.lateCount || 0;
      const prEarly = payRegister.totals.earlyOutCount || 0;

      if (prLates > 0 || prEarly > 0) {
        lateInsCount = prLates;
        earlyOutsCount = prEarly;
        source = 'pay_register_summary';
      }
    }

    // Priority 2: Fallback to Raw Attendance Logs if Pay Register has 0
    if (lateInsCount === 0 && earlyOutsCount === 0) {
      // Find minimum duration threshold from settings just for counting purposes
      // (We fetch rules here just to get minimumDuration, even if we don't deduct later)
      const rulesTemp = await getResolvedAttendanceDeductionRules(departmentId, divisionId);
      const minimumDuration = rulesTemp.minimumDuration || 0;
      // Parse month string (YYYY-MM) to get start and end dates
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

      const attendanceRecords = await AttendanceDaily.find({
        employeeId,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      }).select('lateInMinutes earlyOutMinutes');

      for (const record of attendanceRecords) {
        if (record.lateInMinutes !== null && record.lateInMinutes !== undefined && record.lateInMinutes >= minimumDuration) {
          lateInsCount++;
        }
        if (record.earlyOutMinutes !== null && record.earlyOutMinutes !== undefined && record.earlyOutMinutes >= minimumDuration) {
          earlyOutsCount++;
        }
      }
    }

    console.log(`[Deduction] Employee ${employeeId} - Lates: ${lateInsCount}, Early: ${earlyOutsCount} (Source: ${source})`);

    // 2. Fetch Rules and Calculate Deduction
    const rules = await getResolvedAttendanceDeductionRules(departmentId, divisionId);

    // If no rules configured, return counts but zero deduction result
    if (!rules.combinedCountThreshold || !rules.deductionType || !rules.calculationMode) {
      console.log('[Deduction] No valid rules configured. Returning counts with 0 deduction.');
      return {
        attendanceDeduction: 0,
        breakdown: {
          lateInsCount,
          earlyOutsCount,
          combinedCount: lateInsCount + earlyOutsCount,
          daysDeducted: 0,
          deductionType: null,
          calculationMode: null,
        },
      };
    }

    const combinedCount = lateInsCount + earlyOutsCount;
    let daysDeducted = 0;

    if (combinedCount >= rules.combinedCountThreshold) {
      const multiplier = Math.floor(combinedCount / rules.combinedCountThreshold);
      const remainder = combinedCount % rules.combinedCountThreshold;

      daysDeducted = calculateDaysToDeduct(
        multiplier,
        remainder,
        rules.combinedCountThreshold,
        rules.deductionType,
        rules.deductionAmount,
        perDayBasicPay,
        rules.calculationMode
      );
      console.log(`[Deduction] Calculated deduction: ${daysDeducted} days based on ${combinedCount} combined lates/early.`);
    } else {
      console.log(`[Deduction] Combined count ${combinedCount} is below threshold ${rules.combinedCountThreshold}`);
    }

    const attendanceDeduction = daysDeducted * perDayBasicPay;

    return {
      attendanceDeduction: Math.round(attendanceDeduction * 100) / 100,
      breakdown: {
        lateInsCount,
        earlyOutsCount,
        combinedCount,
        daysDeducted,
        deductionType: rules.deductionType,
        calculationMode: rules.calculationMode,
      },
    };
  } catch (error) {
    console.error('Error calculating attendance deduction:', error);
    return {
      attendanceDeduction: 0,
      breakdown: {
        lateInsCount: 0,
        earlyOutsCount: 0,
        combinedCount: 0,
        daysDeducted: 0,
        deductionType: null,
        calculationMode: null,
      },
    };
  }
}

/**
 * Calculate permission deduction
 * @param {String} employeeId - Employee ID
 * @param {String} month - Month in YYYY-MM format
 * @param {String} departmentId - Department ID
 * @param {Number} perDayBasicPay - Per day basic pay
 * @returns {Object} Permission deduction result
 */
async function calculatePermissionDeduction(employeeId, month, departmentId, perDayBasicPay, divisionId = null) {
  try {
    const rules = await getResolvedPermissionDeductionRules(departmentId, divisionId);

    // If no rules configured, return zero
    if (!rules.countThreshold || !rules.deductionType || !rules.calculationMode) {
      return {
        permissionDeduction: 0,
        breakdown: {
          permissionCount: 0,
          eligiblePermissionCount: 0,
          daysDeducted: 0,
          deductionType: null,
          calculationMode: null,
        },
      };
    }

    // Fetch permissions for the month
    // Parse month string (YYYY-MM) to get start and end dates
    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const permissions = await Permission.find({
      employeeId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      status: 'approved',
    }).select('duration');

    const minimumDuration = rules.minimumDuration || 0;

    // Filter permissions by minimum duration
    const eligiblePermissions = permissions.filter(
      (perm) => perm.duration !== null && perm.duration !== undefined && perm.duration >= minimumDuration
    );

    const eligiblePermissionCount = eligiblePermissions.length;
    const totalPermissionCount = permissions.length;

    let daysDeducted = 0;

    if (eligiblePermissionCount >= rules.countThreshold) {
      const multiplier = Math.floor(eligiblePermissionCount / rules.countThreshold);
      const remainder = eligiblePermissionCount % rules.countThreshold;

      daysDeducted = calculateDaysToDeduct(
        multiplier,
        remainder,
        rules.countThreshold,
        rules.deductionType,
        rules.deductionAmount,
        perDayBasicPay,
        rules.calculationMode
      );
    }

    const permissionDeduction = daysDeducted * perDayBasicPay;

    return {
      permissionDeduction: Math.round(permissionDeduction * 100) / 100,
      breakdown: {
        permissionCount: totalPermissionCount,
        eligiblePermissionCount,
        daysDeducted,
        deductionType: rules.deductionType,
        calculationMode: rules.calculationMode,
      },
    };
  } catch (error) {
    console.error('Error calculating permission deduction:', error);
    return {
      permissionDeduction: 0,
      breakdown: {
        permissionCount: 0,
        eligiblePermissionCount: 0,
        daysDeducted: 0,
        deductionType: null,
        calculationMode: null,
      },
    };
  }
}

/**
 * Calculate leave deduction
 * @param {Number} totalLeaves - Total leaves from attendance summary
 * @param {Number} paidLeaves - Paid leaves from department settings
 * @param {Number} totalDaysInMonth - Total days in month
 * @param {Number} basicPay - Basic pay
 * @returns {Object} Leave deduction result
 */
function calculateLeaveDeduction(totalLeaves, paidLeaves, totalDaysInMonth, basicPay) {
  const unpaidLeaves = Math.max(0, totalLeaves - (paidLeaves || 0));
  const daysDeducted = unpaidLeaves;
  const leaveDeduction = totalDaysInMonth > 0 ? (daysDeducted / totalDaysInMonth) * basicPay : 0;

  return {
    leaveDeduction: Math.round(leaveDeduction * 100) / 100,
    breakdown: {
      totalLeaves: totalLeaves || 0,
      paidLeaves: paidLeaves || 0,
      unpaidLeaves,
      daysDeducted,
    },
  };
}

/**
 * Get all active deductions for a department
 * @param {String} departmentId - Department ID
 * @returns {Array} Array of deduction master objects with resolved rules
 */
async function getAllActiveDeductions(departmentId, divisionId = null) {
  try {
    const cacheKey = `settings:deduction:masters:all`;
    let deductionMasters = await cacheService.get(cacheKey);

    if (!deductionMasters) {
      deductionMasters = await AllowanceDeductionMaster.find({
        category: 'deduction',
        isActive: true,
      }).lean();
      await cacheService.set(cacheKey, deductionMasters, 600); // Master data can be cached longer
    }

    const deductions = [];

    for (const master of deductionMasters) {
      const rule = getResolvedDeductionRule(master, departmentId, divisionId);

      if (!rule) {
        continue;
      }

      deductions.push({
        masterId: master._id,
        name: master.name,
        rule: {
          type: rule.type,
          amount: rule.amount,
          percentage: rule.percentage,
          percentageBase: rule.percentageBase,
          minAmount: rule.minAmount,
          maxAmount: rule.maxAmount,
        },
      });
    }

    return deductions;
  } catch (error) {
    console.error('Error getting all active deductions:', error);
    return [];
  }
}

/**
 * Calculate all applicable other deductions for a department and return them ordered: fixed, percentage based on basic, then percentage based on gross.
 * @param {String} departmentId - Department identifier used to resolve active deduction masters.
 * @param {Number} basicPay - Employee basic pay used as the primary base for calculations and prorating.
 * @param {Number} [grossSalary] - Gross salary used when a deduction's percentage base is 'gross'; if omitted, gross-based deductions are skipped.
 * @param {Object} [attendanceData] - Attendance data used when prorating fixed deductions; may include present, paidLeave, od, and monthDays.
 * @param {String} [divisionId] - Division identifier used to resolve division-specific deduction rules.
 * @returns {Array<Object>} Array of deduction objects in calculation order. Each object contains: masterId, name, amount, type ('fixed'|'percentage'), base (null|'basic'|'gross'), percentage, percentageBase, minAmount, maxAmount, and basedOnPresentDays.
async function calculateOtherDeductions(departmentId, basicPay, grossSalary = null, attendanceData = null, divisionId = null) {
  try {
    // Get all active deductions
    const allDeductions = await getAllActiveDeductions(departmentId, divisionId);

    if (allDeductions.length === 0) {
      return [];
    }

    // Separate deductions by type
    const fixedDeductions = [];
    const percentageBasicDeductions = [];
    const percentageGrossDeductions = [];

    for (const deduction of allDeductions) {
      const { rule } = deduction;

      if (rule.type === 'fixed') {
        // Fixed deductions don't need a base - apply them directly
        const amount = calculateDeductionAmount(rule, basicPay, grossSalary, attendanceData);
        if (amount >= 0) {
          fixedDeductions.push({
            masterId: deduction.masterId,
            name: deduction.name,
            amount,
            type: 'fixed',
            base: null,
            percentage: rule.percentage,
            percentageBase: rule.percentageBase,
            minAmount: rule.minAmount,
            maxAmount: rule.maxAmount,
            basedOnPresentDays: rule.basedOnPresentDays || false,
          });
        }
      } else if (rule.type === 'percentage') {
        // Percentage deductions need to be separated by base
        if (rule.percentageBase === 'basic') {
          percentageBasicDeductions.push(deduction);
        } else if (rule.percentageBase === 'gross') {
          percentageGrossDeductions.push(deduction);
        }
      }
    }

    // Calculate fixed deductions (no base needed)
    const fixedResults = fixedDeductions;

    // Calculate percentage deductions based on 'basic'
    const percentageBasicResults = [];
    for (const deduction of percentageBasicDeductions) {
      const amount = calculateDeductionAmount(deduction.rule, basicPay, null, attendanceData);
      if (amount >= 0) {
        percentageBasicResults.push({
          masterId: deduction.masterId,
          name: deduction.name,
          amount,
          type: 'percentage',
          base: 'basic',
          percentage: deduction.rule.percentage,
          percentageBase: deduction.rule.percentageBase,
          minAmount: deduction.rule.minAmount,
          maxAmount: deduction.rule.maxAmount,
          basedOnPresentDays: deduction.rule.basedOnPresentDays || false,
        });
      }
    }

    // Calculate percentage deductions based on 'gross' (only if grossSalary is provided)
    const percentageGrossResults = [];
    if (grossSalary !== null && grossSalary !== undefined) {
      for (const deduction of percentageGrossDeductions) {
        const amount = calculateDeductionAmount(deduction.rule, basicPay, grossSalary, attendanceData);
        if (amount >= 0) {
          percentageGrossResults.push({
            masterId: deduction.masterId,
            name: deduction.name,
            amount,
            type: 'percentage',
            base: 'gross',
            percentage: deduction.rule.percentage,
            percentageBase: deduction.rule.percentageBase,
            minAmount: deduction.rule.minAmount,
            maxAmount: deduction.rule.maxAmount,
            basedOnPresentDays: deduction.rule.basedOnPresentDays || false,
          });
        }
      }
    }

    // Combine all deductions: fixed first, then percentage basic, then percentage gross
    const allResults = [...fixedResults, ...percentageBasicResults, ...percentageGrossResults];

    return allResults;
  } catch (error) {
    console.error('Error calculating other deductions:', error);
    return [];
  }
}

/**
 * Get resolved deduction rule for a department (with optional division support)
 * @param {Object} deductionMaster - AllowanceDeductionMaster document
 * @param {String} departmentId - Department ID
 * @param {String} divisionId - Optional Division ID
 * @returns {Object} Resolved rule
 */
function getResolvedDeductionRule(deductionMaster, departmentId, divisionId = null) {
  if (!deductionMaster || !deductionMaster.isActive) {
    return null;
  }

  // Priority 1: Check for division-department specific rule
  if (divisionId && departmentId && deductionMaster.departmentRules && deductionMaster.departmentRules.length > 0) {
    const divDeptRule = deductionMaster.departmentRules.find(
      (rule) =>
        rule.divisionId &&
        rule.divisionId.toString() === divisionId.toString() &&
        rule.departmentId.toString() === departmentId.toString()
    );

    if (divDeptRule) {
      return {
        type: divDeptRule.type,
        amount: divDeptRule.amount,
        percentage: divDeptRule.percentage,
        percentageBase: divDeptRule.percentageBase,
        minAmount: divDeptRule.minAmount,
        maxAmount: divDeptRule.maxAmount,
        basedOnPresentDays: divDeptRule.basedOnPresentDays || false,
      };
    }
  }

  // Priority 2: Check for department-only rule (backward compatible)
  if (departmentId && deductionMaster.departmentRules && deductionMaster.departmentRules.length > 0) {
    const deptOnlyRule = deductionMaster.departmentRules.find(
      (rule) =>
        !rule.divisionId && // No division specified
        rule.departmentId.toString() === departmentId.toString()
    );

    if (deptOnlyRule) {
      return {
        type: deptOnlyRule.type,
        amount: deptOnlyRule.amount,
        percentage: deptOnlyRule.percentage,
        percentageBase: deptOnlyRule.percentageBase,
        minAmount: deptOnlyRule.minAmount,
        maxAmount: deptOnlyRule.maxAmount,
        basedOnPresentDays: deptOnlyRule.basedOnPresentDays || false,
      };
    }
  }

  // Priority 3: Return global rule
  if (deductionMaster.globalRule) {
    return {
      type: deductionMaster.globalRule.type,
      amount: deductionMaster.globalRule.amount,
      percentage: deductionMaster.globalRule.percentage,
      percentageBase: deductionMaster.globalRule.percentageBase,
      minAmount: deductionMaster.globalRule.minAmount,
      maxAmount: deductionMaster.globalRule.maxAmount,
      basedOnPresentDays: deductionMaster.globalRule.basedOnPresentDays || false,
    };
  }

  return null;
}

/**
 * Calculate deduction amount from rule
 * @param {Object} rule - Resolved rule
 * @param {Number} basicPay - Basic pay
 * @param {Number} grossSalary - Gross salary (for percentage base = 'gross')
 * @param {Object} attendanceData - Attendance data for proration { presentDays, paidLeaveDays, odDays, monthDays }
 * @returns {Number} Deduction amount
 */
function calculateDeductionAmount(rule, basicPay, grossSalary = null, attendanceData = null) {
  if (!rule) {
    return 0;
  }

  let amount = 0;

  if (rule.type === 'fixed') {
    amount = rule.amount || 0;

    // Prorate based on present days if enabled
    if (rule.basedOnPresentDays && attendanceData) {
      const { presentDays = 0, paidLeaveDays = 0, odDays = 0, monthDays = 30 } = attendanceData;
      const totalPaidDays = presentDays + paidLeaveDays + odDays;

      if (monthDays > 0) {
        const perDayAmount = amount / monthDays;
        amount = perDayAmount * totalPaidDays;
        console.log(`[Deduction] Prorated ${rule.name || 'deduction'}: ${rule.amount} / ${monthDays} * ${totalPaidDays} = ${amount}`);
      }
    }
  } else if (rule.type === 'percentage') {
    const base = rule.percentageBase === 'gross' && grossSalary ? grossSalary : basicPay;
    amount = (base * (rule.percentage || 0)) / 100;
  }

  // Apply min/max constraints
  if (rule.minAmount !== null && rule.minAmount !== undefined && amount < rule.minAmount) {
    amount = rule.minAmount;
  }
  if (rule.maxAmount !== null && rule.maxAmount !== undefined && amount > rule.maxAmount) {
    amount = rule.maxAmount;
  }

  return Math.round(amount * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate total other deductions
 * @param {Array} deductions - Array of deduction objects
 * @returns {Number} Total deductions
 */
function calculateTotalOtherDeductions(deductions) {
  return deductions.reduce((sum, deduction) => sum + (deduction.amount || 0), 0);
}

module.exports = {
  getResolvedPermissionDeductionRules,
  getResolvedAttendanceDeductionRules,
  calculateDaysToDeduct,
  calculateAttendanceDeduction,
  calculatePermissionDeduction,
  calculateLeaveDeduction,
  calculateOtherDeductions,
  getResolvedDeductionRule,
  calculateDeductionAmount,
  calculateTotalOtherDeductions,
};
