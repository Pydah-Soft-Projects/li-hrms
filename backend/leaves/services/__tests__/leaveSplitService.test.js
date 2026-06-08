const { createISTDate } = require('../../../shared/utils/dateUtils');
const { expandLeaveToDailySegments } = require('../../../shared/utils/leaveDayRangeUtils');

jest.mock('../../model/Leave');
jest.mock('../../model/LeaveSplit');
jest.mock('../../model/LeaveSettings');
jest.mock('../../../employees/model/Employee');
jest.mock('../leaveBalanceService', () => ({
  getFinancialYear: jest.fn().mockResolvedValue('2025-26'),
  getLeaveNature: jest.fn().mockResolvedValue('paid'),
  getCurrentLeaveBalance: jest.fn().mockResolvedValue({ balance: 100 }),
  updateMonthlyRecordOnLeaveAction: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../leaveRegisterYearMonthlyApplyService', () => ({
  syncStoredMonthApplyFieldsForEmployeeDate: jest.fn().mockResolvedValue(undefined),
  scheduleSyncMonthApply: jest.fn(),
}));

const Leave = require('../../model/Leave');
const LeaveSplit = require('../../model/LeaveSplit');
const LeaveSettings = require('../../model/LeaveSettings');
const Employee = require('../../../employees/model/Employee');
const {
  getDateRange,
  normalizeSplitDateStr,
  validateSplits,
  createSplits,
} = require('../leaveSplitService');

function buildMockLeave(overrides = {}) {
  return {
    _id: 'leave1',
    fromDate: createISTDate('2025-06-10', '00:00'),
    toDate: createISTDate('2025-06-12', '23:59'),
    isHalfDay: false,
    halfDayType: null,
    fromIsHalfDay: false,
    fromHalfDayType: null,
    toIsHalfDay: false,
    toHalfDayType: null,
    numberOfDays: 3,
    leaveType: 'CL',
    employeeId: { _id: 'emp1', emp_no: 'E001', allottedLeaves: 100 },
    save: jest.fn().mockResolvedValue(undefined),
    splitHistory: [],
    ...overrides,
  };
}

function mockLeaveLookup(leave) {
  Leave.findById.mockReturnValue({
    populate: jest.fn().mockResolvedValue(leave),
  });
}

function approvedSplit(date, leaveType = 'CL', extra = {}) {
  return {
    date,
    leaveType,
    status: 'approved',
    isHalfDay: false,
    halfDayType: null,
    ...extra,
  };
}

/** Reproduce the pre-fix local-time comparison (fails on UTC for range end dates). */
function legacyLocalDateMatch(segments, splitDateYmd) {
  return segments.some((od) => {
    const splitDate = new Date(splitDateYmd);
    splitDate.setHours(0, 0, 0, 0);
    const odDate = new Date(od.date);
    odDate.setHours(0, 0, 0, 0);
    return odDate.getTime() === splitDate.getTime();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  LeaveSettings.getActiveSettings = jest.fn().mockResolvedValue(null);
  Employee.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ emp_no: 'E001', allottedLeaves: 100 }),
  });
  LeaveSplit.find.mockResolvedValue([]);
  LeaveSplit.deleteMany.mockResolvedValue({});
  LeaveSplit.create.mockImplementation(async (doc) => ({ _id: `split-${doc.date}`, ...doc }));
});

describe('normalizeSplitDateStr', () => {
  it('passes through YYYY-MM-DD strings unchanged', () => {
    expect(normalizeSplitDateStr('2025-06-12')).toBe('2025-06-12');
    expect(normalizeSplitDateStr(' 2025-06-12 ')).toBe('2025-06-12');
  });

  it('converts IST midnight Date objects to IST calendar day', () => {
    const d = createISTDate('2025-06-12', '00:00');
    expect(normalizeSplitDateStr(d)).toBe('2025-06-12');
  });

  it('returns null for empty input', () => {
    expect(normalizeSplitDateStr(null)).toBeNull();
    expect(normalizeSplitDateStr('')).toBeNull();
  });
});

