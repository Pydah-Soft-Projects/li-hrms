/**
 * Verifies single-shift processing: OUT-only checkout partial, IN-only partial, full pair, strict OUT-only.
 * Uses mocked AttendanceDaily, OD, and shiftDetectionService (no DB).
 *
 * Run: node scripts/test_single_shift_out_only_partial.js
 */
'use strict';

const path = require('path');
const assert = require('assert');
const Module = require('module');
const mongoose = require('mongoose');

const backendRoot = path.join(__dirname, '..');
const servicePath = path.join(backendRoot, 'attendance', 'services', 'singleShiftProcessingService.js');
const attendanceModelPath = path.normalize(path.join(backendRoot, 'attendance', 'model', 'AttendanceDaily.js'));
const odModelPath = path.normalize(path.join(backendRoot, 'leaves', 'model', 'OD.js'));
const shiftDetPath = path.normalize(path.join(backendRoot, 'shifts', 'services', 'shiftDetectionService.js'));
const shiftModelPath = path.normalize(path.join(backendRoot, 'shifts', 'model', 'Shift.js'));

const docs = new Map();
const docKey = (emp, date) => `${String(emp).toUpperCase()}|${date}`;

function AttendanceDaily(data) {
  Object.assign(this, data);
}
AttendanceDaily.prototype.save = async function save() {
  docs.set(docKey(this.employeeNumber, this.date), this);
  return this;
};
AttendanceDaily.findOne = function findOne(filter) {
  const doc = docs.get(docKey(filter.employeeNumber, filter.date)) ?? null;
  return {
    select() {
      return {
        lean: async () => (doc ? { notes: doc.notes } : null),
      };
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(doc).then(onFulfilled, onRejected);
    },
  };
};
AttendanceDaily.findOneAndUpdate = async () => {};

const shiftObjectId = new mongoose.Types.ObjectId();
const shiftDoc = {
  _id: shiftObjectId,
  name: 'General',
  startTime: '09:00',
  endTime: '18:00',
  duration: 8,
  gracePeriod: 15,
  sourcePriority: 1,
};

const mockShiftModel = {
  findById: () => ({
    select: () => ({
      lean: async () => ({
        _id: shiftObjectId,
        name: 'General',
        payableShifts: 1,
        duration: 8,
      }),
    }),
  }),
};

const mockShiftDetection = {
  getShiftsForEmployee: async () => ({
    shifts: [shiftDoc],
    source: 'pre_scheduled',
  }),
  detectAndAssignShift: async () => ({
    success: true,
    assignedShift: shiftDoc._id,
    shiftName: shiftDoc.name,
    shiftStartTime: shiftDoc.startTime,
    shiftEndTime: shiftDoc.endTime,
    expectedHours: 8,
    isLateIn: false,
    lateInMinutes: null,
    isEarlyOut: false,
    earlyOutMinutes: null,
    basePayable: 1,
  }),
  calculateEarlyOut: () => 0,
};

const mockOD = {
  find: () => ({
    select: () => ({ lean: async () => [] }),
  }),
};

function sameResolved(a, b) {
  return path.normalize(a) === path.normalize(b);
}

const origRequire = Module.prototype.require;
Module.prototype.require = function patchedRequire(id) {
  let resolved;
  try {
    resolved = require.resolve(id, { paths: [path.dirname(this.filename)] });
  } catch {
    return origRequire.apply(this, arguments);
  }
  const norm = (p) => path.normalize(p).replace(/\\/g, '/');
  const r = norm(resolved);
  if (sameResolved(resolved, attendanceModelPath) || r.endsWith('/attendance/model/AttendanceDaily.js')) {
    return AttendanceDaily;
  }
  if (sameResolved(resolved, odModelPath) || r.endsWith('/leaves/model/OD.js')) {
    return mockOD;
  }
  if (sameResolved(resolved, shiftDetPath) || r.endsWith('/shifts/services/shiftDetectionService.js')) {
    return mockShiftDetection;
  }
  if (sameResolved(resolved, shiftModelPath) || r.endsWith('/shifts/model/Shift.js')) {
    return mockShiftModel;
  }
  return origRequire.apply(this, arguments);
};

delete require.cache[servicePath];
const { processSingleShiftAttendance } = require(servicePath);

async function main() {
  const date = '2026-04-04';
  const emp = 'EMP001';
  const loose = { strictCheckInOutOnly: false };

  // 1) Shift-aware: single punch at shift end → PARTIAL, no IN
  docs.clear();
  const r1 = await processSingleShiftAttendance(
    emp,
    date,
    [{ _id: 'p1', timestamp: '2026-04-04T18:00:00+05:30', type: null, punch_state: null }],
    {},
    loose
  );
  assert.strictEqual(r1.success, true, 'r1 success');
  assert.strictEqual(r1.dailyRecord.status, 'PARTIAL', 'r1 status');
  const s1 = r1.dailyRecord.shifts[0];
  assert.ok(s1.outTime, 'r1 has outTime');
  assert.ok(!s1.inTime, 'r1 missing inTime');
  assert.strictEqual(s1.payableShift, 0);
  assert.strictEqual(s1.outPunchId, 'p1');
  console.log('OK: OUT-only (strict off, shift-aware) → PARTIAL, inTime empty');

  // 2) Single punch at shift start → IN-only PARTIAL
  docs.clear();
  const r2 = await processSingleShiftAttendance(
    emp,
    date,
    [{ _id: 'p2', timestamp: '2026-04-04T09:00:00+05:30', type: null }],
    {},
    loose
  );
  assert.strictEqual(r2.dailyRecord.status, 'PARTIAL');
  assert.ok(r2.dailyRecord.shifts[0].inTime);
  assert.ok(!r2.dailyRecord.shifts[0].outTime);
  console.log('OK: IN-only partial unchanged');

  // 3) Full pair same day → PRESENT
  docs.clear();
  const r3 = await processSingleShiftAttendance(
    emp,
    date,
    [
      { _id: 'a', timestamp: '2026-04-04T09:00:00+05:30', type: null },
      { _id: 'b', timestamp: '2026-04-04T18:00:00+05:30', type: null },
    ],
    {},
    loose
  );
  assert.strictEqual(r3.dailyRecord.status, 'PRESENT');
  assert.ok(r3.dailyRecord.shifts[0].inTime && r3.dailyRecord.shifts[0].outTime);
  console.log('OK: IN+OUT → PRESENT');

  // 4) Strict ON: typed OUT only → checkout PARTIAL
  docs.clear();
  const r4 = await processSingleShiftAttendance(
    emp,
    date,
    [{ _id: 'c', timestamp: '2026-04-04T18:00:00+05:30', type: 'OUT', punch_state: 1 }],
    {},
    { strictCheckInOutOnly: true }
  );
  assert.strictEqual(r4.dailyRecord.status, 'PARTIAL');
  assert.ok(!r4.dailyRecord.shifts[0].inTime);
  assert.ok(r4.dailyRecord.shifts[0].outTime);
  console.log('OK: strict ON, OUT only → PARTIAL');

  // 5) Strict ON: no IN/OUT typing → ABSENT
  docs.clear();
  const r5 = await processSingleShiftAttendance(
    emp,
    date,
    [{ _id: 'd', timestamp: '2026-04-04T18:00:00+05:30', type: null }],
    {},
    { strictCheckInOutOnly: true }
  );
  assert.strictEqual(r5.dailyRecord.status, 'ABSENT');
  assert.strictEqual(r5.dailyRecord.totalShifts, 0);
  console.log('OK: strict ON, untyped punch → ABSENT');

  console.log('\nAll single-shift checkout-partial checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
