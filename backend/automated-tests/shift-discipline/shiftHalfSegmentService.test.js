const { getShiftSegmentAssignment } = require('../../shifts/services/shiftHalfSegmentService');
const { createISTDate } = require('../../shared/utils/dateUtils');

describe('Shift Half Segment Service - Overnight Anchoring', () => {
  const dayShift = {
    name: 'Day 9-21',
    startTime: '09:00',
    endTime: '21:00',
    gracePeriod: 15,
    payableShifts: 1,
    firstHalf: {
      startTime: '09:00',
      endTime: '15:00',
      duration: 6,
      gracePeriod: 15,
      payableShifts: 0.5,
    },
    secondHalf: {
      startTime: '15:00',
      endTime: '21:00',
      duration: 6,
      gracePeriod: 15,
      payableShifts: 0.5,
    },
    break: {
      startTime: '15:00',
      endTime: '15:00',
      duration: 0,
    },
  };

  const nightShift = {
    name: 'Night 21-09',
    startTime: '21:00',
    endTime: '09:00',
    gracePeriod: 15,
    payableShifts: 1,
    firstHalf: {
      startTime: '21:00',
      endTime: '03:00',
      duration: 6,
      gracePeriod: 15,
      payableShifts: 0.5,
    },
    secondHalf: {
      startTime: '03:00',
      endTime: '09:00',
      duration: 6,
      gracePeriod: 15,
      payableShifts: 0.5,
    },
    break: {
      startTime: '03:00',
      endTime: '03:00',
      duration: 0,
    },
  };

  test('marks second half present for overnight shift when punch spans into next-day morning', () => {
    const date = '2026-05-12';
    const inTime = createISTDate(date, '21:00');
    const outTime = createISTDate('2026-05-13', '09:00');

    const result = getShiftSegmentAssignment(nightShift, date, inTime, outTime, {
      globalLateInGrace: 15,
      globalEarlyOutGrace: 15,
    });

    expect(result.shiftSegments).toHaveLength(2);
    expect(result.shiftSegments[0].segmentName).toBe('firstHalf');
    expect(result.shiftSegments[0].present).toBe(true);
    expect(result.shiftSegments[1].segmentName).toBe('secondHalf');
    expect(result.shiftSegments[1].present).toBe(true);
    expect(result.totalPayableShifts).toBe(1);
  });

  test('continuous two shifts: first shift second-half only, second shift full', () => {
    const date = '2026-05-12';

    const shift1Result = getShiftSegmentAssignment(
      dayShift,
      date,
      createISTDate(date, '15:05'),
      createISTDate(date, '21:00'),
      { globalLateInGrace: 15, globalEarlyOutGrace: 15 }
    );

    const shift2Result = getShiftSegmentAssignment(
      nightShift,
      date,
      createISTDate(date, '21:00'),
      createISTDate('2026-05-13', '09:00'),
      { globalLateInGrace: 15, globalEarlyOutGrace: 15 }
    );

    expect(shift1Result.shiftSegments[0].segmentName).toBe('firstHalf');
    expect(shift1Result.shiftSegments[0].present).toBe(false);
    expect(shift1Result.shiftSegments[1].segmentName).toBe('secondHalf');
    expect(shift1Result.shiftSegments[1].present).toBe(true);

    expect(shift2Result.shiftSegments[0].segmentName).toBe('firstHalf');
    expect(shift2Result.shiftSegments[0].present).toBe(true);
    expect(shift2Result.shiftSegments[1].segmentName).toBe('secondHalf');
    expect(shift2Result.shiftSegments[1].present).toBe(true);

    const totalPayable = shift1Result.totalPayableShifts + shift2Result.totalPayableShifts;
    expect(totalPayable).toBe(1.5);
  });
});
