/**
 * getMergedOtConfig: global + department OT merge (especially otHourRanges inheritance).
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

const GLOBAL_RANGES = [
  { minMinutes: 30, maxMinutes: 60, creditedMinutes: 60, label: 'global slab' },
];

const DEPT_RANGES = [
  { minMinutes: 0, maxMinutes: 45, creditedMinutes: 45, label: 'dept slab' },
];

const DEPT_ID = '507f1f77bcf86cd799439011';
const DIV_ID = '507f1f77bcf86cd799439012';

function mockSettingsLeanNull() {
  Settings.findOne.mockImplementation(() => ({
    lean: jest.fn().mockResolvedValue(null),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSettingsLeanNull();
  DivisionWorkflowSettings.findOne.mockReturnValue({
    lean: jest.fn().mockResolvedValue(null),
  });
  OvertimeSettings.getActiveSettings.mockResolvedValue({
    payPerHour: 100,
    multiplier: 1.5,
    minOTHours: 0,
    roundingMinutes: 15,
    recognitionMode: 'none',
    thresholdHours: null,
    roundUpIfFractionMinutesGte: null,
    otHourRanges: GLOBAL_RANGES,
    autoCreateOtRequest: false,
    defaultWorkingHoursPerDay: 8,
    allowBackdated: false,
    maxBackdatedDays: 0,
    allowFutureDated: true,
    maxAdvanceDays: 365,
    workflow: { steps: [], finalAuthority: { role: 'hr', anyHRCanApprove: false } },
  });
});

describe('getMergedOtConfig', () => {
  describe('otHourRanges', () => {
    it('inherits global slabs when department has empty otHourRanges []', async () => {
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
        ot: { otHourRanges: [] },
      });
      const merged = await getMergedOtConfig(DEPT_ID, null);
      expect(merged.otHourRanges).toEqual(GLOBAL_RANGES);
      expect(merged.otHourRanges).not.toEqual([]);
    });

    it('uses department slabs when department defines at least one range', async () => {
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
        ot: { otHourRanges: DEPT_RANGES },
      });
      const merged = await getMergedOtConfig(DEPT_ID, null);
      expect(merged.otHourRanges).toEqual(DEPT_RANGES);
      expect(merged.otHourRanges[0].label).toBe('dept slab');
    });

    it('inherits global when department ot has no otHourRanges key', async () => {
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
        ot: { minOTHours: 1 },
      });
      const merged = await getMergedOtConfig(DEPT_ID, null);
      expect(merged.otHourRanges).toEqual(GLOBAL_RANGES);
    });

    it('returns [] when neither global nor department has non-empty ranges', async () => {
      OvertimeSettings.getActiveSettings.mockResolvedValue({
        payPerHour: 0,
        multiplier: 1.5,
        minOTHours: 0,
        roundingMinutes: 15,
        recognitionMode: 'none',
        otHourRanges: [],
        autoCreateOtRequest: false,
        defaultWorkingHoursPerDay: 8,
        allowBackdated: false,
        maxBackdatedDays: 0,
        allowFutureDated: true,
        maxAdvanceDays: 365,
        workflow: { steps: [], finalAuthority: { role: 'hr', anyHRCanApprove: false } },
      });
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
        ot: { otHourRanges: [] },
      });
      const merged = await getMergedOtConfig(DEPT_ID, null);
      expect(merged.otHourRanges).toEqual([]);
    });

    it('skips department fetch and uses global when departmentId is null', async () => {
      const merged = await getMergedOtConfig(null, null);
      expect(DepartmentSettings.getByDeptAndDiv).not.toHaveBeenCalled();
      expect(merged.otHourRanges).toEqual(GLOBAL_RANGES);
    });
  });

  describe('workflow', () => {
    it('always uses organization workflow; ignores department ot.workflow', async () => {
      const globalWf = { steps: [{ role: 'manager' }], finalAuthority: { role: 'hr', anyHRCanApprove: true } };
      OvertimeSettings.getActiveSettings.mockResolvedValue({
        payPerHour: 100,
        multiplier: 1.5,
        minOTHours: 0,
        roundingMinutes: 15,
        recognitionMode: 'none',
        thresholdHours: null,
        roundUpIfFractionMinutesGte: null,
        otHourRanges: GLOBAL_RANGES,
        autoCreateOtRequest: false,
        defaultWorkingHoursPerDay: 8,
        allowBackdated: false,
        maxBackdatedDays: 0,
        allowFutureDated: true,
        maxAdvanceDays: 365,
        workflow: globalWf,
      });
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue({
        ot: {
          otHourRanges: DEPT_RANGES,
          workflow: { steps: [{ role: 'wrong' }], finalAuthority: { role: 'admin', anyHRCanApprove: false } },
        },
      });
      const merged = await getMergedOtConfig(DEPT_ID, null);
      expect(merged.workflow).toEqual(globalWf);
    });

    it('merges division workflow override on top of global', async () => {
      const globalWf = { steps: [{ stepOrder: 1 }], finalAuthority: { role: 'hr', anyHRCanApprove: true } };
      OvertimeSettings.getActiveSettings.mockResolvedValue({
        payPerHour: 100,
        multiplier: 1.5,
        minOTHours: 0,
        roundingMinutes: 15,
        recognitionMode: 'none',
        thresholdHours: null,
        roundUpIfFractionMinutesGte: null,
        otHourRanges: GLOBAL_RANGES,
        autoCreateOtRequest: false,
        defaultWorkingHoursPerDay: 8,
        allowBackdated: false,
        maxBackdatedDays: 0,
        allowFutureDated: true,
        maxAdvanceDays: 365,
        workflow: globalWf,
      });
      DepartmentSettings.getByDeptAndDiv.mockResolvedValue({ ot: {} });
      DivisionWorkflowSettings.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          workflows: {
            ot: { steps: [{ stepOrder: 1, approverRole: 'hod' }], allowHigherAuthorityToApproveLowerLevels: true },
          },
        }),
      });
      const merged = await getMergedOtConfig(DEPT_ID, DIV_ID);
      expect(merged.workflow.steps).toEqual([{ stepOrder: 1, approverRole: 'hod' }]);
      expect(merged.workflow.allowHigherAuthorityToApproveLowerLevels).toBe(true);
    });
  });
});
