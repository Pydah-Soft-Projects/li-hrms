/**
 * Merges global LeavePolicySettings.earnedLeave with department leaves.* overrides
 * (including legacy leaves.elEarningType). Used by EL accrual and payroll EL-as-paid logic.
 */

const { getLeavePolicyResolved } = require('../../settings/services/leavePolicyTypeConfigService');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');

function pick(override, fallback) {
  if (override != null && override !== '') return override;
  return fallback;
}

/**
 * @param {object} globalEarnedLeave - policy.earnedLeave
 * @param {object|null} [leavesDeptSettings] - DepartmentSettings.leaves
 * @returns {object} Effective earned-leave config for that department context
 */
function resolveEffectiveEarnedLeave(globalEarnedLeave = {}, leavesDeptSettings = null) {
  const g = globalEarnedLeave || {};
  const ov = (leavesDeptSettings && leavesDeptSettings.earnedLeave) || {};
  const legacyType = leavesDeptSettings?.elEarningType;

  const gAtt = g.attendanceRules || {};
  const oAtt = ov.attendanceRules || {};
  const useDeptRanges =
    Array.isArray(oAtt.attendanceRanges) && oAtt.attendanceRanges.length > 0;

  const attendanceRules = {
    minDaysForFirstEL: pick(oAtt.minDaysForFirstEL, gAtt.minDaysForFirstEL),
    daysPerEL: pick(oAtt.daysPerEL, gAtt.daysPerEL),
    maxELPerMonth: pick(oAtt.maxELPerMonth, gAtt.maxELPerMonth),
    maxELPerYear: pick(oAtt.maxELPerYear, gAtt.maxELPerYear),
    considerPresentDays: gAtt.considerPresentDays,
    considerHolidays: gAtt.considerHolidays,
    attendanceRanges: useDeptRanges ? oAtt.attendanceRanges : gAtt.attendanceRanges || [],
  };

  const gFix = g.fixedRules || {};
  const oFix = ov.fixedRules || {};
  const fixedRules = {
    elPerMonth: pick(oFix.elPerMonth, gFix.elPerMonth),
    maxELPerYear: pick(oFix.maxELPerYear, gFix.maxELPerYear),
  };

  const earningType =
    pick(ov.earningType, legacyType != null ? legacyType : undefined) || g.earningType;

  const enabled = ov.enabled != null ? !!ov.enabled : !!g.enabled;
  const useAsPaidInPayroll =
    ov.useAsPaidInPayroll != null ? !!ov.useAsPaidInPayroll : g.useAsPaidInPayroll !== false;

  return {
    enabled,
    earningType,
    useAsPaidInPayroll,
    attendanceRules,
    fixedRules,
  };
}

/**
 * Async helper for payroll / APIs (loads global policy + department settings).
 */
async function resolveEffectiveEarnedLeaveForDepartment(departmentId, divisionId = null) {
  const [policy, deptSettings] = await Promise.all([
    getLeavePolicyResolved(),
    DepartmentSettings.getByDeptAndDiv(departmentId, divisionId),
  ]);
  return resolveEffectiveEarnedLeave(policy?.earnedLeave, deptSettings?.leaves);
}

module.exports = {
  resolveEffectiveEarnedLeave,
  resolveEffectiveEarnedLeaveForDepartment,
};
