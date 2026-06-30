jest.mock('../model/AutoEdgePermissionSettings', () => ({
  getActiveSettings: jest.fn(),
}));

jest.mock('../../departments/model/DepartmentSettings', () => ({
  getByDeptAndDiv: jest.fn(),
}));

const AutoEdgePermissionSettings = require('../model/AutoEdgePermissionSettings');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const { getMergedAutoEdgeConfig } = require('../services/autoEdgeConfigResolver');

const DEPT_ID = '507f1f77bcf86cd799439011';
const DIV_ID = '507f1f77bcf86cd799439012';

describe('autoEdgeConfigResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('inherits global settings when no department override', async () => {
    AutoEdgePermissionSettings.getActiveSettings.mockResolvedValue({
      isEnabled: true,
      applyFor: 'both',
      useSameRulesForBoth: true,
      lateInRules: { shiftDurationRanges: [{ minShiftHours: 8, maxShiftHours: 9, allowedMinutes: 60, minimumMinutes: 1 }] },
      earlyOutRules: { shiftDurationRanges: [] },
    });
    DepartmentSettings.getByDeptAndDiv.mockResolvedValue(null);

    const merged = await getMergedAutoEdgeConfig(DEPT_ID, DIV_ID);
    expect(merged.isEnabled).toBe(true);
    expect(merged.lateInRules.shiftDurationRanges).toHaveLength(1);
    expect(merged.lateInRules.shiftDurationRanges[0].allowedMinutes).toBe(60);
  });

  test('department can disable even when global enabled', async () => {
    AutoEdgePermissionSettings.getActiveSettings.mockResolvedValue({
      isEnabled: true,
      applyFor: 'both',
      useSameRulesForBoth: true,
      lateInRules: { shiftDurationRanges: [] },
      earlyOutRules: { shiftDurationRanges: [] },
    });
    DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
      permissions: { autoEdge: { isEnabled: false } },
    });

    const merged = await getMergedAutoEdgeConfig(DEPT_ID, null);
    expect(merged.isEnabled).toBe(false);
  });

  test('department ranges replace global ranges when non-empty', async () => {
    AutoEdgePermissionSettings.getActiveSettings.mockResolvedValue({
      isEnabled: true,
      applyFor: 'late_in',
      useSameRulesForBoth: true,
      lateInRules: { shiftDurationRanges: [{ minShiftHours: 8, maxShiftHours: 9, allowedMinutes: 60, minimumMinutes: 1 }] },
      earlyOutRules: { shiftDurationRanges: [] },
    });
    DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
      permissions: {
        autoEdge: {
          lateInRules: {
            shiftDurationRanges: [{ minShiftHours: 8, maxShiftHours: 12, allowedMinutes: 180, minimumMinutes: 5 }],
          },
        },
      },
    });

    const merged = await getMergedAutoEdgeConfig(DEPT_ID, DIV_ID);
    expect(merged.lateInRules.shiftDurationRanges[0].allowedMinutes).toBe(180);
    expect(merged.lateInRules.shiftDurationRanges[0].minimumMinutes).toBe(5);
  });
});
