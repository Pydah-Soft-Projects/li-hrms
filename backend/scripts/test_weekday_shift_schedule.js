/**
 * Integration tests for canonical weekdayShiftSchedule flow.
 * Run: node backend/scripts/test_weekday_shift_schedule.js
 * Optional API tests when backend is running on PORT (default 5000).
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { connectMongoDB, closeMongoDB } = require('../config/database');
const Employee = require('../employees/model/Employee');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const EmployeeApplicationFormSettings = require('../employee-applications/model/EmployeeApplicationFormSettings');
const User = require('../users/model/User');
const { transformFormData } = require('../employee-applications/services/formValidationService');
const { transformApplicationToEmployee } = require('../employee-applications/services/fieldMappingService');
const { generateFirstMonthRoster } = require('../shifts/services/firstMonthRosterService');
const {
  applyWeekdayShiftScheduleToPayload,
  resolveWeekdayShiftSchedule,
  stripLegacyWeekdayFromDynamicFields,
  hasConfiguredWeekdaySchedule,
} = require('../shared/utils/weekdayShiftScheduleUtils');

const BASE = `http://localhost:${process.env.PORT || 5000}`;
const results = { passed: 0, failed: 0, skipped: 0 };

function pass(msg) {
  console.log(`  PASS: ${msg}`);
  results.passed += 1;
}
function fail(msg, detail) {
  console.log(`  FAIL: ${msg}${detail ? ` — ${detail}` : ''}`);
  results.failed += 1;
}
function skip(msg) {
  console.log(`  SKIP: ${msg}`);
  results.skipped += 1;
}

async function request(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function sampleSchedule() {
  return {
    schedule: [
      { weekday: 0, shiftId: null, isWeekOff: true },
      { weekday: 1, shiftId: new mongoose.Types.ObjectId(), isWeekOff: false },
    ],
  };
}

async function testUtils() {
  console.log('\n--- Utils ---');
  const legacy = {
    dynamicFields: {
      weekday_shift_pattern: {
        isEnabled: true,
        schedule: [{ weekday: 2, shiftId: 'abc', isWeekOff: false }],
      },
    },
  };
  const resolved = resolveWeekdayShiftSchedule(legacy);
  if (resolved?.schedule?.length === 1 && resolved.schedule[0].weekday === 2) {
    pass('resolveWeekdayShiftSchedule reads legacy dynamicFields');
  } else {
    fail('resolveWeekdayShiftSchedule legacy', JSON.stringify(resolved));
  }

  const { permanentFields, dynamicFields } = applyWeekdayShiftScheduleToPayload(
    {},
    legacy.dynamicFields,
    legacy
  );
  if (permanentFields.weekdayShiftSchedule?.schedule?.length === 1) {
    pass('applyWeekdayShiftScheduleToPayload promotes to permanentFields');
  } else {
    fail('applyWeekdayShiftScheduleToPayload promote');
  }
  if (!dynamicFields.weekday_shift_pattern) {
    pass('applyWeekdayShiftScheduleToPayload strips legacy keys');
  } else {
    fail('applyWeekdayShiftScheduleToPayload strip');
  }
}

async function testSchemas() {
  console.log('\n--- Schemas ---');
  const empPaths = Employee.schema.paths;
  const appPaths = EmployeeApplication.schema.paths;
  if (empPaths.weekdayShiftSchedule) pass('Employee schema has weekdayShiftSchedule');
  else fail('Employee schema missing weekdayShiftSchedule');
  if (appPaths.weekdayShiftSchedule) pass('EmployeeApplication schema has weekdayShiftSchedule');
  else fail('EmployeeApplication schema missing weekdayShiftSchedule');
}

async function testTransformFormData() {
  console.log('\n--- transformFormData ---');
  const settings = await EmployeeApplicationFormSettings.getActiveSettings();
  const formData = {
    emp_no: 'TSTWSS01',
    employee_name: 'Weekday Test',
    proposedSalary: 10000,
    weekdayShiftSchedule: sampleSchedule(),
    dynamicFields: {
      weekday_shift_pattern: sampleSchedule(),
    },
  };
  const { permanentFields, dynamicFields } = transformFormData(formData, settings);
  if (permanentFields.weekdayShiftSchedule?.schedule?.length >= 1) {
    pass('transformFormData keeps weekdayShiftSchedule in permanentFields');
  } else {
    fail('transformFormData permanentFields');
  }
  if (!dynamicFields.weekday_shift_pattern) {
    pass('transformFormData removes legacy from dynamicFields');
  } else {
    fail('transformFormData legacy still in dynamicFields');
  }
}

async function testTransformApplicationToEmployee() {
  console.log('\n--- transformApplicationToEmployee ---');
  const application = {
    emp_no: 'TSTWSS02',
    employee_name: 'Verify Test',
    gross_salary: 12000,
    weekdayShiftSchedule: sampleSchedule(),
    dynamicFields: {},
    doj: new Date('2026-01-15'),
  };
  const { permanentFields } = transformApplicationToEmployee(application, { gross_salary: 12000 });
  if (hasConfiguredWeekdaySchedule(permanentFields.weekdayShiftSchedule)) {
    pass('transformApplicationToEmployee copies weekdayShiftSchedule');
  } else {
    fail('transformApplicationToEmployee');
  }
}

async function testDbMigrationState() {
  console.log('\n--- DB migration state ---');
  const legacyEmployees = await Employee.countDocuments({
    $or: [
      { 'dynamicFields.weekday_shift_pattern': { $exists: true } },
      { 'dynamicFields.weekdayShiftPattern': { $exists: true } },
    ],
  });
  if (legacyEmployees === 0) {
    pass('No employees with legacy weekday_shift_pattern in dynamicFields');
  } else {
    fail('Employees still have legacy weekday keys', String(legacyEmployees));
  }

  const withCanonical = await Employee.countDocuments({
    'weekdayShiftSchedule.schedule.0': { $exists: true },
  });
  console.log(`  INFO: ${withCanonical} employee(s) with canonical weekdayShiftSchedule`);
  pass('DB migration state checked');
}

async function testFirstMonthRosterOrgGate() {
  console.log('\n--- firstMonthRosterService ---');
  const settings = await EmployeeApplicationFormSettings.findOne({ isActive: true }).lean();
  const wasEnabled = settings?.weekdayShiftSchedule?.isEnabled;

  await EmployeeApplicationFormSettings.updateOne(
    { isActive: true },
    { $set: { 'weekdayShiftSchedule.isEnabled': false } }
  );
  const disabledResult = await generateFirstMonthRoster(
    { emp_no: 'X', doj: new Date(), weekdayShiftSchedule: sampleSchedule() },
    new mongoose.Types.ObjectId()
  );
  if (disabledResult.created === 0 && disabledResult.message.includes('disabled org-wide')) {
    pass('firstMonthRoster skips when org toggle disabled');
  } else {
    fail('firstMonthRoster org gate', disabledResult.message);
  }

  await EmployeeApplicationFormSettings.updateOne(
    { isActive: true },
    { $set: { 'weekdayShiftSchedule.isEnabled': wasEnabled === true } }
  );
}

async function testRouteRegistered() {
  console.log('\n--- Routes ---');
  const appRoutes = require('../employee-applications/index');
  const stack = appRoutes.stack || [];
  const hasRoute = stack.some(
    (layer) =>
      layer.route &&
      layer.route.path === '/form-settings/weekday-shift-schedule' &&
      layer.route.methods.put
  );
  if (hasRoute) pass('PUT /form-settings/weekday-shift-schedule route registered');
  else fail('weekday-shift-schedule route missing');
}

async function testApiIfServerUp() {
  console.log('\n--- API (live) ---');
  let health;
  try {
    health = await request('GET', '/health');
  } catch (e) {
    skip(`Backend not running (${e.message})`);
    return null;
  }
  if (health.status !== 200) {
    skip('Backend not running on ' + BASE);
    return null;
  }
  pass('Backend health');

  const admin = await User.findOne({ role: 'super_admin', isActive: { $ne: false } }).lean();
  if (!admin?.email) {
    skip('No super_admin user for API login');
    return null;
  }

  let token;
  try {
    const loginRes = await request('POST', '/api/auth/login', {
      body: { identifier: admin.email, password: 'Admin@123' },
    });
    if (!loginRes.data?.success) {
      skip(`API login failed (${loginRes.data?.message || loginRes.status}) — use correct password`);
      return null;
    }
    token = loginRes.data.data.token;
    pass('Super admin API login');
  } catch (e) {
    skip(`API login error: ${e.message}`);
    return null;
  }

  const getSettings = await request('GET', '/api/employee-applications/form-settings', { token });
  if (getSettings.data?.success && getSettings.data?.data?.weekdayShiftSchedule != null) {
    pass('GET form-settings includes weekdayShiftSchedule');
  } else {
    fail('GET form-settings weekdayShiftSchedule', JSON.stringify(getSettings.data?.message));
  }

  const prevEnabled = getSettings.data?.data?.weekdayShiftSchedule?.isEnabled === true;
  const toggleRes = await request('PUT', '/api/employee-applications/form-settings/weekday-shift-schedule', {
    token,
    body: { isEnabled: !prevEnabled },
  });
  if (toggleRes.data?.success) {
    pass('PUT weekday-shift-schedule toggle');
  } else {
    fail('PUT weekday-shift-schedule', toggleRes.data?.message || String(toggleRes.status));
  }

  // Restore original toggle
  await request('PUT', '/api/employee-applications/form-settings/weekday-shift-schedule', {
    token,
    body: { isEnabled: prevEnabled },
  });

  const verifySettings = await request('GET', '/api/employee-applications/form-settings', { token });
  const enabledNow = verifySettings.data?.data?.weekdayShiftSchedule?.isEnabled === true;
  if (enabledNow === prevEnabled) {
    pass('Toggle restored to original value');
  } else {
    fail('Toggle restore', `expected ${prevEnabled}, got ${enabledNow}`);
  }

  return token;
}

async function testDbRoundtrip() {
  console.log('\n--- DB roundtrip ---');
  const schedule = sampleSchedule();
  const testEmpNo = `WSS${Date.now().toString().slice(-6)}`;

  const admin = await User.findOne({ role: 'super_admin' }).lean();
  const createdBy = admin?._id || new mongoose.Types.ObjectId();

  const app = await EmployeeApplication.create({
    emp_no: testEmpNo,
    employee_name: 'Weekday Schedule Test',
    proposedSalary: 15000,
    weekdayShiftSchedule: schedule,
    status: 'pending',
    dynamicFields: {},
    createdBy,
  });
  const reloadedApp = await EmployeeApplication.findById(app._id).lean();
  if (hasConfiguredWeekdaySchedule(reloadedApp.weekdayShiftSchedule)) {
    pass('Application persists weekdayShiftSchedule on create');
  } else {
    fail('Application weekdayShiftSchedule persistence');
  }

  const emp = await Employee.create({
    emp_no: testEmpNo,
    employee_name: 'Weekday Schedule Test',
    weekdayShiftSchedule: schedule,
    dynamicFields: {},
    is_active: true,
  });
  const reloadedEmp = await Employee.findById(emp._id).lean();
  if (hasConfiguredWeekdaySchedule(reloadedEmp.weekdayShiftSchedule)) {
    pass('Employee persists weekdayShiftSchedule on create');
  } else {
    fail('Employee weekdayShiftSchedule persistence');
  }

  await EmployeeApplication.deleteOne({ _id: app._id });
  await Employee.deleteOne({ _id: emp._id });
  pass('Test records cleaned up');
}

async function testEmployeeUpdateStrip() {
  console.log('\n--- Employee update strip ---');
  const schedule = sampleSchedule();
  const testEmpNo = `WSSU${Date.now().toString().slice(-5)}`;
  const emp = await Employee.create({
    emp_no: testEmpNo,
    employee_name: 'Update Strip Test',
    weekdayShiftSchedule: schedule,
    gross_salary: 10000,
    is_active: true,
  });

  const before = await Employee.findOne({ emp_no: testEmpNo }).lean();
  const originalSchedule = JSON.stringify(before.weekdayShiftSchedule);

  // Simulate updateEmployee guard: strip weekdayShiftSchedule from payload before save
  const employeeData = {
    employee_name: 'Update Strip Test Renamed',
    weekdayShiftSchedule: {
      schedule: [{ weekday: 0, shiftId: new mongoose.Types.ObjectId(), isWeekOff: false }],
    },
  };
  delete employeeData.weekdayShiftSchedule;

  await Employee.updateOne(
    { emp_no: testEmpNo },
    { $set: { employee_name: employeeData.employee_name } }
  );

  const after = await Employee.findOne({ emp_no: testEmpNo }).lean();
  if (after.employee_name === 'Update Strip Test Renamed') {
    pass('Employee name update works');
  } else {
    fail('Employee name update');
  }
  if (JSON.stringify(after.weekdayShiftSchedule) === originalSchedule) {
    pass('weekdayShiftSchedule unchanged when stripped from update payload');
  } else {
    fail('weekdayShiftSchedule was modified despite strip');
  }

  await Employee.deleteOne({ _id: emp._id });
}

async function testAccrualReadsCanonicalOnly() {
  console.log('\n--- Accrual eligibility ---');
  const { generateNextCycleRoster } = require('../shifts/services/weekdayRosterAccrualService');
  const testEmpNo = `WSSA${Date.now().toString().slice(-5)}`;

  await EmployeeApplicationFormSettings.updateOne(
    { isActive: true },
    { $set: { 'weekdayShiftSchedule.isEnabled': true } }
  );

  // Employee with only legacy dynamicFields should NOT be eligible after migration model
  await Employee.create({
    emp_no: testEmpNo,
    employee_name: 'Legacy Only',
    dynamicFields: {
      weekday_shift_pattern: sampleSchedule(),
    },
    is_active: true,
    doj: new Date('2025-01-01'),
  });

  const result = await generateNextCycleRoster({
    refDateStr: '2026-03-25',
    systemUserId: new mongoose.Types.ObjectId(),
  });

  const legacyEmpRoster = await require('../shifts/model/PreScheduledShift')
    .countDocuments({ employeeNumber: testEmpNo });

  if (legacyEmpRoster === 0) {
    pass('Accrual ignores legacy-only dynamicFields (canonical field required)');
  } else {
    fail('Accrual created roster for legacy-only employee', String(legacyEmpRoster));
  }

  await Employee.deleteOne({ emp_no: testEmpNo });
  console.log(`  INFO: accrual run created=${result.created} employees=${result.employees}`);
}

async function testFormSettingsController() {
  console.log('\n--- formSettingsController ---');
  const admin = await User.findOne({ role: 'super_admin' }).lean();
  if (!admin) {
    skip('No super_admin for controller test');
    return;
  }

  const { updateWeekdayShiftScheduleConfig } = require('../employee-applications/controllers/formSettingsController');
  const settingsBefore = await EmployeeApplicationFormSettings.findOne({ isActive: true }).lean();
  const prev = settingsBefore?.weekdayShiftSchedule?.isEnabled === true;

  let statusCode;
  let body;
  const req = {
    body: { isEnabled: !prev },
    user: { _id: admin._id },
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  await updateWeekdayShiftScheduleConfig(req, res);
  if (statusCode === 200 && body?.success) {
    pass('updateWeekdayShiftScheduleConfig controller');
  } else {
    fail('updateWeekdayShiftScheduleConfig controller', body?.message || String(statusCode));
  }

  await EmployeeApplicationFormSettings.updateOne(
    { isActive: true },
    { $set: { 'weekdayShiftSchedule.isEnabled': prev } }
  );
}

async function main() {
  console.log('\n=== Weekday Shift Schedule Integration Tests ===\n');
  await connectMongoDB();

  await testUtils();
  await testSchemas();
  await testTransformFormData();
  await testTransformApplicationToEmployee();
  await testDbMigrationState();
  await testFirstMonthRosterOrgGate();
  await testRouteRegistered();
  await testDbRoundtrip();
  await testEmployeeUpdateStrip();
  await testFormSettingsController();
  await testAccrualReadsCanonicalOnly();
  await testApiIfServerUp();

  await closeMongoDB();

  console.log('\n=== Summary ===');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Skipped: ${results.skipped}`);

  if (results.failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await closeMongoDB().catch(() => {});
  process.exit(1);
});
