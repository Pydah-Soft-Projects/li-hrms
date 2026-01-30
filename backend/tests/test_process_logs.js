const mongoose = require('mongoose');
const path = require('path');

// --- 1. MOCK Setup ---
const mockRawLogs = [];
const mockDailyRecords = {};

// Helper to mock a Mongoose Model
const mockModel = (name) => {
  const m = {
    find: () => m,
    findOne: () => Promise.resolve(null),
    findOneAndUpdate: () => Promise.resolve({}),
    create: () => Promise.resolve({}),
    findByIdAndUpdate: () => Promise.resolve({}),
    deleteOne: () => Promise.resolve({}),
    select: () => m,
    sort: () => Promise.resolve([]),
    lean: () => Promise.resolve([]),
    populate: () => m,
    getSettingsByCategory: () => Promise.resolve({}),
  };
  return m;
};

// --- 2. Hijack Requirements ---
const shiftServicePath = path.resolve(__dirname, '../shifts/services/shiftDetectionService.js');
require.cache[shiftServicePath] = {
  id: shiftServicePath,
  filename: shiftServicePath,
  loaded: true,
  exports: {
    // Return null or basic shift to allow logic to proceed without crashing
    detectAndAssignShift: async () => ({ success: true, assignedShift: 'mock_shift_id', expectedHours: 9 })
  }
};

const extraHoursPath = path.resolve(__dirname, '../attendance/services/extraHoursService.js');
require.cache[extraHoursPath] = {
  id: extraHoursPath,
  filename: extraHoursPath,
  loaded: true,
  exports: {
    detectExtraHours: async () => ({ success: true })
  }
};

try {
  require('../attendance/model/AttendanceRawLog');
  require('../attendance/model/AttendanceDaily');
  require('../settings/model/Settings');
  require('../employees/model/Employee');
  require('../leaves/model/OD');
  require('../leaves/model/Leave');
} catch (e) {
  console.log('[Mock Setup] Model loading warning:', e.message);
}

const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Settings = require('../settings/model/Settings');
const Employee = require('../employees/model/Employee');
const OD = require('../leaves/model/OD');
const Leave = require('../leaves/model/Leave');

// --- 3. Implement Mock Logic ---

AttendanceRawLog.find = (query) => {
  // console.log(`[MockDB] AttendanceRawLog.find called with query:`, JSON.stringify(query));
  return {
    sort: (sortOpts) => {
      const sorted = [...mockRawLogs].sort((a, b) => a.timestamp - b.timestamp);
      return Promise.resolve(sorted);
    }
  };
};
AttendanceRawLog.create = () => Promise.resolve({});

AttendanceDaily.findOneAndUpdate = (query, update, options) => {
  const key = `${query.employeeNumber}:${query.date}`;
  console.log(`[MockDB] UPDATE ${key}: IN=${update.$set?.inTime}, OUT=${update.$set?.outTime}, STATUS=${update.$set?.status}`);
  mockDailyRecords[key] = update.$set;
  return Promise.resolve({
    ...update.$set,
    isNew: true,
    save: () => Promise.resolve({})
  });
};
AttendanceDaily.findOne = () => Promise.resolve(null);
AttendanceDaily.deleteOne = () => Promise.resolve({});

Settings.getSettingsByCategory = () => Promise.resolve({});

// FIX: Employee.findOne must return object with .select()
Employee.findOne = () => ({
  select: () => Promise.resolve({ _id: 'mock_emp_id' })
});

const mockMongooseQuery = (result) => ({
  select: () => mockMongooseQuery(result),
  sort: () => mockMongooseQuery(result),
  lean: () => Promise.resolve(result),
  then: (resolve) => resolve(result)
});
OD.find = () => mockMongooseQuery([]);
Leave.find = () => mockMongooseQuery([]);


// --- 4. Load Service ---
const { processAndAggregateLogs } = require('../attendance/services/attendanceSyncService');

// --- 5. Test Runner (with assertions) ---
const assert = require('assert');

async function runTest(scenarioName, logs, expected) {
  mockRawLogs.length = 0;
  for (const prop of Object.keys(mockDailyRecords)) delete mockDailyRecords[prop];

  logs.forEach(l => {
    mockRawLogs.push({
      employeeNumber: 'TEST_EMP',
      timestamp: new Date(`2025-01-01T${l.time}:00.000Z`),
      type: l.type,
      date: '2025-01-01',
      source: 'test',
      _id: 'mock_id_' + Math.random()
    });
  });

  const stats = await processAndAggregateLogs(mockRawLogs, false, true);
  if (expected.errorsCount !== undefined) {
    assert.strictEqual(stats.errors.length, expected.errorsCount, `${scenarioName}: expected ${expected.errorsCount} errors, got ${stats.errors.length}`);
  }
  const result = mockDailyRecords['TEST_EMP:2025-01-01'];
  if (expected.recordExists !== false) {
    assert(result, `${scenarioName}: expected daily record TEST_EMP:2025-01-01 to exist`);
    if (expected.status !== undefined) assert.strictEqual(result.status, expected.status, `${scenarioName}: status`);
    if (expected.inTimeSubstr !== undefined && result.inTime) {
      const inStr = new Date(result.inTime).toISOString().split('T')[1].substr(0, 8);
      assert(inStr.includes(expected.inTimeSubstr) || inStr.startsWith(expected.inTimeSubstr), `${scenarioName}: inTime ~${expected.inTimeSubstr}`);
    }
    if (expected.outTimeSubstr !== undefined && result.outTime) {
      const outStr = new Date(result.outTime).toISOString().split('T')[1].substr(0, 8);
      assert(outStr.includes(expected.outTimeSubstr) || outStr.startsWith(expected.outTimeSubstr), `${scenarioName}: outTime ~${expected.outTimeSubstr}`);
    }
  } else {
    assert(!result, `${scenarioName}: expected no daily record`);
  }
}

// --- 6. Execute (assertions) ---
(async () => {
  try {
    await runTest('Standard IN -> OUT', [
      { time: '08:00', type: 'IN' },
      { time: '17:00', type: 'OUT' }
    ], { errorsCount: 0, recordExists: true, inTimeSubstr: '08', outTimeSubstr: '17' });

    await runTest('Multiple INs (08:00 IN -> 09:00 IN -> 17:00 OUT)', [
      { time: '08:00', type: 'IN' },
      { time: '09:00', type: 'IN' },
      { time: '17:00', type: 'OUT' }
    ], { errorsCount: 0, recordExists: true });

    await runTest('Multiple OUTs (08:00 IN -> 12:00 OUT -> 17:00 OUT)', [
      { time: '08:00', type: 'IN' },
      { time: '12:00', type: 'OUT' },
      { time: '17:00', type: 'OUT' }
    ], { errorsCount: 0, recordExists: true });

    await runTest('Two Shifts (08:00-12:00, 13:00-17:00)', [
      { time: '08:00', type: 'IN' },
      { time: '12:00', type: 'OUT' },
      { time: '13:00', type: 'IN' },
      { time: '17:00', type: 'OUT' }
    ], { errorsCount: 0, recordExists: true });

    console.log('All assertions passed.');
  } catch (e) {
    console.error('TEST FAILED:', e.message);
    process.exit(1);
  }
})();
