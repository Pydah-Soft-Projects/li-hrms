/**
 * Full matrix: org / department / division auto-edge slabs × employee gender.
 * Path: getMergedAutoEdgeConfig → buildEligibleEdges / findMatchingRange.
 */

jest.mock('../model/AutoEdgePermissionSettings', () => ({
  getActiveSettings: jest.fn(),
}));

jest.mock('../../departments/model/DepartmentSettings', () => ({
  getByDeptAndDiv: jest.fn(),
}));

const AutoEdgePermissionSettings = require('../model/AutoEdgePermissionSettings');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const { getMergedAutoEdgeConfig } = require('../services/autoEdgeConfigResolver');
const {
  findMatchingRange,
  buildEligibleEdges,
} = require('../services/autoEdgePermissionCreationService');

const DEPT_ID = '507f1f77bcf86cd799439011';
const DIV_ID = '507f1f77bcf86cd799439012';

const ORG_LATE = [
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 20, minimumMinutes: 1, gender: 'All', description: 'org-all' },
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 45, minimumMinutes: 1, gender: 'Female', description: 'org-female' },
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 30, minimumMinutes: 1, gender: 'Male', description: 'org-male' },
];

const DEPT_LATE = [
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 25, minimumMinutes: 1, gender: 'All', description: 'dept-all' },
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 60, minimumMinutes: 1, gender: 'Female', description: 'dept-female' },
];

const DIV_LATE = [
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 35, minimumMinutes: 1, gender: 'All', description: 'div-all' },
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 50, minimumMinutes: 1, gender: 'Male', description: 'div-male' },
];

const DEPT_DIV_LATE = [
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 40, minimumMinutes: 1, gender: 'All', description: 'deptdiv-all' },
  { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 70, minimumMinutes: 1, gender: 'Female', description: 'deptdiv-female' },
];

function orgSettings(lateRanges = ORG_LATE) {
  return {
    isEnabled: true,
    applyFor: 'both',
    useSameRulesForBoth: false,
    lateInRules: { shiftDurationRanges: lateRanges },
    earlyOutRules: {
      shiftDurationRanges: [
        { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 15, minimumMinutes: 1, gender: 'All', description: 'org-eo-all' },
      ],
    },
  };
}

function attendanceWithLate(minutes = 25) {
  return {
    date: '2026-05-06',
    shifts: [
      {
        shiftNumber: 1,
        shiftName: 'Day',
        inTime: new Date('2026-05-06T09:25:00+05:30'),
        outTime: new Date('2026-05-06T18:00:00+05:30'),
        shiftStartTime: '09:00',
        shiftEndTime: '18:00',
        expectedHours: 9,
        lateInMinutes: minutes,
        earlyOutMinutes: 0,
      },
    ],
  };
}

