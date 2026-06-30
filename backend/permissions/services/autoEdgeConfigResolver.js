const AutoEdgePermissionSettings = require('../model/AutoEdgePermissionSettings');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');

function hasValidScopeId(id) {
  if (id == null || id === '') return false;
  const s = String(id);
  return /^[a-fA-F0-9]{24}$/.test(s);
}

function toPlain(doc) {
  if (!doc) return null;
  return typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

function pickNullable(deptVal, globalVal, fallback) {
  if (deptVal !== undefined && deptVal !== null) return deptVal;
  if (globalVal !== undefined && globalVal !== null) return globalVal;
  return fallback;
}

function pickBool(deptVal, globalVal, fallback = false) {
  if (deptVal !== undefined && deptVal !== null) return Boolean(deptVal);
  if (globalVal !== undefined && globalVal !== null) return Boolean(globalVal);
  return Boolean(fallback);
}

function pickRuleSet(deptRules, globalRules) {
  const deptRanges = deptRules?.shiftDurationRanges;
  if (Array.isArray(deptRanges) && deptRanges.length > 0) {
    return { shiftDurationRanges: deptRanges };
  }
  const globalRanges = globalRules?.shiftDurationRanges;
  if (Array.isArray(globalRanges) && globalRanges.length > 0) {
    return { shiftDurationRanges: globalRanges };
  }
  return { shiftDurationRanges: [] };
}

/**
 * Merge organization auto-edge settings with department / division overrides.
 * Nullable department fields inherit from global. Non-empty department range arrays replace global ranges.
 */
async function getMergedAutoEdgeConfig(departmentId = null, divisionId = null) {
  const globalDoc = await AutoEdgePermissionSettings.getActiveSettings();
  const g = toPlain(globalDoc) || {};

  let deptOverride = null;
  const hasDept = hasValidScopeId(departmentId);
  const hasDiv = hasValidScopeId(divisionId);
  if (hasDept || hasDiv) {
    const mergedDept = await DepartmentSettings.getByDeptAndDiv(hasDept ? departmentId : null, hasDiv ? divisionId : null);
    deptOverride = mergedDept?.permissions?.autoEdge || null;
  }
  const d = deptOverride || {};

  return {
    isEnabled: pickBool(d.isEnabled, g.isEnabled, false),
    applyFor: pickNullable(d.applyFor, g.applyFor, 'both'),
    useSameRulesForBoth: pickBool(d.useSameRulesForBoth, g.useSameRulesForBoth, true),
    lateInRules: pickRuleSet(d.lateInRules, g.lateInRules),
    earlyOutRules: pickRuleSet(d.earlyOutRules, g.earlyOutRules),
    _meta: {
      usedDepartmentOverride: Boolean(deptOverride),
      globalEnabled: Boolean(g.isEnabled),
    },
  };
}

module.exports = {
  getMergedAutoEdgeConfig,
};
