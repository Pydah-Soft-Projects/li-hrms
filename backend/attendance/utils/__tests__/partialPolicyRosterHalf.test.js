const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dayHasRosterHalfNonWorking,
  buildRosterHalfPartialPolicyMeta,
} = require('../partialPolicyRosterHalf');

test('dayHasRosterHalfNonWorking — second half HOL', () => {
  assert.equal(
    dayHasRosterHalfNonWorking({ rosterSecondHalfHOL: true }),
    true
  );
});

test('buildRosterHalfPartialPolicyMeta — IN first half, second half roster HOL', () => {
  const meta = buildRosterHalfPartialPolicyMeta(
    { rosterSecondHalfHOL: true },
    0.5,
    0
  );
  assert.equal(meta.ruleCode, 'ROSTER_HALF_NON_WORKING_V1');
  assert.equal(meta.firstHalfStatus, 'present');
  assert.equal(meta.secondHalfStatus, 'holiday');
  assert.equal(meta.lopPortion, 0);
});

test('buildRosterHalfPartialPolicyMeta — no punch, second half HOL', () => {
  const meta = buildRosterHalfPartialPolicyMeta(
    { rosterSecondHalfHOL: true },
    0,
    0
  );
  assert.equal(meta.firstHalfStatus, 'absent');
  assert.equal(meta.secondHalfStatus, 'holiday');
  assert.equal(meta.lopPortion, 0);
});

test('buildRosterHalfPartialPolicyMeta — punch on holiday half only', () => {
  const meta = buildRosterHalfPartialPolicyMeta(
    { rosterSecondHalfHOL: true },
    0,
    0.5
  );
  assert.equal(meta.secondHalfStatus, 'holiday');
  assert.equal(meta.lopPortion, 0);
});