async function mergeAndMatchLate(deptAutoEdge, gender, lateMinutes = 25) {
  AutoEdgePermissionSettings.getActiveSettings.mockResolvedValue(orgSettings());
  DepartmentSettings.getByDeptAndDiv.mockResolvedValue(
    deptAutoEdge ? { permissions: { autoEdge: deptAutoEdge } } : null
  );
  const merged = await getMergedAutoEdgeConfig(
    deptAutoEdge ? DEPT_ID : null,
    deptAutoEdge?.__div ? DIV_ID : null
  );
  const range = findMatchingRange(merged.lateInRules.shiftDurationRanges, 9, gender);
  const edges = buildEligibleEdges(attendanceWithLate(lateMinutes), merged, gender);
  return { merged, range, edges };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Auto-edge gender × scope matrix', () => {
  describe('ORG only', () => {
    it.each([
      ['Female', 'org-female', 45],
      ['Male', 'org-male', 30],
      ['Other', 'org-all', 20],
      [null, 'org-all', 20],
    ])('employee %s matches %s allowed=%s', async (gender, desc, allowed) => {
      AutoEdgePermissionSettings.getActiveSettings.mockResolvedValue(orgSettings());
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue(null);
      const merged = await getMergedAutoEdgeConfig(null, null);
      const range = findMatchingRange(merged.lateInRules.shiftDurationRanges, 9, gender);
      expect(range.description).toBe(desc);
      expect(range.allowedMinutes).toBe(allowed);
    });

    it('Female late 25 min is eligible under Female 45m slab', async () => {
      const { edges } = await mergeAndMatchLate(null, 'Female', 25);
      expect(edges).toHaveLength(1);
      expect(edges[0].allowedMinutes).toBe(45);
      expect(edges[0].permissionType).toBe('late_in');
    });

    it('Male late 25 min is eligible under Male 30m slab', async () => {
      const { edges } = await mergeAndMatchLate(null, 'Male', 25);
      expect(edges).toHaveLength(1);
      expect(edges[0].allowedMinutes).toBe(30);
    });

    it('Other late 25 min is NOT eligible under All 20m slab', async () => {
      const { edges } = await mergeAndMatchLate(null, 'Other', 25);
      expect(edges).toHaveLength(0);
    });
  });

  describe('DEPARTMENT + gender', () => {
    it('Female uses dept Female 60m (not org Female 45m)', async () => {
      const { range, edges } = await mergeAndMatchLate(
        { lateInRules: { shiftDurationRanges: DEPT_LATE } },
        'Female',
        50
      );
      expect(range.description).toBe('dept-female');
      expect(edges).toHaveLength(1);
      expect(edges[0].allowedMinutes).toBe(60);
    });

    it('Male falls back to dept All 25m', async () => {
      const { range, edges } = await mergeAndMatchLate(
        { lateInRules: { shiftDurationRanges: DEPT_LATE } },
        'Male',
        22
      );
      expect(range.description).toBe('dept-all');
      expect(edges).toHaveLength(1);
      expect(edges[0].allowedMinutes).toBe(25);
    });

    it('empty dept ranges inherit org gender slabs', async () => {
      AutoEdgePermissionSettings.getActiveSettings.mockResolvedValue(orgSettings());
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
        permissions: { autoEdge: { lateInRules: { shiftDurationRanges: [] } } },
      });
      const merged = await getMergedAutoEdgeConfig(DEPT_ID, null);
      const range = findMatchingRange(merged.lateInRules.shiftDurationRanges, 9, 'Female');
      expect(range.description).toBe('org-female');
    });

    it('department can disable auto-edge even when org enabled', async () => {
      AutoEdgePermissionSettings.getActiveSettings.mockResolvedValue(orgSettings());
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
        permissions: { autoEdge: { isEnabled: false, lateInRules: { shiftDurationRanges: DEPT_LATE } } },
      });
      const merged = await getMergedAutoEdgeConfig(DEPT_ID, null);
      expect(merged.isEnabled).toBe(false);
      const edges = buildEligibleEdges(attendanceWithLate(20), merged, 'Female');
      expect(edges).toHaveLength(0);
    });
  });

  describe('DIVISION + gender', () => {
    it('Male uses division Male 50m slab', async () => {
      const { range, edges } = await mergeAndMatchLate(
        { __div: true, lateInRules: { shiftDurationRanges: DIV_LATE } },
        'Male',
        40
      );
      expect(range.description).toBe('div-male');
      expect(edges).toHaveLength(1);
      expect(edges[0].allowedMinutes).toBe(50);
    });

    it('Female uses division All when no Female on division', async () => {
      const { range, edges } = await mergeAndMatchLate(
        { __div: true, lateInRules: { shiftDurationRanges: DIV_LATE } },
        'Female',
        30
      );
      expect(range.description).toBe('div-all');
      expect(edges).toHaveLength(1);
      expect(edges[0].allowedMinutes).toBe(35);
    });
  });

  describe('DEPARTMENT+DIVISION + gender', () => {
    it('Female uses dept+div Female 70m', async () => {
      const { range, edges } = await mergeAndMatchLate(
        { __div: true, lateInRules: { shiftDurationRanges: DEPT_DIV_LATE } },
        'Female',
        65
      );
      expect(range.description).toBe('deptdiv-female');
      expect(edges).toHaveLength(1);
      expect(edges[0].allowedMinutes).toBe(70);
    });

    it('Male uses dept+div All 40m', async () => {
      const { range, edges } = await mergeAndMatchLate(
        { __div: true, lateInRules: { shiftDurationRanges: DEPT_DIV_LATE } },
        'Male',
        35
      );
      expect(range.description).toBe('deptdiv-all');
      expect(edges).toHaveLength(1);
      expect(edges[0].allowedMinutes).toBe(40);
    });
  });

  describe('cross-gender isolation', () => {
    it('only Female slabs → Male gets no match', async () => {
      AutoEdgePermissionSettings.getActiveSettings.mockResolvedValue(
        orgSettings([
          { minShiftHours: 8, maxShiftHours: 10, allowedMinutes: 60, minimumMinutes: 1, gender: 'Female', description: 'f-only' },
        ])
      );
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue(null);
      const merged = await getMergedAutoEdgeConfig(null, null);
      expect(findMatchingRange(merged.lateInRules.shiftDurationRanges, 9, 'Male')).toBeNull();
      expect(buildEligibleEdges(attendanceWithLate(20), merged, 'Male')).toHaveLength(0);
    });
  });
});
