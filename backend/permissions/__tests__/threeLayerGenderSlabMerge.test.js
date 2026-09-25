/**
 * Three-layer DepartmentSettings merge for OT / autoEdge slabs (dept → division-wide → dept+div).
 * Confirms division gender slabs win over department; empty [] on a higher layer inherits org.
 */

function mergeObjectPreferSecond(base, incoming) {
  if (!incoming) return base ? { ...base } : null;
  if (!base) return { ...incoming };
  const out = { ...base };
  for (const k of Object.keys(incoming)) {
    const iv = incoming[k];
    if (iv === undefined) continue;
    const bv = out[k];
    if (iv !== null && typeof iv === 'object' && !Array.isArray(iv) && !(iv instanceof Date)) {
      out[k] = mergeObjectPreferSecond(
        bv && typeof bv === 'object' && !Array.isArray(bv) ? bv : {},
        iv
      );
    } else {
      out[k] = iv;
    }
  }
  return out;
}

function mergeSettingsThreeLayers(deptBasePlain, divWidePlain, deptDivPlain) {
  const keys = ['permissions', 'ot'];
  const out = {};
  for (const k of keys) {
    const merged = mergeObjectPreferSecond(
      mergeObjectPreferSecond(deptBasePlain?.[k] || {}, divWidePlain?.[k] || {}),
      deptDivPlain?.[k] || {}
    );
    if (merged && Object.keys(merged).length) out[k] = merged;
  }
  return Object.keys(out).length ? out : null;
}

/** Same inherit rule as otConfigResolver / autoEdgeConfigResolver */
function effectiveOtRanges(mergedDeptOt, orgRanges) {
  const d = mergedDeptOt || {};
  return Array.isArray(d.otHourRanges) && d.otHourRanges.length > 0
    ? d.otHourRanges
    : orgRanges;
}

function effectiveAutoEdgeRanges(mergedAutoEdge, orgRanges) {
  const deptRanges = mergedAutoEdge?.lateInRules?.shiftDurationRanges;
  if (Array.isArray(deptRanges) && deptRanges.length > 0) return deptRanges;
  return orgRanges;
}

const { applyOtHoursPolicy } = require('../../overtime/services/otHoursPolicyService');
const { findMatchingRange } = require('../services/autoEdgePermissionCreationService');

const ORG_OT = [
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 30, gender: 'All', label: 'org-all' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 60, gender: 'Female', label: 'org-female' },
];

const DEPT_OT = [
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 40, gender: 'All', label: 'dept-all' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 70, gender: 'Male', label: 'dept-male' },
];

const DIV_WIDE_OT = [
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 50, gender: 'All', label: 'divwide-all' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 90, gender: 'Female', label: 'divwide-female' },
];

const DEPT_DIV_OT = [
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 55, gender: 'All', label: 'deptdiv-all' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 100, gender: 'Male', label: 'deptdiv-male' },
];

const ORG_EDGE = [
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 20, gender: 'All', description: 'org-all' },
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 45, gender: 'Female', description: 'org-female' },
];

const DEPT_EDGE = [
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 25, gender: 'All', description: 'dept-all' },
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 35, gender: 'Male', description: 'dept-male' },
];

const DIV_WIDE_EDGE = [
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 30, gender: 'All', description: 'divwide-all' },
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 55, gender: 'Female', description: 'divwide-female' },
];

const DEPT_DIV_EDGE = [
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 40, gender: 'All', description: 'deptdiv-all' },
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 65, gender: 'Male', description: 'deptdiv-male' },
];

