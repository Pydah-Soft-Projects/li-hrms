/**
 * Verifies automatic pending-OT creation gating and happy path.
 * Runtime hook: extraHoursService.detectExtraHours → maybeAutoCreateOtFromAttendanceDay.
 */

const mongoose = require('mongoose');

jest.mock('../../../attendance/model/AttendanceDaily');
jest.mock('../../model/OT');
jest.mock('../../../shifts/model/Shift');
jest.mock('../../../employees/model/Employee');
jest.mock('../../../attendance/services/summaryCalculationService', () => ({
  calculateMonthlySummary: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../users/model/User');
jest.mock('../otConfigResolver');

const AttendanceDaily = require('../../../attendance/model/AttendanceDaily');
const OT = require('../../model/OT');
const Shift = require('../../../shifts/model/Shift');
const Employee = require('../../../employees/model/Employee');
const User = require('../../../users/model/User');
const { getMergedOtConfig } = require('../otConfigResolver');

const { maybeAutoCreateOtFromAttendanceDay, simulateOtHoursPolicy } = require('../otService');

const eligibleMerged = {
  autoCreateOtRequest: true,
  recognitionMode: 'none',
  thresholdHours: null,
  minOTHours: 0,
  roundingMinutes: null,
  roundUpIfFractionMinutesGte: null,
  otHourRanges: [],
  workflow: { steps: [], finalAuthority: { role: 'hr', anyHRCanApprove: false } },
};

function makeEmployee() {
  const _id = new mongoose.Types.ObjectId();
  const department_id = new mongoose.Types.ObjectId();
  const division_id = new mongoose.Types.ObjectId();
  const populated = {
    _id,
    emp_no: 'E001',
    department_id: { _id: department_id, name: 'Dept' },
    division_id: { _id: division_id, name: 'Div' },
    populate: jest.fn().mockResolvedValue(null),
  };
  populated.populate.mockResolvedValue(populated);
  return populated;
}

function makeAttendance(empNo, date, extraHours, shiftId) {
  return {
    _id: new mongoose.Types.ObjectId(),
    employeeNumber: empNo.toUpperCase(),
    date,
    extraHours,
    shiftId,
    shifts: shiftId
      ? [{ shiftId, extraHours }]
      : extraHours > 0
        ? [{ extraHours }]
        : [],
    inTime: new Date(`${date}T09:00:00+05:30`),
    isEdited: false,
    editHistory: [],
    save: jest.fn().mockResolvedValue(true),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getMergedOtConfig.mockResolvedValue(eligibleMerged);
  Shift.findById.mockResolvedValue({ endTime: '18:00' });
  User.findOne.mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId() });
});

describe('maybeAutoCreateOtFromAttendanceDay', () => {
  it('skips when no active employee', async () => {
    Employee.findOne.mockResolvedValue(null);
    const r = await maybeAutoCreateOtFromAttendanceDay('E001', '2026-04-01');
    expect(r).toEqual({ skipped: true, reason: 'no_employee' });
  });

  it('skips when autoCreateOtRequest is off (merged OT config)', async () => {
    const emp = makeEmployee();
    Employee.findOne.mockResolvedValue(emp);
    getMergedOtConfig.mockResolvedValue({ ...eligibleMerged, autoCreateOtRequest: false });
    const r = await maybeAutoCreateOtFromAttendanceDay('E001', '2026-04-01');
    expect(r).toEqual({ skipped: true, reason: 'auto_disabled' });
  });

  it('skips when no extra hours on attendance', async () => {
    const emp = makeEmployee();
    Employee.findOne.mockResolvedValue(emp);
    AttendanceDaily.findOne.mockResolvedValue(
      makeAttendance('E001', '2026-04-01', 0, new mongoose.Types.ObjectId())
    );
    const r = await maybeAutoCreateOtFromAttendanceDay('E001', '2026-04-01');
    expect(r).toEqual({ skipped: true, reason: 'no_extra' });
  });

  it('skips when shift missing on attendance', async () => {
    const emp = makeEmployee();
    Employee.findOne.mockResolvedValue(emp);
    const att = makeAttendance('E001', '2026-04-01', 1.5, null);
    att.shiftId = null;
    att.shifts = [{ extraHours: 1.5 }];
    AttendanceDaily.findOne.mockResolvedValue(att);
    const r = await maybeAutoCreateOtFromAttendanceDay('E001', '2026-04-01');
    expect(r).toEqual({ skipped: true, reason: 'no_shift' });
  });

  it('skips when pending/approved OT already exists', async () => {
    const emp = makeEmployee();
    Employee.findOne.mockResolvedValue(emp);
    AttendanceDaily.findOne.mockResolvedValue(
      makeAttendance('E001', '2026-04-01', 2, new mongoose.Types.ObjectId())
    );
    OT.findOne.mockResolvedValue({ _id: 'existing' });
    const r = await maybeAutoCreateOtFromAttendanceDay('E001', '2026-04-01');
    expect(r).toEqual({ skipped: true, reason: 'ot_exists' });
  });

  it('skips when no User for requestedBy and no super_admin fallback', async () => {
    const emp = makeEmployee();
    Employee.findOne.mockResolvedValue(emp);
    AttendanceDaily.findOne.mockResolvedValue(
      makeAttendance('E001', '2026-04-01', 2, new mongoose.Types.ObjectId())
    );
    OT.findOne.mockResolvedValue(null);
    User.findOne.mockReset();
    User.findOne.mockImplementation((q) => {
      if (q && q.role === 'super_admin') {
        return { sort: jest.fn().mockResolvedValue(null) };
      }
      return Promise.resolve(null);
    });
    const r = await maybeAutoCreateOtFromAttendanceDay('E001', '2026-04-01');
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('no_requester_user');
  });

  it('skips with convert_failed when policy rejects raw extra hours', async () => {
    const emp = makeEmployee();
    Employee.findOne.mockResolvedValue(emp);
    Employee.findById.mockImplementation((id) => {
      expect(id.toString()).toBe(emp._id.toString());
      return { ...emp, populate: emp.populate };
    });
    AttendanceDaily.findOne.mockResolvedValue(
      makeAttendance('E001', '2026-04-01', 0.5, new mongoose.Types.ObjectId())
    );
    OT.findOne.mockResolvedValue(null);
    let mergedCall = 0;
    getMergedOtConfig.mockImplementation(async () => {
      mergedCall += 1;
      if (mergedCall === 1) return eligibleMerged;
      return { ...eligibleMerged, minOTHours: 2 };
    });
    const r = await maybeAutoCreateOtFromAttendanceDay('E001', '2026-04-01');
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe('convert_failed');
    expect(r.message).toMatch(/do not qualify|OT rules/i);
  });

  it('creates pending OT when gates pass and policy is eligible', async () => {
    const emp = makeEmployee();
    Employee.findOne.mockResolvedValue(emp);
    Employee.findById.mockImplementation((id) => {
      expect(id.toString()).toBe(emp._id.toString());
      return { ...emp, populate: emp.populate };
    });
    const shiftId = new mongoose.Types.ObjectId();
    const att = makeAttendance('E001', '2026-04-01', 1.5, shiftId);
    att.shifts = [
      {
        shiftId,
        extraHours: 0.5,
        inTime: new Date('2026-04-01T09:05:00+05:30'),
        outTime: new Date('2026-04-01T18:20:00+05:30'),
      },
      {
        shiftId,
        extraHours: 1.0,
        inTime: new Date('2026-04-01T18:30:00+05:30'),
        outTime: new Date('2026-04-01T19:45:00+05:30'),
      },
    ];
    AttendanceDaily.findOne.mockResolvedValue(att);
    OT.findOne.mockResolvedValue(null);
    const created = {
      _id: new mongoose.Types.ObjectId(),
      status: 'pending',
      source: 'auto_detected',
      otHours: 1.5,
    };
    OT.create.mockResolvedValue(created);

    const r = await maybeAutoCreateOtFromAttendanceDay('e001', '2026-04-01');
    expect(r.skipped).toBe(false);
    expect(r.data).toBe(created);
    expect(OT.create).toHaveBeenCalled();
    const createArg = OT.create.mock.calls[0][0];
    expect(createArg.status).toBe('pending');
    expect(createArg.source).toBe('auto_detected');
    expect(createArg.convertedFromAttendance).toBe(true);
    expect(new Date(createArg.otInTime).toISOString()).toBe(new Date('2026-04-01T18:00:00+05:30').toISOString());
    expect(new Date(createArg.otOutTime).toISOString()).toBe(new Date('2026-04-01T19:45:00+05:30').toISOString());
  });
});

describe('simulateOtHoursPolicy (draft overrides)', () => {
  it('overlays policyDraft on merged config for the same raw hours', async () => {
    getMergedOtConfig.mockResolvedValue(eligibleMerged);
    const withDraft = await simulateOtHoursPolicy(0.5, null, null, { minOTHours: 1 });
    expect(withDraft.eligible).toBe(false);
    const noDraft = await simulateOtHoursPolicy(0.5, null, null, null);
    expect(noDraft.eligible).toBe(true);
  });
});
