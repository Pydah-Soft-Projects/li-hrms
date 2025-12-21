const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Permission = require('../../permissions/model/Permission');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const PermissionDeductionSettings = require('../../permissions/model/PermissionDeductionSettings');
const AttendanceDeductionSettings = require('../../attendance/model/AttendanceDeductionSettings');
const AllowanceDeductionMaster = require('../../allowances-deductions/model/AllowanceDeductionMaster');

/**
 * Deduction Calculation Service
 * Handles all types of deductions: attendance, permission, leave, and other deductions
 */

/**
 * Get resolved permission deduction rules
 * @param {String} departmentId - Department ID
 * @returns {Object} Resolved rules
 */
async function getResolvedPermissionDeductionRules(departmentId) {
  try {
    const deptSettings = await DepartmentSettings.findOne({ department: departmentId });
    const globalSettings = await PermissionDeductionSettings.getActiveSettings();

    return {
      countThreshold: deptSettings?.permissions?.deductionRules?.countThreshold ?? globalSettings?.deductionRules?.countThreshold ?? null,
      deductionType: deptSettings?.permissions?.deductionRules?.deductionType ?? globalSettings?.deductionRules?.deductionType ?? null,
      deductionAmount: deptSettings?.permissions?.deductionRules?.deductionAmount ?? globalSettings?.deductionRules?.deductionAmount ?? null,
      minimumDuration: deptSettings?.permissions?.deductionRules?.minimumDuration ?? globalSettings?.deductionRules?.minimumDuration ?? null,
      calculationMode: deptSettings?.permissions?.deductionRules?.calculationMode ?? globalSettings?.deductionRules?.calculationMode ?? null,
    };
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
 * Get resolved attendance deduction rules
 * @param {String} departmentId - Department ID
 * @returns {Object} Resolved rules
 */
async function getResolvedAttendanceDeductionRules(departmentId) {
  try {
    const deptSettings = await DepartmentSettings.findOne({ department: departmentId });
    const globalSettings = await AttendanceDeductionSettings.getActiveSettings();

    return {
      combinedCountThreshold: deptSettings?.attendance?.deductionRules?.combinedCountThreshold ?? globalSettings?.deductionRules?.combinedCountThreshold ?? null,
      deductionType: deptSettings?.attendance?.deductionRules?.deductionType ?? globalSettings?.deductionRules?.deductionType ?? null,
      deductionAmount: deptSettings?.attendance?.deductionRules?.deductionAmount ?? globalSettings?.deductionRules?.deductionAmount ?? null,
      minimumDuration: deptSettings?.attendance?.deductionRules?.minimumDuration ?? globalSettings?.deductionRules?.minimumDuration ?? null,
      calculationMode: deptSettings?.attendance?.deductionRules?.calculationMode ?? globalSettings?.deductionRules?.calculationMode ?? null,
    };
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
function calculateDaysToDeduct(multiplier, remainder, deductionType, customAmount, perDayBasicPay, calculationMode) {
  let days = 0;

  if (deductionType === 'half_day') {
    days = multiplier * 0.5;
    if (calculationMode === 'proportional' && remainder > 0) {
      days += (remainder / (multiplier === 0 ? 1 : multiplier)) * 0.5;
    }
  } else if (deductionType === 'full_day') {
    days = multiplier * 1;
    if (calculationMode === 'proportional' && remainder > 0) {
      days += (remainder / (multiplier === 0 ? 1 : multiplier)) * 1;
    }
  } else if (deductionType === 'custom_amount' && customAmount && perDayBasicPay > 0) {
    // Convert custom amount to days
    const amountPerThreshold = customAmount;
    days = (multiplier * amountPerThreshold) / perDayBasicPay;
    if (calculationMode === 'proportional' && remainder > 0) {
      days += ((remainder / (multiplier === 0 ? 1 : multiplier)) * amountPerThreshold) / perDayBasicPay;
    }
  }

  return Math.round(days * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate attendance deduction (late-ins + early-outs)
 * @param {String} employeeId - Employee ID
 * @param {String} month - Month in YYYY-MM format
 * @param {String} departmentId - Department ID
 * @param {Number} perDayBasicPay - Per day basic pay
 * @returns {Object} Attendance deduction result
 */
async function calculateAttendanceDeduction(employeeId, month, departmentId, perDayBasicPay) {
  try {
    const rules = await getResolvedAttendanceDeductionRules(departmentId);

    // If no rules configured, return zero
    if (!rules.combinedCountThreshold || !rules.deductionType || !rules.calculationMode) {
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

    // Fetch attendance records for the month
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

    let lateInsCount = 0;
    let earlyOutsCount = 0;

    const minimumDuration = rules.minimumDuration || 0;

    for (const record of attendanceRecords) {
      if (record.lateInMinutes !== null && record.lateInMinutes !== undefined && record.lateInMinutes >= minimumDuration) {
        lateInsCount++;
      }
      if (record.earlyOutMinutes !== null && record.earlyOutMinutes !== undefined && record.earlyOutMinutes >= minimumDuration) {
        earlyOutsCount++;
      }
    }

    const combinedCount = lateInsCount + earlyOutsCount;

    let daysDeducted = 0;

    if (combinedCount >= rules.combinedCountThreshold) {
      const multiplier = Math.floor(combinedCount / rules.combinedCountThreshold);
      const remainder = combinedCount % rules.combinedCountThreshold;

      daysDeducted = calculateDaysToDeduct(
        multiplier,
        remainder,
        rules.deductionType,
        rules.deductionAmount,
        perDayBasicPay,
        rules.calculationMode
      );
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
async function calculatePermissionDeduction(employeeId, month, departmentId, perDayBasicPay) {
  try {
    const rules = await getResolvedPermissionDeductionRules(departmentId);

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
async function getAllActiveDeductions(departmentId) {
  try {
    const deductionMasters = await AllowanceDeductionMaster.find({
      category: 'deduction',
      isActive: true,
    });

    const deductions = [];

    for (const master of deductionMasters) {
      const rule = getResolvedDeductionRule(master, departmentId);

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
 * Calculate other deductions (from AllowanceDeductionMaster)
 * NEW APPROACH: Get all deductions, separate by type, apply fixed first, then percentage
 * @param {String} departmentId - Department ID
 * @param {Number} basicPay - Basic pay
 * @param {Number} grossSalary - Gross salary (for percentage base = 'gross')
 * @returns {Array} Array of deduction objects
 */
async function calculateOtherDeductions(departmentId, basicPay, grossSalary = null, attendanceData = null) {
  try {
    // Get all active deductions
    const allDeductions = await getAllActiveDeductions(departmentId);

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
        if (amount > 0) {
          fixedDeductions.push({
            masterId: deduction.masterId,
            name: deduction.name,
            amount,
            type: 'fixed',
            base: null,
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
      if (amount > 0) {
        percentageBasicResults.push({
          masterId: deduction.masterId,
          name: deduction.name,
          amount,
          type: 'percentage',
          base: 'basic',
          basedOnPresentDays: deduction.rule.basedOnPresentDays || false,
        });
      }
    }

    // Calculate percentage deductions based on 'gross' (only if grossSalary is provided)
    const percentageGrossResults = [];
    if (grossSalary !== null && grossSalary !== undefined) {
      for (const deduction of percentageGrossDeductions) {
        const amount = calculateDeductionAmount(deduction.rule, basicPay, grossSalary, attendanceData);
        if (amount > 0) {
          percentageGrossResults.push({
            masterId: deduction.masterId,
            name: deduction.name,
            amount,
            type: 'percentage',
            base: 'gross',
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
 * Get resolved deduction rule for a department
 * @param {Object} deductionMaster - AllowanceDeductionMaster document
 * @param {String} departmentId - Department ID
 * @returns {Object} Resolved rule
 */
function getResolvedDeductionRule(deductionMaster, departmentId) {
  if (!deductionMaster || !deductionMaster.isActive) {
    return null;
  }

  // Check for department override
  if (departmentId && deductionMaster.departmentRules && deductionMaster.departmentRules.length > 0) {
    const deptRule = deductionMaster.departmentRules.find(
      (rule) => rule.departmentId.toString() === departmentId.toString()
    );

    if (deptRule) {
      return {
        type: deptRule.type,
        amount: deptRule.amount,
        percentage: deptRule.percentage,
        percentageBase: deptRule.percentageBase,
        minAmount: deptRule.minAmount,
        maxAmount: deptRule.maxAmount,
        basedOnPresentDays: deptRule.basedOnPresentDays || false,
      };
    }
  }

  // Return global rule
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

