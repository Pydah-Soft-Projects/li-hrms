const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  findShiftForSplit,
  isLateJoinFirstHalfAbsentSecondPresent,
  computeConsiderableSplitHours,
  shouldAttemptIterativeSplit,
  buildIterativeSplitSegments,
  getShiftEndDate,
  hoursBetween,
} = require('../multiShiftSplitHelpers');

const DATE = '2026-06-05';
const NEXT = '2026-06-06';
const punch = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+05:30`);

const shift1 = {
  _id: 's1',
  name: 'Day',
  startTime: '09:00',
  endTime: '17:00',
  duration: 8,
  firstHalf: { startTime: '09:00', endTime: '13:00', duration: 4, payableShifts: 0.5 },
  secondHalf: { startTime: '13:00', endTime: '17:00', duration: 4, payableShifts: 0.5 },
};

const shift2BackToBack = {
  _id: 's2',
  name: 'Evening',
  startTime: '17:00',
  endTime: '01:00',
  duration: 8,
};

const shift2WithGap = {
  _id: 's2g',
  name: 'Night',
  startTime: '21:00',
  endTime: '05:00',
  duration: 8,
};

describe('late-join HALF credit (considerable hours)', () => {
  it('12h punch, 4h on shift 1 second half, duration 8 → considerable 16 and credit used', () => {
    const inTime = punch(DATE, '13:00');
    const outTime = punch(NEXT, '01:00');
    const totalWorkingHours = hoursBetween(inTime, outTime);
    assert.equal(totalWorkingHours, 12);

    const decision = computeConsiderableSplitHours({
      firstShift: shift1,
      date: DATE,
      inTime,
      outTime,
      totalWorkingHours,
    });

    assert.equal(decision.usedLateJoinCredit, true);
    assert.equal(decision.hoursOnShift1, 4);
    assert.equal(decision.overflowHours, 8);
    assert.equal(decision.considerableHours, 16);
  });

  it('does not credit when both halves are present (full shift 1)', () => {
    const inTime = punch(DATE, '09:00');
    const outTime = punch(NEXT, '01:00');
    const totalWorkingHours = hoursBetween(inTime, outTime);
    const decision = computeConsiderableSplitHours({
      firstShift: shift1,
      date: DATE,
      inTime,
      outTime,
      totalWorkingHours,
    });
    assert.equal(decision.usedLateJoinCredit, false);
    assert.equal(decision.considerableHours, totalWorkingHours);
  });

  it('does not credit first-half-present / second-half-absent (early leave)', () => {
    const inTime = punch(DATE, '09:00');
    const outTime = punch(DATE, '13:00');
    const decision = computeConsiderableSplitHours({
      firstShift: shift1,
      date: DATE,
      inTime,
      outTime,
      totalWorkingHours: 4,
    });
    assert.equal(
      isLateJoinFirstHalfAbsentSecondPresent(shift1, DATE, inTime, outTime),
      false
    );
    assert.equal(decision.usedLateJoinCredit, false);
    assert.equal(decision.considerableHours, 4);
  });

  it('without half segments: late IN after midpoint + HALF overlap still credits', () => {
    const plain = { name: 'Day', startTime: '09:00', endTime: '17:00', duration: 8 };
    const inTime = punch(DATE, '13:00');
    const outTime = punch(NEXT, '01:00');
    const decision = computeConsiderableSplitHours({
      firstShift: plain,
      date: DATE,
      inTime,
      outTime,
      totalWorkingHours: 12,
    });
    assert.equal(decision.usedLateJoinCredit, true);
    assert.equal(decision.considerableHours, 16);
  });
});

describe('shouldAttemptIterativeSplit', () => {
  const firstEnd = punch(DATE, '17:00');

  it('raw 12h is below 14, credited 16 splits when leftover after end > 3h', () => {
    assert.equal(
      shouldAttemptIterativeSplit({
        considerableHours: 12,
        splitThresholdHours: 14,
        outTime: punch(NEXT, '01:00'),
        firstEndDate: firstEnd,
        splitMinGapHours: 3,
      }),
      false
    );
    assert.equal(
      shouldAttemptIterativeSplit({
        considerableHours: 16,
        splitThresholdHours: 14,
        outTime: punch(NEXT, '01:00'),
        firstEndDate: firstEnd,
        splitMinGapHours: 3,
      }),
      true
    );
  });

  it('credited ≥ 14 but leftover after shift 1 end ≤ 3h → no split (extra hours path)', () => {
    assert.equal(
      shouldAttemptIterativeSplit({
        considerableHours: 16,
        splitThresholdHours: 14,
        outTime: punch(DATE, '19:00'),
        firstEndDate: firstEnd,
        splitMinGapHours: 3,
      }),
      false
    );
  });
});

describe('findShiftForSplit — second-half IN beyond 5h from start', () => {
  it('matches Day shift when IN is 15:00 (6h after 09:00 start)', () => {
    const found = findShiftForSplit(punch(DATE, '15:00'), [shift1, shift2WithGap], DATE);
    assert.equal(found?.name, 'Day');
  });

  it('still matches when IN is within 5h of start', () => {
    const found = findShiftForSplit(punch(DATE, '09:20'), [shift1], DATE);
    assert.equal(found?.name, 'Day');
  });
});

describe('buildIterativeSplitSegments', () => {
  const firstEnd = getShiftEndDate(shift1, DATE);

  it('back-to-back: late join 13:00–01:00 becomes shift 1 + shift 2, no roster gap extra', () => {
    const segments = buildIterativeSplitSegments({
      firstShift: shift1,
      firstEndDate: firstEnd,
      currentInTimestamp: punch(DATE, '13:00'),
      remainderOut: punch(NEXT, '01:00'),
      shiftsList: [shift1, shift2BackToBack],
      date: DATE,
      maxShifts: 3,
      splitMinGapHours: 3,
    });
    assert.equal(segments.length, 2);
    assert.equal(segments[0].assignedShift.name, 'Day');
    assert.equal(segments[0].extraHours, 0);
    assert.equal(segments[1].assignedShift.name, 'Evening');
    assert.equal(new Date(segments[1].inTime).toISOString(), punch(DATE, '17:00').toISOString());
    assert.equal(new Date(segments[1].outTime).toISOString(), punch(NEXT, '01:00').toISOString());
  });

  it('roster gap 17:00–21:00 is extra hours on shift 1; shift 2 starts at 21:00', () => {
    const segments = buildIterativeSplitSegments({
      firstShift: shift1,
      firstEndDate: firstEnd,
      currentInTimestamp: punch(DATE, '13:00'),
      remainderOut: punch(NEXT, '05:00'),
      shiftsList: [shift1, shift2WithGap],
      date: DATE,
      maxShifts: 3,
      splitMinGapHours: 3,
    });
    assert.equal(segments.length, 2);
    assert.equal(segments[0].extraHours, 4);
    assert.equal(new Date(segments[1].inTime).toISOString(), punch(DATE, '21:00').toISOString());
    assert.equal(segments[1].assignedShift.name, 'Night');
  });

  it('gap extra on shift 1, leftover after shift 2 start < half of shift 2 → all remainder extra, no shift 2', () => {
    const segments = buildIterativeSplitSegments({
      firstShift: shift1,
      firstEndDate: firstEnd,
      currentInTimestamp: punch(DATE, '13:00'),
      remainderOut: punch(DATE, '23:00'),
      shiftsList: [shift1, shift2WithGap],
      date: DATE,
      maxShifts: 3,
      splitMinGapHours: 3,
    });
    assert.equal(segments.length, 1);
    assert.equal(segments[0].assignedShift.name, 'Day');
    // 17:00–21:00 gap = 4h extra + 21:00–23:00 = 2h (< 4h half of night) extra
    assert.equal(segments[0].extraHours, 6);
  });

  it('no next rostered shift: leftover after shift 1 end is extra on shift 1', () => {
    const segments = buildIterativeSplitSegments({
      firstShift: shift1,
      firstEndDate: firstEnd,
      currentInTimestamp: punch(DATE, '13:00'),
      remainderOut: punch(NEXT, '01:00'),
      shiftsList: [shift1],
      date: DATE,
      maxShifts: 3,
      splitMinGapHours: 3,
    });
    assert.equal(segments.length, 1);
    assert.equal(segments[0].extraHours, 8);
  });

  it('full 14h+ path with no gap still creates two segments from scheduled end', () => {
    const segments = buildIterativeSplitSegments({
      firstShift: shift1,
      firstEndDate: firstEnd,
      currentInTimestamp: punch(DATE, '09:00'),
      remainderOut: punch(NEXT, '01:00'),
      shiftsList: [shift1, shift2BackToBack],
      date: DATE,
      maxShifts: 3,
      splitMinGapHours: 3,
    });
    assert.equal(segments.length, 2);
    assert.equal(segments[0].extraHours, 0);
    assert.equal(new Date(segments[0].inTime).toISOString(), punch(DATE, '09:00').toISOString());
    assert.equal(new Date(segments[0].outTime).toISOString(), punch(DATE, '17:00').toISOString());
  });
});