describe('getDateRange', () => {
  it('returns inclusive IST date strings for a multi-day leave', () => {
    const leave = buildMockLeave();
    const range = getDateRange(leave.fromDate, leave.toDate, leave.isHalfDay, leave.halfDayType, leave);
    expect(range.map((r) => r.dateStr)).toEqual(['2025-06-10', '2025-06-11', '2025-06-12']);
    expect(range.every((r) => !r.isHalfDay)).toBe(true);
  });

  it('marks boundary halves for multi-day leave with from/to half flags', () => {
    const leave = buildMockLeave({
      fromDate: createISTDate('2025-06-10', '00:00'),
      toDate: createISTDate('2025-06-12', '23:59'),
      fromIsHalfDay: true,
      toIsHalfDay: true,
      numberOfDays: 2,
    });
    const range = getDateRange(leave.fromDate, leave.toDate, leave.isHalfDay, leave.halfDayType, leave);
    expect(range).toHaveLength(3);
    expect(range[0]).toMatchObject({ dateStr: '2025-06-10', isHalfDay: true, halfDayType: 'second_half' });
    expect(range[1]).toMatchObject({ dateStr: '2025-06-11', isHalfDay: false });
    expect(range[2]).toMatchObject({ dateStr: '2025-06-12', isHalfDay: true, halfDayType: 'first_half' });
  });

  it('returns a single half-day segment for single-day half leave', () => {
    const leave = buildMockLeave({
      fromDate: createISTDate('2025-06-10', '00:00'),
      toDate: createISTDate('2025-06-10', '23:59'),
      isHalfDay: true,
      halfDayType: 'first_half',
      numberOfDays: 0.5,
    });
    const range = getDateRange(leave.fromDate, leave.toDate, leave.isHalfDay, leave.halfDayType, leave);
    expect(range).toHaveLength(1);
    expect(range[0]).toMatchObject({
      dateStr: '2025-06-10',
      isHalfDay: true,
      halfDayType: 'first_half',
      numberOfDays: 0.5,
    });
  });
});

describe('validateSplits — IST date range (timezone-robust)', () => {
  it('accepts all in-range YYYY-MM-DD splits for a 3-day leave', async () => {
    mockLeaveLookup(buildMockLeave());
    const splits = [
      approvedSplit('2025-06-10'),
      approvedSplit('2025-06-11'),
      approvedSplit('2025-06-12'),
    ];
    const result = await validateSplits('leave1', splits);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.totalSplitDays).toBe(3);
  });

  it('rejects a split outside the leave range', async () => {
    mockLeaveLookup(buildMockLeave());
    const result = await validateSplits('leave1', [approvedSplit('2025-06-13')]);
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('2025-06-13');
    expect(result.errors[0]).toContain('2025-06-10');
    expect(result.errors[0]).toContain('2025-06-12');
    expect(result.errors[0]).not.toMatch(/toISOString/);
  });

  it('uses IST dates in error messages, not UTC-shifted ISO strings', async () => {
    const leave = buildMockLeave({
      fromDate: createISTDate('2025-03-01', '00:00'),
      toDate: createISTDate('2025-03-03', '23:59'),
      numberOfDays: 3,
    });
    mockLeaveLookup(leave);
    const result = await validateSplits('leave1', [approvedSplit('2025-03-04')]);
    expect(result.errors[0]).toBe(
      'Split date 2025-03-04 is outside original leave range (2025-03-01 to 2025-03-03)'
    );
  });

  it('accepts boundary-half splits matching multi-day leave segments', async () => {
    const leave = buildMockLeave({
      fromDate: createISTDate('2025-06-10', '00:00'),
      toDate: createISTDate('2025-06-12', '23:59'),
      fromIsHalfDay: true,
      toIsHalfDay: true,
      numberOfDays: 2,
    });
    mockLeaveLookup(leave);
    const splits = [
      approvedSplit('2025-06-10', 'CL', { isHalfDay: true, halfDayType: 'second_half' }),
      approvedSplit('2025-06-11'),
      approvedSplit('2025-06-12', 'CL', { isHalfDay: true, halfDayType: 'first_half' }),
    ];
    const result = await validateSplits('leave1', splits);
    expect(result.isValid).toBe(true);
    expect(result.totalSplitDays).toBe(2);
  });

  it('warns when a required segment is missing from splits', async () => {
    mockLeaveLookup(buildMockLeave());
    const result = await validateSplits('leave1', [
      approvedSplit('2025-06-10'),
      approvedSplit('2025-06-11'),
    ]);
    expect(result.isValid).toBe(true);
    expect(result.warnings).toContain('Date 2025-06-12 is not covered in splits');
  });

  it('validates single half-day leave coverage', async () => {
    const leave = buildMockLeave({
      fromDate: createISTDate('2025-06-10', '00:00'),
      toDate: createISTDate('2025-06-10', '23:59'),
      isHalfDay: true,
      halfDayType: 'second_half',
      numberOfDays: 0.5,
    });
    mockLeaveLookup(leave);
    const ok = await validateSplits('leave1', [
      approvedSplit('2025-06-10', 'CL', { isHalfDay: true, halfDayType: 'second_half' }),
    ]);
    expect(ok.isValid).toBe(true);

    const missing = await validateSplits('leave1', [
      approvedSplit('2025-06-10', 'CL', { isHalfDay: true, halfDayType: 'first_half' }),
    ]);
    expect(missing.isValid).toBe(true);
    expect(missing.warnings).toContain('Original half-day is not covered in splits');
  });

  it('detects duplicate splits on the same date and half', async () => {
    mockLeaveLookup(buildMockLeave());
    const result = await validateSplits('leave1', [
      approvedSplit('2025-06-10'),
      approvedSplit('2025-06-10'),
    ]);
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('Duplicate split for 2025-06-10');
  });

  it('rejects when approved split days exceed original leave days', async () => {
    mockLeaveLookup(buildMockLeave({ numberOfDays: 2 }));
    const result = await validateSplits('leave1', [
      approvedSplit('2025-06-10'),
      approvedSplit('2025-06-11'),
      approvedSplit('2025-06-12'),
    ]);
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('Total approved split days (3) exceeds original leave days (2)');
  });

  it('returns not found when leave does not exist', async () => {
    Leave.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });
    const result = await validateSplits('missing', [approvedSplit('2025-06-10')]);
    expect(result.isValid).toBe(false);
    expect(result.errors).toEqual(['Leave not found']);
  });
});

