const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseRosterHalfNonWorking,
  applyRosterHalfNonWorkingToAttendanceDaily,
} = require('./rosterHalfNonWorking');
const { getWorkedHalfFromShifts } = require('../../leaves/utils/holwoOdPunchResolver');

test('parseRosterHalfNonWorking — shift + H1 holiday', () => {
  const p = parseRosterHalfNonWorking({
    shiftId: 'abc',
    firstHalfStatus: 'HOL',
    secondHalfStatus: null,
  });
  assert.equal(p.firstHOL, true);
  assert.equal(p.secondHOL, false);
  assert.equal(p.isFullHOL, false);
});

test('applyRosterHalfNonWorking — worked working half → HALF_DAY 0.5 payable', () => {
  const doc = {
    date: '2026-05-01',
    shifts: [{
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      inTime: new Date('2026-05-01T09:00:00+05:30'),
      outTime: new Date('2026-05-01T12:00:00+05:30'),
    }],
    totalWorkingHours: 3,
    status: 'HALF_DAY',
    payableShifts: 0.5,
    notes: '',
  };
  const roster = { shiftId: 'x', firstHalfStatus: null, secondHalfStatus: 'HOL' };
  applyRosterHalfNonWorkingToAttendanceDaily(doc, roster, getWorkedHalfFromShifts);
  assert.equal(doc.status, 'HALF_DAY');
  assert.equal(doc.payableShifts, 0.5);
});

test('applyRosterHalfNonWorking — worked working half with 0 punch pay → still 0.5', () => {
  const doc = {
    date: '2026-05-01',
    shifts: [{
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      inTime: new Date('2026-05-01T09:00:00+05:30'),
      outTime: new Date('2026-05-01T11:00:00+05:30'),
    }],
    totalWorkingHours: 2,
    status: 'PARTIAL',
    payableShifts: 0,
    notes: '',
  };
  const roster = { shiftId: 'x', firstHalfStatus: null, secondHalfStatus: 'HOL' };
  applyRosterHalfNonWorkingToAttendanceDaily(doc, roster, getWorkedHalfFromShifts);
  assert.equal(doc.status, 'HALF_DAY');
  assert.equal(doc.payableShifts, 0.5);
});

test('applyRosterHalfNonWorking — no punches, second half holiday → PARTIAL policy split', () => {
  const doc = {
    date: '2026-05-08',
    shifts: [],
    totalWorkingHours: 0,
    status: 'ABSENT',
    payableShifts: 0,
    notes: '',
  };
  const roster = { shiftId: 'x', firstHalfStatus: null, secondHalfStatus: 'HOL' };
  applyRosterHalfNonWorkingToAttendanceDaily(doc, roster, getWorkedHalfFromShifts);
  assert.equal(doc.status, 'PARTIAL');
  assert.equal(doc.rosterSecondHalfNonWorking, 'HOL');
  assert.equal(doc.policyMeta?.partialDayRule?.secondHalfStatus, 'holiday');
  assert.equal(doc.policyMeta?.partialDayRule?.firstHalfStatus, 'absent');
  assert.equal(doc.payableShifts, 0);
});

test('applyRosterHalfNonWorking — full-day punch on half holiday → HALF_DAY 0.5 payable', () => {
  const doc = {
    date: '2026-05-01',
    shifts: [{
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      inTime: new Date('2026-05-01T09:00:00+05:30'),
      outTime: new Date('2026-05-01T18:00:00+05:30'),
    }],
    totalWorkingHours: 8,
    status: 'PRESENT',
    payableShifts: 1,
    notes: '',
  };
  const roster = { shiftId: 'x', firstHalfStatus: null, secondHalfStatus: 'HOL' };
  applyRosterHalfNonWorkingToAttendanceDaily(doc, roster, getWorkedHalfFromShifts);
  assert.equal(doc.status, 'HALF_DAY');
  assert.equal(doc.payableShifts, 0.5);
  assert.match(doc.notes, /full-day punch capped/i);
});

test('applyRosterHalfNonWorking — worked holiday half → HOLIDAY 0 payable', () => {
  const doc = {
    date: '2026-05-01',
    shifts: [{
      shiftStartTime: '09:00',
      shiftEndTime: '18:00',
      inTime: new Date('2026-05-01T14:00:00+05:30'),
      outTime: new Date('2026-05-01T18:00:00+05:30'),
    }],
    totalWorkingHours: 4,
    status: 'HALF_DAY',
    payableShifts: 0.5,
    notes: '',
  };
  const roster = { shiftId: 'x', firstHalfStatus: null, secondHalfStatus: 'HOL' };
  const r = applyRosterHalfNonWorkingToAttendanceDaily(doc, roster, getWorkedHalfFromShifts);
  assert.equal(doc.status, 'HOLIDAY');
  assert.equal(doc.payableShifts, 0);
  assert.equal(r.workedOnHolidayHalf, true);
});
