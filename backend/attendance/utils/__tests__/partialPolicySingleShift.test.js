const test = require('node:test');
const assert = require('node:assert/strict');
const { enforceSingleShiftPartialLopSnapshot } = require('../partialPolicySingleShift');

const absentHalf = { status: 'absent', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };
const presentHalf = { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 };

test('enforceSingleShiftPartialLopSnapshot — IN-only, payable 0, still LOP on second half', () => {
  const snap = {
    firstHalf: presentHalf,
    secondHalf: absentHalf,
    isSplit: true,
    status: null,
  };
  const out = enforceSingleShiftPartialLopSnapshot(snap, true, 0, 0.5, 0.5, 0);
  assert.equal(out.firstHalf.status, 'present');
  assert.equal(out.secondHalf.status, 'leave');
  assert.equal(out.secondHalf.leaveNature, 'lop');
});

test('enforceSingleShiftPartialLopSnapshot — OUT-only → LOP first, present second', () => {
  const snap = {
    firstHalf: absentHalf,
    secondHalf: presentHalf,
    isSplit: true,
    status: null,
  };
  const out = enforceSingleShiftPartialLopSnapshot(snap, true, 0, 0.5, 0, 0.5);
  assert.equal(out.firstHalf.status, 'leave');
  assert.equal(out.secondHalf.status, 'present');
});

test('enforceSingleShiftPartialLopSnapshot — skipped when usePartialPolicy false', () => {
  const snap = { firstHalf: presentHalf, secondHalf: absentHalf };
  const out = enforceSingleShiftPartialLopSnapshot(snap, false, 0, 0.5, 0.5, 0);
  assert.equal(out.secondHalf.status, 'absent');
});
