/**
 * Unit tests for regular OD duration classification + authority decision.
 * Simulates shift half-segments, 75%/40% ratios, shortfall, and attendance constraints.
 */
jest.mock('../../../shifts/model/PreScheduledShift', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../../attendance/model/AttendanceDaily', () => ({
  findOne: jest.fn(),
}));

const {
  FULL_DAY_RATIO,
  HALF_DAY_RATIO,
  parseEvidenceInstant,
  resolveEvidenceInstant,
  durationMinutesBetween,
  classifyOdDuration,
  resolveAuthorityOdDecision,
  applyClassificationToOd,
  classifyRegularOdFromEvidence,
} = require('../odDurationClassificationService');
const PreScheduledShift = require('../../../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../../../attendance/model/AttendanceDaily');

const shiftNoHalves = {
  startTime: '09:00',
  endTime: '17:00', // 480 min → full 360, half 192
};

const shiftWithHalves = {
  startTime: '09:00',
  endTime: '17:00',
  firstHalf: { startTime: '09:00', endTime: '13:00', minDuration: 3 }, // 180 min
  secondHalf: { startTime: '13:00', endTime: '17:00', minDuration: 3 },
};

describe('odDurationClassificationService — evidence time parsing', () => {
  it('parses EXIF DateTimeOriginal style strings', () => {
    const d = parseEvidenceInstant('2026:07:25 09:30:00');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(25);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  it('prefers EXIF over submittedAt', () => {
    const r = resolveEvidenceInstant({
      exifDateTime: '2026:07:25 09:00:00',
      submittedAt: '2026-07-25T10:00:00.000Z',
    });
    expect(r.source).toBe('exif');
    expect(r.instant.getHours()).toBe(9);
  });

  it('falls back to submittedAt when EXIF missing', () => {
    const r = resolveEvidenceInstant({
      submittedAt: '2026-07-25T09:15:00.000Z',
    });
    expect(r.source).toBe('submittedAt');
  });

  it('computes duration minutes between instants', () => {
    const a = new Date('2026-07-25T09:00:00+05:30');
    const b = new Date('2026-07-25T13:00:00+05:30');
    expect(durationMinutesBetween(a, b)).toBe(240);
  });
});

describe('odDurationClassificationService — classifyOdDuration (no halves, 75%/40%)', () => {
  it('classifies full day when duration ≥ 75% of shift', () => {
    // 480 * 0.75 = 360
    const r = classifyOdDuration({
      evidenceDurationMinutes: 360,
      shiftDoc: shiftNoHalves,
      startInstant: new Date('2026-07-25T09:00:00'),
      endInstant: new Date('2026-07-25T15:00:00'),
    });
    expect(r.classification).toBe('full_day');
    expect(r.isHalfDay).toBe(false);
    expect(r.requiresAuthorityDecision).toBe(false);
    expect(r.fullDayMinimumMinutes).toBe(Math.round(480 * FULL_DAY_RATIO));
  });

  it('classifies half day when duration ≥ 40% but < 75%', () => {
    // 480 * 0.4 = 192
    const r = classifyOdDuration({
      evidenceDurationMinutes: 200,
      shiftDoc: shiftNoHalves,
      startInstant: new Date('2026-07-25T09:10:00'),
      endInstant: new Date('2026-07-25T12:30:00'),
    });
    expect(r.classification).toBe('half_day');
    expect(r.isHalfDay).toBe(true);
    expect(r.halfDayType).toBe('first_half');
    expect(r.requiresAuthorityDecision).toBe(false);
    expect(r.halfDayMinimumMinutes).toBe(Math.round(480 * HALF_DAY_RATIO));
  });

  it('classifies shortfall when below half-day minimum', () => {
    const r = classifyOdDuration({
      evidenceDurationMinutes: 60,
      shiftDoc: shiftNoHalves,
      startInstant: new Date('2026-07-25T09:00:00'),
      endInstant: new Date('2026-07-25T10:00:00'),
    });
    expect(r.classification).toBe('shortfall');
    expect(r.tentative).toBe(true);
    expect(r.requiresAuthorityDecision).toBe(true);
    expect(r.odType_extended).toBe('half_day');
    expect(r.employeeMessage).toMatch(/below the half-day minimum/i);
  });

  it('forces authority path when skipReason is week_off', () => {
    const r = classifyOdDuration({
      evidenceDurationMinutes: 400,
      shiftDoc: shiftNoHalves,
      skipReason: 'week_off',
    });
    expect(r.classification).toBe('authority_required');
    expect(r.requiresAuthorityDecision).toBe(true);
    expect(r.reason).toBe('week_off');
  });
});

describe('odDurationClassificationService — half segments', () => {
  it('uses half segment minDuration for half threshold', () => {
    const r = classifyOdDuration({
      evidenceDurationMinutes: 180,
      shiftDoc: shiftWithHalves,
      startInstant: new Date('2026-07-25T09:00:00'),
      endInstant: new Date('2026-07-25T12:00:00'),
    });
    expect(r.usedHalfSegments).toBe(true);
    expect(r.halfDayMinimumMinutes).toBe(180);
    expect(r.classification).toBe('half_day');
  });

  it('full day when duration meets 75% even with halves configured', () => {
    const r = classifyOdDuration({
      evidenceDurationMinutes: 400,
      shiftDoc: shiftWithHalves,
      startInstant: new Date('2026-07-25T09:00:00'),
      endInstant: new Date('2026-07-25T16:00:00'),
    });
    expect(r.classification).toBe('full_day');
  });

  it('shortfall when below segment minDuration', () => {
    const r = classifyOdDuration({
      evidenceDurationMinutes: 90,
      shiftDoc: shiftWithHalves,
      startInstant: new Date('2026-07-25T09:00:00'),
      endInstant: new Date('2026-07-25T10:30:00'),
    });
    expect(r.classification).toBe('shortfall');
    expect(r.requiresAuthorityDecision).toBe(true);
  });
});

describe('odDurationClassificationService — classifyRegularOdFromEvidence (roster mock)', () => {
  beforeEach(() => {
    PreScheduledShift.findOne.mockReset();
    AttendanceDaily.findOne.mockReset();
  });

  it('skips classification when no roster row', async () => {
    PreScheduledShift.findOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    });
    const r = await classifyRegularOdFromEvidence({
      empNo: 'E001',
      dateStr: '2026-07-25',
      startEvidence: { submittedAt: '2026-07-25T09:00:00+05:30' },
      endEvidence: { submittedAt: '2026-07-25T17:00:00+05:30' },
    });
    expect(r.requiresAuthorityDecision).toBe(true);
    expect(r.reason).toBe('no_roster');
  });

  it('skips classification on week off', async () => {
    PreScheduledShift.findOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ status: 'WO', shiftId: null }),
    });
    const r = await classifyRegularOdFromEvidence({
      empNo: 'E001',
      dateStr: '2026-07-25',
      startEvidence: { submittedAt: '2026-07-25T09:00:00+05:30' },
      endEvidence: { submittedAt: '2026-07-25T12:00:00+05:30' },
    });
    expect(r.reason).toBe('week_off');
    expect(r.requiresAuthorityDecision).toBe(true);
  });

  it('classifies full day from rostered shift without halves', async () => {
    PreScheduledShift.findOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        status: 'SHIFT',
        shiftId: shiftNoHalves,
      }),
    });
    const r = await classifyRegularOdFromEvidence({
      empNo: 'E001',
      dateStr: '2026-07-25',
      startEvidence: {
        exifDateTime: '2026:07:25 09:00:00',
        submittedAt: '2026-07-25T10:00:00+05:30',
      },
      endEvidence: {
        exifDateTime: '2026:07:25 16:00:00',
        submittedAt: '2026-07-25T17:00:00+05:30',
      },
    });
    expect(r.startTimeSource).toBe('exif');
    expect(r.endTimeSource).toBe('exif');
    expect(r.evidenceDurationMinutes).toBe(420);
    expect(r.classification).toBe('full_day');
  });

  it('prioritizes attendance punches and requires authority decision when below half day threshold on week off', async () => {
    PreScheduledShift.findOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ status: 'WO', shiftId: null }),
    });
    // Worked 1 min (9:00 - 9:01)
    AttendanceDaily.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        employeeNumber: 'E001',
        date: '2026-07-25',
        inTime: '2026-07-25T09:00:00.000Z',
        outTime: '2026-07-25T09:01:00.000Z',
        totalWorkingHours: 0.0167,
        shifts: [
          {
            inTime: '2026-07-25T09:00:00.000Z',
            outTime: '2026-07-25T09:01:00.000Z',
            status: 'PARTIAL',
          }
        ]
      }),
    });

    const r = await classifyRegularOdFromEvidence({
      empNo: 'E001',
      dateStr: '2026-07-25',
      startEvidence: {},
      endEvidence: {},
    });

    expect(r.classification).toBe('authority_required');
    expect(r.requiresAuthorityDecision).toBe(true);
    expect(r.tentative).toBe(true);
    expect(r.reason).toBe('week_off');
  });

  it('prioritizes attendance punches and auto-classifies as half day without authority decision if meeting threshold on week off', async () => {
    PreScheduledShift.findOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ status: 'WO', shiftId: null }),
    });
    // Worked 2.5 hours (9:00 - 11:30)
    AttendanceDaily.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        employeeNumber: 'E001',
        date: '2026-07-25',
        inTime: '2026-07-25T09:00:00.000Z',
        outTime: '2026-07-25T11:30:00.000Z',
        totalWorkingHours: 2.5,
        shifts: [
          {
            inTime: '2026-07-25T09:00:00.000Z',
            outTime: '2026-07-25T11:30:00.000Z',
            status: 'PARTIAL',
          }
        ]
      }),
    });

    const r = await classifyRegularOdFromEvidence({
      empNo: 'E001',
      dateStr: '2026-07-25',
      startEvidence: {},
      endEvidence: {},
    });

    expect(r.classification).toBe('half_day');
    expect(r.requiresAuthorityDecision).toBe(false);
    expect(r.tentative).toBe(false);
    expect(r.reason).toBe('classified_from_attendance_punches');
  });

  it('prioritizes attendance punches and auto-classifies as full day if duration meets full day threshold on week off', async () => {
    PreScheduledShift.findOne.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ status: 'WO', shiftId: null }),
    });
    // Worked 5 hours (09:00 to 14:00)
    AttendanceDaily.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        employeeNumber: 'E001',
        date: '2026-07-25',
        inTime: '2026-07-25T09:00:00.000Z',
        outTime: '2026-07-25T14:00:00.000Z',
        totalWorkingHours: 5.0,
        shifts: [
          {
            inTime: '2026-07-25T09:00:00.000Z',
            outTime: '2026-07-25T14:00:00.000Z',
            status: 'PRESENT',
          }
        ]
      }),
    });

    const r = await classifyRegularOdFromEvidence({
      empNo: 'E001',
      dateStr: '2026-07-25',
      startEvidence: {},
      endEvidence: {},
    });

    expect(r.classification).toBe('full_day');
    expect(r.requiresAuthorityDecision).toBe(false);
    expect(r.tentative).toBe(false);
    expect(r.reason).toBe('classified_from_attendance_punches');
  });
});

