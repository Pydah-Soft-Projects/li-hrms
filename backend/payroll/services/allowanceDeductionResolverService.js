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
 * - When includeMissing=true, only add base items that are NOT overridden by employee.
 */
function mergeWithOverrides(baseList, overrides, includeMissing) {
  if (!overrides || overrides.length === 0) {
    return includeMissing ? baseList : [];
  }

  const result = [];
  
  // Create a map of base items for quick lookup
  // Use both masterId and name as keys to handle all matching scenarios
  const baseMapById = new Map();
  const baseMapByName = new Map();
  
  baseList.forEach((item) => {
    // Normalize masterId to string for comparison
    const masterIdKey = item.masterId ? item.masterId.toString() : null;
    // Normalize name: lowercase, trim whitespace
    const nameKey = item.name ? item.name.trim().toLowerCase() : null;
    
    if (masterIdKey) {
      baseMapById.set(masterIdKey, item);
    }
    if (nameKey) {
      baseMapByName.set(nameKey, item);
    }
  });

  // Track which base items have been matched/overridden
  const matchedBaseKeys = new Set();

  // Process employee overrides first
  overrides.forEach((ov) => {
    // Normalize override masterId and name
    const ovMasterIdKey = ov.masterId ? ov.masterId.toString() : null;
    const ovNameKey = ov.name ? ov.name.trim().toLowerCase() : null;
    
    // Try to find matching base item by masterId first, then by name
    let baseItem = null;
    let matchedKey = null;
    
    if (ovMasterIdKey && baseMapById.has(ovMasterIdKey)) {
      baseItem = baseMapById.get(ovMasterIdKey);
      matchedKey = ovMasterIdKey;
    } else if (ovNameKey && baseMapByName.has(ovNameKey)) {
      baseItem = baseMapByName.get(ovNameKey);
      // Use the masterId from base item if available, otherwise use name
      matchedKey = baseItem.masterId ? baseItem.masterId.toString() : ovNameKey;
    }
    
    // Mark this base item as matched
    if (matchedKey) {
      matchedBaseKeys.add(matchedKey);
      // Also mark by name if different
      if (baseItem && baseItem.name) {
        const baseNameKey = baseItem.name.trim().toLowerCase();
        if (baseNameKey !== matchedKey) {
          matchedBaseKeys.add(baseNameKey);
        }
      }
    }
    
    // Use override amount (can be null for explicit override to 0)
    const overrideAmount = ov.amount !== undefined && ov.amount !== null ? ov.amount : (ov.overrideAmount !== undefined && ov.overrideAmount !== null ? ov.overrideAmount : 0);
    
    // Create merged item: use base item structure but with override amount
    const merged = baseItem
      ? {
          ...baseItem,
          amount: overrideAmount,
          isEmployeeOverride: true,
          masterId: ovMasterIdKey || baseItem.masterId,
        }
      : {
          ...ov,
          amount: overrideAmount,
          isEmployeeOverride: true,
          masterId: ovMasterIdKey,
        };
    
    result.push(merged);
  });

  // If includeMissing is true, add base items that were NOT overridden
  if (includeMissing) {
    baseList.forEach((item) => {
      const masterIdKey = item.masterId ? item.masterId.toString() : null;
      const nameKey = item.name ? item.name.trim().toLowerCase() : null;
      
      // Check if this base item was already matched/overridden
      const isMatched = (masterIdKey && matchedBaseKeys.has(masterIdKey)) || 
                        (nameKey && matchedBaseKeys.has(nameKey));
      
      if (!isMatched) {
        // This base item is missing from employee overrides, add it
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

