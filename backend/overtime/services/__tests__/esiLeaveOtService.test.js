const mongoose = require('mongoose');

jest.mock('../../../leaves/model/Leave');
jest.mock('../../model/OT');
jest.mock('../../../employees/model/Employee');
jest.mock('../../../shifts/model/Shift');
jest.mock('../../../attendance/model/AttendanceDaily');
jest.mock('../otConfigResolver');
jest.mock('../../../users/model/User');

const Leave = require('../../../leaves/model/Leave');
const OT = require('../../model/OT');
const Employee = require('../../../employees/model/Employee');
const Shift = require('../../../shifts/model/Shift');
const AttendanceDaily = require('../../../attendance/model/AttendanceDaily');
const { getMergedOtConfig } = require('../otConfigResolver');
const User = require('../../../users/model/User');

const {
  isEsiLeaveType,
  sumPunchHours,
  syncEsiLeaveOtForLeave,
  upsertEsiOtForAttendanceDay,
} = require('../esiLeaveOtService');

function makeEmployee(empNo = 'E001') {
  const employee = {
    _id: new mongoose.Types.ObjectId(),
    emp_no: empNo,
    department_id: { _id: new mongoose.Types.ObjectId(), name: 'Dept' },
    division_id: { _id: new mongoose.Types.ObjectId(), name: 'Div' },
  };
  return employee;
}

function makeAttendance(date = '2026-04-10') {
  return {
    _id: new mongoose.Types.ObjectId(),
    employeeNumber: 'E001',
    date,
    shifts: [
      {
        shiftId: new mongoose.Types.ObjectId(),
        inTime: new Date(`${date}T09:00:00+05:30`),
        punchHours: 3.5,
      },
      {
        shiftId: new mongoose.Types.ObjectId(),
        inTime: new Date(`${date}T14:00:00+05:30`),
        punchHours: 4,
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getMergedOtConfig.mockResolvedValue({ workflow: { steps: [] } });
  User.findOne.mockImplementation(() => {
    const doc = { _id: new mongoose.Types.ObjectId() };
    return {
      select: jest.fn().mockResolvedValue(doc),
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(doc),
      }),
    };
  });
});

function mockShiftFindByIdWithEndTime(endTime = '18:00') {
  Shift.findById.mockImplementation(() => ({
    select: jest.fn().mockResolvedValue({ endTime }),
  }));
}

function mockEmployeeFindByIdWithDoc(employeeDoc) {
  Employee.findById.mockImplementation(() => {
    const queryLike = {
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(employeeDoc)),
      catch: () => queryLike,
    };
    return queryLike;
  });
}

describe('esiLeaveOtService helpers', () => {
  it('detects ESI leave type robustly', () => {
    expect(isEsiLeaveType('ESI')).toBe(true);
    expect(isEsiLeaveType(' esi ')).toBe(true);
    expect(isEsiLeaveType('SICK')).toBe(false);
  });

  it('sums punch hours from shift entries', () => {
    const att = makeAttendance();
    expect(sumPunchHours(att)).toBe(7.5);
  });
});

describe('upsertEsiOtForAttendanceDay', () => {
  it('updates existing OT when found', async () => {
    const leave = { isHalfDay: false };
    const employee = makeEmployee();
    const attendance = makeAttendance();
    const shiftId = attendance.shifts[0].shiftId;
    const existing = { save: jest.fn().mockResolvedValue(true) };
    OT.findOne.mockResolvedValue(existing);
    mockShiftFindByIdWithEndTime('18:00');

    const result = await upsertEsiOtForAttendanceDay({
      leave,
      employee,
      attendanceRecord: attendance,
      date: '2026-04-10',
      requestedByUserId: new mongoose.Types.ObjectId(),
      selectedOtHours: 6,
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('updated');
    expect(existing.otHours).toBe(6);
    expect(existing.save).toHaveBeenCalled();
  });

  it('creates OT when no existing record', async () => {
    const leave = { isHalfDay: true };
    const employee = makeEmployee();
    const attendance = makeAttendance();
    OT.findOne.mockResolvedValue(null);
    mockShiftFindByIdWithEndTime('18:00');
    OT.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

    const result = await upsertEsiOtForAttendanceDay({
      leave,
      employee,
      attendanceRecord: attendance,
      date: '2026-04-10',
      requestedByUserId: new mongoose.Types.ObjectId(),
      selectedOtHours: 2.5,
    });

    expect(result.success).toBe(true);
    expect(result.action).toBe('created');
    expect(OT.create).toHaveBeenCalled();
    const createArg = OT.create.mock.calls[0][0];
    expect(createArg.source).toBe('esi_leave_conversion');
    expect(createArg.otHours).toBe(2.5);
  });
});

describe('syncEsiLeaveOtForLeave', () => {
  it('skips half-day approved ESI auto conversion unless forced', async () => {
    const leave = {
      employeeId: new mongoose.Types.ObjectId(),
      emp_no: 'E001',
      leaveType: 'ESI',
      status: 'approved',
      isHalfDay: true,
      fromDate: new Date('2026-04-10T00:00:00+05:30'),
      toDate: new Date('2026-04-10T23:59:59+05:30'),
      isActive: true,
    };
    mockEmployeeFindByIdWithDoc(makeEmployee());
    AttendanceDaily.findOne.mockResolvedValue(makeAttendance('2026-04-10'));

    const result = await syncEsiLeaveOtForLeave(leave);
    expect(result.success).toBe(true);
    expect(result.results[0].reason).toBe('half_day_requires_manual_selection');
  });

  it('deactivates esi OT when leave is cancelled/rejected', async () => {
    const leave = {
      employeeId: new mongoose.Types.ObjectId(),
      emp_no: 'E001',
      leaveType: 'ESI',
      status: 'cancelled',
      isHalfDay: false,
      fromDate: new Date('2026-04-10T00:00:00+05:30'),
      toDate: new Date('2026-04-11T23:59:59+05:30'),
      isActive: true,
    };
    OT.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const result = await syncEsiLeaveOtForLeave(leave);
    expect(result.success).toBe(true);
    expect(result.action).toBe('deactivated');
    expect(OT.updateMany).toHaveBeenCalled();
  });
});
