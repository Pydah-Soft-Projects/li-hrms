const {
  SHIFT_PRESENT_THRESHOLD,
  meetsShiftLevelPresent,
  computeClippedPunchHours,
  resolveShiftPresence,
} = require('../../attendance/services/shiftPresenceResolutionService');
const { createISTDate } = require('../../shared/utils/dateUtils');

const pydahsoftShift = {
  name: 'Pydahsoft 9-21',
  startTime: '09:00',
  endTime: '21:00',
  duration: 12,
  gracePeriod: 15,
  payableShifts: 1,
  firstHalf: {
    startTime: '09:00',
    endTime: '13:00',
    duration: 4,
    minDuration: 4,
    payableShifts: 0.5,
    gracePeriod: 15,
  },
  break: { startTime: '13:00', endTime: '13:30' },
  secondHalf: {
    startTime: '13:30',
    endTime: '21:00',
    duration: 7.5,
    minDuration: 4,
    payableShifts: 0.5,
    gracePeriod: 15,
  },
};

const DATE = '2026-06-15';
const grace = { globalLateInGrace: 15, globalEarlyOutGrace: 15 };

function baseShift(inStr, outStr, extras = {}) {
  return {
    shiftNumber: 1,
    shiftId: 'shift-id',
    shiftStartTime: '09:00',
    shiftEndTime: '21:00',
    expectedHours: 12,
    basePayable: 1,
    inTime: createISTDate(DATE, inStr),
    outTime: createISTDate(DATE, outStr),
    punchHours: 0,
    odHours: 0,
    edgePermissionHours: 0,
    workingHours: 0,
    ...extras,
  };
}

describe('shiftPresenceResolutionService', () => {
  test('meetsShiftLevelPresent at 75%', () => {
    expect(meetsShiftLevelPresent(9, 12, null)).toBe(true);
    expect(meetsShiftLevelPresent(8.9, 12, null)).toBe(false);
    expect(SHIFT_PRESENT_THRESHOLD).toBe(0.75);
  });

  test('full day 9-21 uses shift_level — both halves present', async () => {
    const pShift = baseShift('09:00', '21:00');
    pShift.punchHours = 12;
    pShift.workingHours = 12;

    await resolveShiftPresence({
      pShift,
      dateStr: DATE,
      employeeNumber: 'EMP001',
      graceOpts: grace,
      shiftDoc: pydahsoftShift,
      applyEdgePermissions: false,
    });

    expect(pShift.presenceResolutionPath).toBe('shift_level');
    expect(pShift.status).toBe('PRESENT');
    expect(pShift.payableShift).toBe(1);
    expect(pShift.shiftSegments).toHaveLength(2);
    expect(pShift.shiftSegments.every((s) => s.present)).toBe(true);
  });

  test('morning only 9-13 uses half_segment fallback', async () => {
    const pShift = baseShift('09:00', '13:00');
    pShift.punchHours = 4;
    pShift.workingHours = 4;

    await resolveShiftPresence({
      pShift,
      dateStr: DATE,
      employeeNumber: 'EMP001',
      graceOpts: grace,
      shiftDoc: pydahsoftShift,
      applyEdgePermissions: false,
    });

    expect(pShift.presenceResolutionPath).toBe('half_segment');
    expect(pShift.status).toBe('HALF_DAY');
    expect(pShift.payableShift).toBe(0.5);
    expect(pShift.shiftSegments.find((s) => s.segmentName === 'firstHalf').present).toBe(true);
    expect(pShift.shiftSegments.find((s) => s.segmentName === 'secondHalf').present).toBe(false);
  });

  test('late full day 11-21 uses shift_level — not half_segment', async () => {
    const pShift = baseShift('11:00', '21:00');
    pShift.punchHours = 10;
    pShift.workingHours = 10;

    await resolveShiftPresence({
      pShift,
      dateStr: DATE,
      employeeNumber: 'EMP001',
      graceOpts: grace,
      shiftDoc: pydahsoftShift,
      applyEdgePermissions: false,
    });

    expect(pShift.presenceResolutionPath).toBe('shift_level');
    expect(pShift.status).toBe('PRESENT');
    expect(pShift.shiftSegments.every((s) => s.present)).toBe(true);
  });

  test('break skip morning 9:18-13:41 uses half_segment', async () => {
    const pShift = baseShift('09:18', '13:41');
    pShift.punchHours = 4.38;
    pShift.workingHours = 4.38;

    await resolveShiftPresence({
      pShift,
      dateStr: DATE,
      employeeNumber: 'EMP001',
      graceOpts: grace,
      shiftDoc: pydahsoftShift,
      applyEdgePermissions: false,
    });

    expect(pShift.presenceResolutionPath).toBe('half_segment');
    expect(pShift.status).toBe('HALF_DAY');
  });

  test('computeClippedPunchHours clips to shift window', () => {
    const pShift = baseShift('08:00', '21:00');
    const hours = computeClippedPunchHours(pShift, DATE);
    expect(hours).toBe(12);
  });
});
