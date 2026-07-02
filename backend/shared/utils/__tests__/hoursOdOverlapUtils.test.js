/**
 * Smoke test: hour-based OD overlap credit (gap-only).
 * Usage: node backend/shared/utils/__tests__/hoursOdOverlapUtils.test.js
 */

const assert = require('assert');
const {
  computeHoursOdCredit,
  timeStringsOverlap,
  overlapMinuteRanges,
  hoursOdWaivesLateIn,
  hoursOdWaivesEarlyOut,
} = require('../hoursOdOverlapUtils');

function test(name, fn) {
  try {
    fn();
    console.log(`  OK ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}:`, e.message);
    process.exitCode = 1;
  }
}

console.log('hoursOdOverlapUtils');

test('full overlap with punches → zero credit', () => {
  const r = computeHoursOdCredit({
    odStartTime: '10:00',
    odEndTime: '12:00',
    shiftStartTime: '09:00',
    shiftEndTime: '18:00',
    punchInTime: '09:30',
    punchOutTime: '17:30',
  });
  assert.strictEqual(r.creditableMinutes, 0);
  assert.strictEqual(r.fullyCoveredByPunches, true);
});

test('gap before punch-in credits only gap portion', () => {
  const r = computeHoursOdCredit({
    odStartTime: '09:00',
    odEndTime: '11:00',
    shiftStartTime: '09:00',
    shiftEndTime: '18:00',
    punchInTime: '10:30',
    punchOutTime: '18:00',
  });
  assert.strictEqual(r.creditableMinutes, 90);
  assert.strictEqual(r.partialPunchOverlap, true);
});

test('no punches → full shift overlap counts', () => {
  const r = computeHoursOdCredit({
    odStartTime: '14:00',
    odEndTime: '16:00',
    shiftStartTime: '09:00',
    shiftEndTime: '18:00',
    punchInTime: null,
    punchOutTime: null,
  });
  assert.strictEqual(r.creditableMinutes, 120);
});

test('timeStringsOverlap detects overlap', () => {
  assert.strictEqual(timeStringsOverlap('10:00', '12:00', '11:00', '13:00'), true);
  assert.strictEqual(timeStringsOverlap('10:00', '11:00', '11:00', '12:00'), false);
});

test('overlapMinuteRanges overnight shift segment', () => {
  const mins = overlapMinuteRanges(22 * 60, 2 * 60, 23 * 60, 24 * 60);
  assert.strictEqual(mins, 60);
});

test('hour OD waives late when it covers pre-punch gap (emp 272 Jun 11 style)', () => {
  assert.strictEqual(
    hoursOdWaivesLateIn({
      odStartTime: '09:00',
      odEndTime: '09:02',
      shiftStartTime: '09:00',
      punchInTime: '09:03',
      lateInMinutes: 1,
    }),
    true
  );
});

test('hour OD waives early when it covers post-punch gap (emp 272 Jun 25 style)', () => {
  assert.strictEqual(
    hoursOdWaivesEarlyOut({
      odStartTime: '15:45',
      odEndTime: '17:34',
      shiftEndTime: '17:30',
      punchOutTime: '15:44',
      earlyOutMinutes: 103,
    }),
    true
  );
});

test('hour OD does not waive late when gap overlap is less than late minutes', () => {
  assert.strictEqual(
    hoursOdWaivesLateIn({
      odStartTime: '09:00',
      odEndTime: '09:01',
      shiftStartTime: '09:00',
      punchInTime: '09:30',
      lateInMinutes: 20,
    }),
    false
  );
});

console.log('done');
