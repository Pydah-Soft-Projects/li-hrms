/**
 * Full matrix: org / department / division OT slabs × employee gender.
 * Mirrors production path: getMergedOtConfig → applyOtHoursPolicy(..., { employeeGender }).
 */

jest.mock('../../model/OvertimeSettings');
jest.mock('../../../departments/model/DepartmentSettings');
jest.mock('../../../departments/model/DivisionWorkflowSettings');
jest.mock('../../../settings/model/Settings');

const OvertimeSettings = require('../../model/OvertimeSettings');
const DepartmentSettings = require('../../../departments/model/DepartmentSettings');
const DivisionWorkflowSettings = require('../../../departments/model/DivisionWorkflowSettings');
const Settings = require('../../../settings/model/Settings');
const { getMergedOtConfig } = require('../otConfigResolver');
const { applyOtHoursPolicy } = require('../otHoursPolicyService');

const DEPT_ID = '507f1f77bcf86cd799439011';
const DIV_ID = '507f1f77bcf86cd799439012';

const ORG_RANGES = [
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 30, label: 'org-all', gender: 'All' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 60, label: 'org-female', gender: 'Female' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 45, label: 'org-male', gender: 'Male' },
];

const DEPT_RANGES = [
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 40, label: 'dept-all', gender: 'All' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 75, label: 'dept-female', gender: 'Female' },
];

const DIV_RANGES = [
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 50, label: 'div-all', gender: 'All' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 90, label: 'div-male', gender: 'Male' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 80, label: 'div-other', gender: 'Other' },
];

const DEPT_DIV_RANGES = [
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 55, label: 'deptdiv-all', gender: 'All' },
  { minMinutes: 30, maxMinutes: 90, creditedMinutes: 100, label: 'deptdiv-female', gender: 'Female' },
];

function mockSettingsLeanNull() {
  Settings.findOne.mockImplementation(() => ({
    lean: jest.fn().mockResolvedValue(null),
  }));
}

function baseGlobal(ranges = ORG_RANGES) {
  return {
    payPerHour: 100,
    multiplier: 1.5,
    minOTHours: 0,
    roundingMinutes: 15,
    recognitionMode: 'none',
    thresholdHours: null,
    roundUpIfFractionMinutesGte: null,
    otHourRanges: ranges,
    autoCreateOtRequest: true,
    defaultWorkingHoursPerDay: 8,
    allowBackdated: false,
    maxBackdatedDays: 0,
    allowFutureDated: true,
    maxAdvanceDays: 365,
    workflow: { steps: [], finalAuthority: { role: 'hr', anyHRCanApprove: false } },
  };
}

async function finalOtHours(rawHours, { departmentId, divisionId, deptOt }, gender) {
  DepartmentSettings.getByDeptAndDiv.mockResolvedValue(
    deptOt ? { ot: deptOt } : null
  );
  const merged = await getMergedOtConfig(departmentId, divisionId);
  return applyOtHoursPolicy(rawHours, merged, { employeeGender: gender });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSettingsLeanNull();
  DivisionWorkflowSettings.findOne.mockReturnValue({
    lean: jest.fn().mockResolvedValue(null),
  });
  OvertimeSettings.getActiveSettings.mockResolvedValue(baseGlobal());
});