describe('odDurationClassificationService — authority decision + attendance', () => {
  it('locks half-day to second half when attendance on first half', () => {
    const r = resolveAuthorityOdDecision(
      { attFirst: true, attSecond: false },
      'half_day',
      'second_half'
    );
    expect(r.ok).toBe(true);
    expect(r.halfDayType).toBe('second_half');
  });

  it('rejects first-half choice when attendance on first half', () => {
    const r = resolveAuthorityOdDecision(
      { attFirst: true, attSecond: false },
      'half_day',
      'first_half'
    );
    expect(r.ok).toBe(false);
    expect(r.suggestedHalfDayType).toBe('second_half');
  });

  it('requires acknowledge when choosing full day with attendance on a half', () => {
    const r = resolveAuthorityOdDecision(
      { attFirst: false, attSecond: true },
      'full_day',
      null
    );
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/acknowledge/i);
  });

  it('allows full day when overlap acknowledged', () => {
    const r = resolveAuthorityOdDecision(
      { attFirst: false, attSecond: true },
      'full_day',
      null,
      { acknowledgeAttendanceOverlap: true }
    );
    expect(r.ok).toBe(true);
    expect(r.odType_extended).toBe('full_day');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('rejects when attendance on both halves', () => {
    const r = resolveAuthorityOdDecision(
      { attFirst: true, attSecond: true },
      'half_day',
      'first_half'
    );
    expect(r.ok).toBe(false);
  });
});

describe('odDurationClassificationService — applyClassificationToOd', () => {
  it('writes durationClassification and tentative half day for shortfall', () => {
    const od = { fromDate: new Date('2026-07-25'), toDate: new Date('2026-07-25') };
    const classification = classifyOdDuration({
      evidenceDurationMinutes: 30,
      shiftDoc: shiftNoHalves,
    });
    applyClassificationToOd(od, classification);
    expect(od.isHalfDay).toBe(true);
    expect(od.numberOfDays).toBe(0.5);
    expect(od.durationClassification.requiresAuthorityDecision).toBe(true);
    expect(od.durationClassification.status).toBe('shortfall');
  });
});
