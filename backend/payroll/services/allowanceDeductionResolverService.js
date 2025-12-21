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
 * Resolve absent deduction settings (enable + lopDaysPerAbsent) with department override then global fallback.
 * Defaults: enable=false, lopDaysPerAbsent=1.
 */
async function getAbsentDeductionSettings(departmentId) {
  const defaults = { enableAbsentDeduction: false, lopDaysPerAbsent: 1 };
  try {
    // Department override
    if (departmentId) {
      const deptSettings = await DepartmentSettings.findOne({ department: departmentId });
      const hasEnable =
        deptSettings?.payroll &&
        (deptSettings.payroll.enableAbsentDeduction === true ||
          deptSettings.payroll.enableAbsentDeduction === false);
      const hasLop =
        deptSettings?.payroll &&
        typeof deptSettings.payroll.lopDaysPerAbsent === 'number' &&
        deptSettings.payroll.lopDaysPerAbsent >= 0;
      if (hasEnable || hasLop) {
        return {
          enableAbsentDeduction: hasEnable
            ? deptSettings.payroll.enableAbsentDeduction
            : defaults.enableAbsentDeduction,
          lopDaysPerAbsent: hasLop
            ? deptSettings.payroll.lopDaysPerAbsent
            : defaults.lopDaysPerAbsent,
        };
      }
    }

    // Global fallback
    const enableGlobal = await Settings.findOne({ key: 'enable_absent_deduction' });
    const lopGlobal = await Settings.findOne({ key: 'lop_days_per_absent' });
    const enableAbsentDeduction =
      enableGlobal && enableGlobal.value !== undefined
        ? !!enableGlobal.value
        : defaults.enableAbsentDeduction;
    const lopDaysPerAbsent =
      lopGlobal && typeof lopGlobal.value === 'number' && lopGlobal.value >= 0
        ? lopGlobal.value
        : defaults.lopDaysPerAbsent;

    return { enableAbsentDeduction, lopDaysPerAbsent };
  } catch (e) {
    console.error('Error determining absent deduction settings:', e);
    return defaults;
  }
}

/**
 * Merge a base list with employee overrides.
 * - When includeMissing is true (default): Includes all base items, with employee overrides taking precedence
 * - When includeMissing is false: Only includes items that have employee overrides
 * - Employee overrides can match base items by either masterId or name (case-insensitive)
 * - Preserves all properties from base items while applying override values
 */
function mergeWithOverrides(baseList = [], overrides = [], includeMissing = true) {
  // If no overrides, return base list or empty array based on includeMissing
  if (!overrides || overrides.length === 0) {
    return includeMissing ? [...baseList] : [];
  }

  // Create maps for quick lookup of base items by ID and name
  const baseMap = new Map();
  const baseNameMap = new Map();

  // Track which base items have been overridden
  const overriddenBaseItems = new Set();

  // Index base items
  baseList.forEach((item, index) => {
    const masterIdKey = item.masterId ? item.masterId.toString() : null;
    const nameKey = item.name ? item.name.trim().toLowerCase() : null;

    if (masterIdKey) {
      baseMap.set(`id_${masterIdKey}`, { ...item, _index: index });
    }
    if (nameKey) {
      baseNameMap.set(`name_${nameKey}`, { ...item, _index: index });
    }
  });

  const result = [];
  const processedBaseIndices = new Set();
  const overrideIds = new Set();

  // Process overrides first
  overrides.forEach(override => {
    if (!override) return;

    const ovMasterIdKey = override.masterId ? `id_${override.masterId.toString()}` : null;
    const ovNameKey = override.name ? `name_${override.name.trim().toLowerCase()}` : null;

    // Find matching base item
    let baseItem = null;
    let baseItemIndex = -1;

    // Try to find by masterId first
    if (ovMasterIdKey && baseMap.has(ovMasterIdKey)) {
      const match = baseMap.get(ovMasterIdKey);
      baseItem = match;
      baseItemIndex = match._index;
    }
    // Then try by name if no match by ID
    else if (ovNameKey && baseNameMap.has(ovNameKey)) {
      const match = baseNameMap.get(ovNameKey);
      baseItem = match;
      baseItemIndex = match._index;
    }

    // Mark base item as overridden if found
    if (baseItemIndex >= 0) {
      overriddenBaseItems.add(baseItemIndex);
    }

    // Create merged item
    const merged = {
      ...(baseItem || {}), // Start with base item properties if exists
      ...override,         // Apply override properties
      amount: override.amount !== undefined ? override.amount :
        (override.overrideAmount !== undefined ? override.overrideAmount :
          (baseItem ? baseItem.amount : 0)),
      isEmployeeOverride: true
    };

    // Ensure we have required fields
    if (!merged.masterId && baseItem?.masterId) {
      merged.masterId = baseItem.masterId;
    }
    if (!merged.name && baseItem?.name) {
      merged.name = baseItem.name;
    }

    // Track this override to avoid duplicates
    const overrideKey = merged.masterId ? `id_${merged.masterId}` : `name_${merged.name?.toLowerCase()}`;
    if (!overrideIds.has(overrideKey)) {
      result.push(merged);
      overrideIds.add(overrideKey);
    }
  });

  // Add non-overridden base items if includeMissing is true
  if (includeMissing) {
    baseList.forEach((item, index) => {
      if (!overriddenBaseItems.has(index)) {
        // Only add if not already in result (to prevent duplicates)
        const itemKey = item.masterId ? `id_${item.masterId}` : `name_${item.name?.toLowerCase()}`;
        if (!overrideIds.has(itemKey)) {
          result.push({
            ...item,
            isEmployeeOverride: false
          });
        }
      }
    });
  }

  return result;
}

/**
 * Build base (dept/global) allowances and deductions for a given salary context.
 */
async function buildBaseComponents(departmentId, grossSalary, attendanceData = null) {
  const basicPay = grossSalary || 0;

  // Allowances: two passes (basic-based and gross-based), mirroring payroll
  const allowancesBasic = await allowanceService.calculateAllowances(departmentId, basicPay, null, false, attendanceData);
  const allowancesGross = await allowanceService.calculateAllowances(departmentId, basicPay, grossSalary, true, attendanceData);
  const allowances = [...allowancesBasic, ...allowancesGross];

  // Deductions
  const deductions = await deductionService.calculateOtherDeductions(
    departmentId ? departmentId.toString() : null,
    basicPay,
    grossSalary,
    attendanceData
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
  getAbsentDeductionSettings,
};