describe('OT gender × scope matrix', () => {
  const RAW = 1; // 60 minutes → inside 30–90 slabs

  describe('ORG only (no dept/div override)', () => {
    it.each([
      ['Female', 1, 'org-female'],
      ['Male', 0.75, 'org-male'],
      ['Other', 0.5, 'org-all'],
      [null, 0.5, 'org-all'],
    ])('employee %s → %s h from %s', async (gender, hours, label) => {
      const r = await finalOtHours(RAW, { departmentId: null, divisionId: null, deptOt: null }, gender);
      expect(r.eligible).toBe(true);
      expect(r.finalHours).toBe(hours);
      expect(r.matchedRange.label).toBe(label);
    });
  });

  describe('DEPARTMENT + gender (replaces org slabs)', () => {
    it('Female uses dept Female slab (not org Female)', async () => {
      const r = await finalOtHours(
        RAW,
        { departmentId: DEPT_ID, divisionId: null, deptOt: { otHourRanges: DEPT_RANGES } },
        'Female'
      );
      expect(r.finalHours).toBe(1.25);
      expect(r.matchedRange.label).toBe('dept-female');
    });

    it('Male falls back to dept All (dept has no Male slab)', async () => {
      const r = await finalOtHours(
        RAW,
        { departmentId: DEPT_ID, divisionId: null, deptOt: { otHourRanges: DEPT_RANGES } },
        'Male'
      );
      expect(r.finalHours).toBe(0.67);
      expect(r.matchedRange.label).toBe('dept-all');
    });

    it('empty dept ranges inherit org gender slabs', async () => {
      const r = await finalOtHours(
        RAW,
        { departmentId: DEPT_ID, divisionId: null, deptOt: { otHourRanges: [] } },
        'Female'
      );
      expect(r.matchedRange.label).toBe('org-female');
      expect(r.finalHours).toBe(1);
    });
  });

  describe('DIVISION-wide + gender (via getByDeptAndDiv result)', () => {
    it('Male uses division Male slab', async () => {
      // Resolver sees whatever getByDeptAndDiv already merged for the division
      const r = await finalOtHours(
        RAW,
        { departmentId: DEPT_ID, divisionId: DIV_ID, deptOt: { otHourRanges: DIV_RANGES } },
        'Male'
      );
      expect(r.finalHours).toBe(1.5);
      expect(r.matchedRange.label).toBe('div-male');
    });

    it('Female uses division All when no Female slab on division', async () => {
      const r = await finalOtHours(
        RAW,
        { departmentId: DEPT_ID, divisionId: DIV_ID, deptOt: { otHourRanges: DIV_RANGES } },
        'Female'
      );
      expect(r.finalHours).toBe(0.83);
      expect(r.matchedRange.label).toBe('div-all');
    });

    it('Other uses division Other slab', async () => {
      const r = await finalOtHours(
        RAW,
        { departmentId: null, divisionId: DIV_ID, deptOt: { otHourRanges: DIV_RANGES } },
        'Other'
      );
      expect(r.finalHours).toBe(1.33);
      expect(r.matchedRange.label).toBe('div-other');
    });
  });

  describe('DEPARTMENT+DIVISION row + gender (wins over org)', () => {
    it('Female uses dept+div Female slab', async () => {
      const r = await finalOtHours(
        RAW,
        { departmentId: DEPT_ID, divisionId: DIV_ID, deptOt: { otHourRanges: DEPT_DIV_RANGES } },
        'Female'
      );
      expect(r.finalHours).toBe(1.67);
      expect(r.matchedRange.label).toBe('deptdiv-female');
    });

    it('Male uses dept+div All', async () => {
      const r = await finalOtHours(
        RAW,
        { departmentId: DEPT_ID, divisionId: DIV_ID, deptOt: { otHourRanges: DEPT_DIV_RANGES } },
        'Male'
      );
      expect(r.finalHours).toBe(0.92);
      expect(r.matchedRange.label).toBe('deptdiv-all');
    });
  });

  describe('gender-only slabs with no All fallback', () => {
    it('Male with only Female org slabs → not eligible', async () => {
      OvertimeSettings.getActiveSettings.mockResolvedValue(
        baseGlobal([{ minMinutes: 30, maxMinutes: 90, creditedMinutes: 60, gender: 'Female', label: 'f-only' }])
      );
      const r = await finalOtHours(RAW, { departmentId: null, divisionId: null, deptOt: null }, 'Male');
      expect(r.eligible).toBe(false);
      expect(r.finalHours).toBe(0);
    });
  });

  describe('autoCreate flag still independent of gender slabs', () => {
    it('dept can enable autoCreate while using org gender slabs', async () => {
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
        ot: { autoCreateOtRequest: true, otHourRanges: [] },
      });
      const merged = await getMergedOtConfig(DEPT_ID, null);
      expect(merged.autoCreateOtRequest).toBe(true);
      expect(merged.otHourRanges).toEqual(ORG_RANGES);
      const r = applyOtHoursPolicy(RAW, merged, { employeeGender: 'Male' });
      expect(r.matchedRange.label).toBe('org-male');
    });
  });
});
