const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const Settings = require('../../settings/model/Settings');
const allowanceService = require('./allowanceService');
const deductionService = require('./deductionService');

/**
 * Resolve the "include missing employee components" flag.
 * Department setting overrides global. Default = true (current behavior).
 */
async function getIncludeMissingFlag(departmentId) {
  try {
    if (departmentId) {
      const deptSettings = await DepartmentSettings.findOne({ department: departmentId });
      if (
        deptSettings?.payroll &&
        (deptSettings.payroll.includeMissingEmployeeComponents === true ||
          deptSettings.payroll.includeMissingEmployeeComponents === false)
      ) {
        return deptSettings.payroll.includeMissingEmployeeComponents;
      }
    }

    const globalSetting = await Settings.findOne({ key: 'include_missing_employee_components' });
    if (globalSetting && globalSetting.value !== undefined && globalSetting.value !== null) {
      return !!globalSetting.value;
    }

    return true; // Default: include missing (preserves existing behavior)
  } catch (e) {
    console.error('Error determining includeMissing flag:', e);
    return true;
  }
}

/**
 * Merge a base list with employee overrides.
 * - Overrides replace matching base items (by masterId or name).
 * - If includeMissing=false, skip base items not overridden.
 */
function mergeWithOverrides(baseList, overrides, includeMissing) {
  if (!overrides || overrides.length === 0) return includeMissing ? baseList : [];

  const result = [];
  const baseMap = new Map();
  baseList.forEach((item) => {
    const key = item.masterId ? item.masterId.toString() : (item.name || '').toLowerCase();
    baseMap.set(key, item);
  });

  const matched = new Set();

  overrides.forEach((ov) => {
    const key = ov.masterId ? ov.masterId.toString() : (ov.name || '').toLowerCase();
    const baseItem = baseMap.get(key);
    const overrideAmount = ov.amount ?? ov.overrideAmount ?? 0;
    const merged = baseItem
      ? { ...baseItem, amount: overrideAmount, isEmployeeOverride: true, masterId: ov.masterId || baseItem.masterId }
      : { ...ov, amount: overrideAmount, isEmployeeOverride: true };
    result.push(merged);
    matched.add(key);
  });

  if (includeMissing) {
    baseList.forEach((item) => {
      const key = item.masterId ? item.masterId.toString() : (item.name || '').toLowerCase();
      if (!matched.has(key)) {
        result.push(item);
      }
    });
  }

  return result;
}

/**
 * Build base (dept/global) allowances and deductions for a given salary context.
 */
async function buildBaseComponents(departmentId, grossSalary) {
  const basicPay = grossSalary || 0;

  // Allowances: two passes (basic-based and gross-based), mirroring payroll
  const allowancesBasic = await allowanceService.calculateAllowances(departmentId, basicPay, null, false);
  const allowancesGross = await allowanceService.calculateAllowances(departmentId, basicPay, grossSalary, true);
  const allowances = [...allowancesBasic, ...allowancesGross];

  // Deductions
  const deductions = await deductionService.calculateOtherDeductions(
    departmentId ? departmentId.toString() : null,
    basicPay,
    grossSalary
  );

  return { allowances, deductions };
}

/**
 * Resolve effective allowances/deductions for an employee (or for defaults when overrides are empty).
 */
async function resolveForEmployee({ departmentId, grossSalary, employeeAllowances = [], employeeDeductions = [] }) {
  const includeMissing = await getIncludeMissingFlag(departmentId);
  const base = await buildBaseComponents(departmentId, grossSalary);

  const mergedAllowances = mergeWithOverrides(base.allowances, employeeAllowances, includeMissing);
  const mergedDeductions = mergeWithOverrides(base.deductions, employeeDeductions, includeMissing);

  return {
    includeMissing,
    allowances: mergedAllowances,
    deductions: mergedDeductions,
  };
}

module.exports = {
  getIncludeMissingFlag,
  mergeWithOverrides,
  buildBaseComponents,
  resolveForEmployee,
};

