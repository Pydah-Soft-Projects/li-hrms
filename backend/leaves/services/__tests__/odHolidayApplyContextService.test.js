/**
 * Unit tests for punch-based HOL/WO OD suggestion (no DB).
 */
jest.mock('../../../attendance/model/AttendanceDaily', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../../shifts/model/PreScheduledShift', () => ({
  findOne: jest.fn(),
}));

const AttendanceDaily = require('../../../attendance/model/AttendanceDaily');
const PreScheduledShift = require('../../../shifts/model/PreScheduledShift');
const {
  getPunchBasedOdSuggestionForRecord,
  FULL_DAY_HOURS_THRESHOLD,
  MIN_HOURS_FOR_PUNCH_CONTEXT,
  resolveOdApplyAgainstHolidayPunchContext,
} = require('../odHolidayApplyContextService');

beforeEach(() => {
  AttendanceDaily.findOne.mockReset();
  PreScheduledShift.findOne.mockReset();
  PreScheduledShift.findOne.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue({ status: 'WO' }),
  });
  AttendanceDaily.findOne.mockReturnValue({
    lean: jest.fn().mockResolvedValue({
      totalWorkingHours: 3.5,
      shifts: [
        { status: 'PRESENT', inTime: new Date('2026-01-15T09:00:00+05:30'), outTime: new Date('2026-01-15T13:00:00+05:30') },
      ],
    }),
  });
});

describe('odHolidayApplyContextService.getPunchBasedOdSuggestionForRecord', () => {
  it('returns no punches when record is null', () => {
    const r = getPunchBasedOdSuggestionForRecord(null);
    expect(r.hasPunches).toBe(false);
    expect(r.suggestedOdTypeExtended).toBeNull();
    expect(r.punchContextDetail).toBe('no_attendance_daily');
  });

  it('returns no punches when hours below minimum', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: MIN_HOURS_FOR_PUNCH_CONTEXT - 0.1,
      shifts: [{ status: 'PRESENT', inTime: new Date() }],
    });
    expect(r.hasPunches).toBe(false);
    expect(r.punchContextDetail).toBe('insufficient_punches');
  });

  it('returns no punches when only absent segments', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: 4,
      shifts: [{ status: 'ABSENT' }],
    });
    expect(r.hasPunches).toBe(false);
    expect(r.punchContextDetail).toBe('absent_segments_only');
  });

  it('suggests half_day when one segment is worked and another is absent', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: 5,
      shifts: [
        { status: 'PRESENT', inTime: new Date('2026-01-15T09:00:00+05:30') },
        { status: 'ABSENT' },
      ],
    });
    expect(r.hasPunches).toBe(true);
    expect(r.suggestedOdTypeExtended).toBe('half_day');
    expect(r.punchContextDetail).toBe('mixed_work_with_absent_segment');
  });

  it('suggests half_day when any shift is HALF_DAY', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: 8,
      shifts: [
        { status: 'PRESENT', inTime: new Date() },
        { status: 'HALF_DAY', inTime: new Date() },
      ],
    });
    expect(r.hasPunches).toBe(true);
    expect(r.suggestedOdTypeExtended).toBe('half_day');
    expect(r.punchContextDetail).toBe('shift_segment_half_day');
  });

  it('suggests full_day when hours >= threshold and no half segment', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: FULL_DAY_HOURS_THRESHOLD,
      shifts: [{ status: 'PRESENT', inTime: new Date(), outTime: new Date() }],
    });
    expect(r.hasPunches).toBe(true);
    expect(r.suggestedOdTypeExtended).toBe('full_day');
  });

  it('suggests half_day when hours between min and full threshold', () => {
    const r = getPunchBasedOdSuggestionForRecord({
      totalWorkingHours: 3,
      shifts: [{ status: 'PRESENT', inTime: new Date() }],
    });
    expect(r.hasPunches).toBe(true);
    expect(r.suggestedOdTypeExtended).toBe('half_day');
    expect(r.punchContextDetail).toBe('hours_between_min_and_full_threshold');
  });
});

describe('resolveOdApplyAgainstHolidayPunchContext', () => {
  it('narrows a full-day holiday/week-off OD to half-day when attendance punches indicate only partial work', async () => {
    AttendanceDaily.findOne.mockImplementationOnce(() => ({
      lean: jest.fn().mockResolvedValue({
        totalWorkingHours: 3.5,
        shifts: [
          { status: 'PRESENT', inTime: new Date('2026-01-15T09:00:00+05:30'), outTime: new Date('2026-01-15T13:00:00+05:30') },
        ],
      }),
    }));

    const result = await resolveOdApplyAgainstHolidayPunchContext('2146', '2026-01-15', {
      isHalfDay: false,
      odType_extended: 'full_day',
      numberOfDays: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.narrowed).toBe(true);
    expect(result.isHalfDay).toBe(true);
    expect(result.halfDayType).toBe('first_half');
    expect(result.odType_extended).toBe('half_day');
    expect(result.numberOfDays).toBe(0.5);
  });
});

describe('extractPunchTimingsFromRecord', () => {
  const { extractPunchTimingsFromRecord } = require('../../utils/holwoOdPunchResolver');

  it('returns null timings when record has no shifts', () => {
    expect(extractPunchTimingsFromRecord({ totalWorkingHours: 5, shifts: [] })).toEqual({
      odStartTime: null,
      odEndTime: null,
      durationHours: null,
    });
  });

  it('extracts first IN and last OUT in HH:MM IST', () => {
    const r = extractPunchTimingsFromRecord({
      totalWorkingHours: 5.5,
      shifts: [
        { inTime: new Date('2026-01-15T09:15:00+05:30'), outTime: new Date('2026-01-15T13:00:00+05:30') },
        { inTime: new Date('2026-01-15T14:00:00+05:30'), outTime: new Date('2026-01-15T17:45:00+05:30') },
      ],
    });
    expect(r.odStartTime).toBe('09:15');
    expect(r.odEndTime).toBe('17:45');
    expect(r.durationHours).toBe(5.5);
  });
});
