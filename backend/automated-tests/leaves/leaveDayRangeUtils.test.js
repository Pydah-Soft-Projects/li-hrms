const assert = require('assert');
const {
  normalizeLeaveBoundaries,
  calculateLeaveNumberOfDays,
  expandLeaveToDailySegments,
  leaveHalfMaskForDate,
  buildLeaveDocumentFieldsForSpan,
} = require('../../shared/utils/leaveDayRangeUtils');

function run() {
  const singleHalf = normalizeLeaveBoundaries({
    fromDate: '2026-06-03',
    toDate: '2026-06-03',
    isHalfDay: true,
    halfDayType: 'first_half',
  });
  assert.strictEqual(singleHalf.ok, true);
  assert.strictEqual(singleHalf.fromHalfDayType, 'first_half');
  assert.strictEqual(calculateLeaveNumberOfDays('2026-06-03', '2026-06-03', singleHalf), 0.5);

  const multiBoundary = normalizeLeaveBoundaries({
    fromDate: '2026-06-03',
    toDate: '2026-06-07',
    fromIsHalfDay: true,
    toIsHalfDay: true,
  });
  assert.strictEqual(multiBoundary.fromHalfDayType, 'second_half');
  assert.strictEqual(multiBoundary.toHalfDayType, 'first_half');
  assert.strictEqual(calculateLeaveNumberOfDays('2026-06-03', '2026-06-07', multiBoundary), 4);

  const segments = expandLeaveToDailySegments({
    fromDate: '2026-06-03',
    toDate: '2026-06-05',
    fromIsHalfDay: true,
    toIsHalfDay: true,
  });
  assert.strictEqual(segments.length, 3);
  assert.strictEqual(segments[0].halfDayType, 'second_half');
  assert.strictEqual(segments[2].halfDayType, 'first_half');
  assert.strictEqual(segments[1].isHalfDay, false);

  const mask = leaveHalfMaskForDate(
    {
      fromDate: new Date('2026-06-03T00:00:00+05:30'),
      toDate: new Date('2026-06-05T00:00:00+05:30'),
      fromIsHalfDay: true,
      toIsHalfDay: true,
    },
    '2026-06-04'
  );
  assert.strictEqual(mask.l1, 0.5);
  assert.strictEqual(mask.l2, 0.5);

  const original = {
    fromDate: new Date('2026-06-03T00:00:00+05:30'),
    toDate: new Date('2026-06-06T00:00:00+05:30'),
    fromIsHalfDay: true,
    toIsHalfDay: true,
    isHalfDay: false,
  };
  const afterSplit = buildLeaveDocumentFieldsForSpan(original, '2026-06-04', '2026-06-06');
  assert.strictEqual(afterSplit.fromIsHalfDay, false, 'new start date must be full, not half');
  assert.strictEqual(afterSplit.toIsHalfDay, true);
  assert.strictEqual(afterSplit.numberOfDays, 2.5);

  console.log('leaveDayRangeUtils.test.js: all passed');
}

run();