describe('validateSplits — last-day edge case vs legacy comparison', () => {
  const leaveDoc = {
    fromDate: createISTDate('2025-06-10', '00:00'),
    toDate: createISTDate('2025-06-12', '23:59'),
    isHalfDay: false,
  };
  const segments = expandLeaveToDailySegments(leaveDoc);
  const validDateStrs = new Set(segments.map((s) => s.dateStr));

  it('new IST string check accepts the last day of range', () => {
    expect(validDateStrs.has('2025-06-12')).toBe(true);
  });

  it('documents legacy local-time bug on UTC servers for range end date', () => {
    const prevTz = process.env.TZ;
    process.env.TZ = 'UTC';
    jest.resetModules();
    const { expandLeaveToDailySegments: expandFresh } = require('../../../shared/utils/leaveDayRangeUtils');
    const segs = expandFresh(leaveDoc);
    const legacyFailsLastDay = !legacyLocalDateMatch(segs, '2025-06-12');
    process.env.TZ = prevTz;
    expect(legacyFailsLastDay).toBe(true);
  });

  it('validateSplits accepts last day even when legacy comparison would fail on UTC', async () => {
    const prevTz = process.env.TZ;
    process.env.TZ = 'UTC';
    mockLeaveLookup(buildMockLeave());
    const result = await validateSplits('leave1', [approvedSplit('2025-06-12')]);
    process.env.TZ = prevTz;
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('createSplits — IST date persistence', () => {
  const approver = { _id: 'user1', name: 'HR User', role: 'hr' };

  it('stores split dates using parseCalendarDateAsIST (IST midnight)', async () => {
    const leave = buildMockLeave();
    mockLeaveLookup(leave);
    Leave.findById.mockImplementation((id) => {
      if (id === 'leave1') {
        return { populate: jest.fn().mockResolvedValue(leave) };
      }
      return { populate: jest.fn().mockResolvedValue(leave) };
    });

    const splits = [
      approvedSplit('2025-06-10'),
      approvedSplit('2025-06-11'),
      approvedSplit('2025-06-12'),
    ];
    const result = await createSplits('leave1', splits, approver);
    expect(result.success).toBe(true);
    expect(LeaveSplit.create).toHaveBeenCalledTimes(3);

    const createdDates = LeaveSplit.create.mock.calls.map((call) => call[0].date);
    expect(createdDates[0].toISOString()).toBe(createISTDate('2025-06-10', '00:00').toISOString());
    expect(createdDates[2].toISOString()).toBe(createISTDate('2025-06-12', '00:00').toISOString());
  });

  it('fails when validation fails (out-of-range date)', async () => {
    mockLeaveLookup(buildMockLeave());
    const result = await createSplits('leave1', [approvedSplit('2025-06-20')], approver);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('outside original leave range');
    expect(LeaveSplit.create).not.toHaveBeenCalled();
  });
});