describe('three-layer merge × gender (dept → div-wide → dept+div)', () => {
  describe('OT slabs', () => {
    it('dept only: Male uses dept Male', () => {
      const merged = mergeSettingsThreeLayers({ ot: { otHourRanges: DEPT_OT } }, null, null);
      const ranges = effectiveOtRanges(merged.ot, ORG_OT);
      const r = applyOtHoursPolicy(1, { recognitionMode: 'none', minOTHours: 0, otHourRanges: ranges }, { employeeGender: 'Male' });
      expect(r.matchedRange.label).toBe('dept-male');
    });

    it('div-wide over dept: Female uses div-wide Female', () => {
      const merged = mergeSettingsThreeLayers(
        { ot: { otHourRanges: DEPT_OT } },
        { ot: { otHourRanges: DIV_WIDE_OT } },
        null
      );
      const ranges = effectiveOtRanges(merged.ot, ORG_OT);
      expect(ranges[0].label).toMatch(/^divwide/);
      const r = applyOtHoursPolicy(1, { recognitionMode: 'none', minOTHours: 0, otHourRanges: ranges }, { employeeGender: 'Female' });
      expect(r.matchedRange.label).toBe('divwide-female');
    });

    it('dept+div over div-wide: Male uses deptdiv Male', () => {
      const merged = mergeSettingsThreeLayers(
        { ot: { otHourRanges: DEPT_OT } },
        { ot: { otHourRanges: DIV_WIDE_OT } },
        { ot: { otHourRanges: DEPT_DIV_OT } }
      );
      const ranges = effectiveOtRanges(merged.ot, ORG_OT);
      const r = applyOtHoursPolicy(1, { recognitionMode: 'none', minOTHours: 0, otHourRanges: ranges }, { employeeGender: 'Male' });
      expect(r.matchedRange.label).toBe('deptdiv-male');
    });

    it('dept+div Female with no Female slab falls to deptdiv All', () => {
      const merged = mergeSettingsThreeLayers(
        { ot: { otHourRanges: DEPT_OT } },
        { ot: { otHourRanges: DIV_WIDE_OT } },
        { ot: { otHourRanges: DEPT_DIV_OT } }
      );
      const ranges = effectiveOtRanges(merged.ot, ORG_OT);
      const r = applyOtHoursPolicy(1, { recognitionMode: 'none', minOTHours: 0, otHourRanges: ranges }, { employeeGender: 'Female' });
      expect(r.matchedRange.label).toBe('deptdiv-all');
    });

    it('empty dept+div otHourRanges [] replaces prior layers → inherit org gender', () => {
      const merged = mergeSettingsThreeLayers(
        { ot: { otHourRanges: DEPT_OT } },
        { ot: { otHourRanges: DIV_WIDE_OT } },
        { ot: { otHourRanges: [] } }
      );
      expect(merged.ot.otHourRanges).toEqual([]);
      const ranges = effectiveOtRanges(merged.ot, ORG_OT);
      const r = applyOtHoursPolicy(1, { recognitionMode: 'none', minOTHours: 0, otHourRanges: ranges }, { employeeGender: 'Female' });
      expect(r.matchedRange.label).toBe('org-female');
    });
  });

  describe('Auto-edge slabs', () => {
    it('dept only: Male uses dept Male', () => {
      const merged = mergeSettingsThreeLayers(
        { permissions: { autoEdge: { lateInRules: { shiftDurationRanges: DEPT_EDGE } } } },
        null,
        null
      );
      const ranges = effectiveAutoEdgeRanges(merged.permissions.autoEdge, ORG_EDGE);
      const hit = findMatchingRange(ranges, 9, 'Male');
      expect(hit.description).toBe('dept-male');
    });

    it('div-wide over dept: Female uses div-wide Female', () => {
      const merged = mergeSettingsThreeLayers(
        { permissions: { autoEdge: { lateInRules: { shiftDurationRanges: DEPT_EDGE } } } },
        { permissions: { autoEdge: { lateInRules: { shiftDurationRanges: DIV_WIDE_EDGE } } } },
        null
      );
      const ranges = effectiveAutoEdgeRanges(merged.permissions.autoEdge, ORG_EDGE);
      const hit = findMatchingRange(ranges, 9, 'Female');
      expect(hit.description).toBe('divwide-female');
    });

    it('dept+div over both: Male uses deptdiv Male', () => {
      const merged = mergeSettingsThreeLayers(
        { permissions: { autoEdge: { lateInRules: { shiftDurationRanges: DEPT_EDGE } } } },
        { permissions: { autoEdge: { lateInRules: { shiftDurationRanges: DIV_WIDE_EDGE } } } },
        { permissions: { autoEdge: { lateInRules: { shiftDurationRanges: DEPT_DIV_EDGE } } } }
      );
      const ranges = effectiveAutoEdgeRanges(merged.permissions.autoEdge, ORG_EDGE);
      const hit = findMatchingRange(ranges, 9, 'Male');
      expect(hit.description).toBe('deptdiv-male');
    });

    it('dept+div Female without Female slab → deptdiv All', () => {
      const merged = mergeSettingsThreeLayers(
        { permissions: { autoEdge: { lateInRules: { shiftDurationRanges: DEPT_EDGE } } } },
        { permissions: { autoEdge: { lateInRules: { shiftDurationRanges: DIV_WIDE_EDGE } } } },
        { permissions: { autoEdge: { lateInRules: { shiftDurationRanges: DEPT_DIV_EDGE } } } }
      );
      const ranges = effectiveAutoEdgeRanges(merged.permissions.autoEdge, ORG_EDGE);
      const hit = findMatchingRange(ranges, 9, 'Female');
      expect(hit.description).toBe('deptdiv-all');
    });
  });
});
