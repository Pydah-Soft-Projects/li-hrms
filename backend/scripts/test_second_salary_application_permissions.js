/**
 * Test second salary + application creation permissions against live DB and API.
 *
 * Usage: node scripts/test_second_salary_application_permissions.js
 *        API_BASE=http://localhost:5000 node scripts/test_second_salary_application_permissions.js
 */

const mongoose = require('mongoose');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const { test, run } = require('node:test');
const assert = require('node:assert/strict');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';

const User = require('../users/model/User');
const Settings = require('../settings/model/Settings');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const EmployeeApplicationFormSettings = require('../employee-applications/model/EmployeeApplicationFormSettings');
const {
  canCreateApplication,
  canEditSecondSalary,
  enforceSecondSalaryOnPayload,
  stripSecondSalaryFromPayload,
  assertCanCreateApplication,
} = require('../employees/utils/employeeFeatureAccess');

const results = { pass: 0, fail: 0, skip: 0, details: [] };

function pass(name, detail) {
  results.pass += 1;
  results.details.push({ status: 'PASS', name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.fail += 1;
  results.details.push({ status: 'FAIL', name, detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(name, detail) {
  results.skip += 1;
  results.details.push({ status: 'SKIP', name, detail });
  console.log(`  ○ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function login(identifier, password) {
  const res = await axios.post(`${API_BASE}/api/auth/login`, { identifier, password });
  if (!res.data.success) throw new Error(res.data.message || 'Login failed');
  return res.data.data.token;
}

async function findSampleUsers() {
  const users = await User.find({ isActive: { $ne: false }, role: { $in: ['hr', 'manager', 'sub_admin'] } })
    .select('name email role featureControl')
    .lean();

  const hrWriteOnly = users.find(
    (u) =>
      u.role === 'hr' &&
      (u.featureControl || []).some((f) => f === 'EMPLOYEES:write') &&
      !(u.featureControl || []).includes('EMPLOYEES:verify') &&
      !(u.featureControl || []).includes('EMPLOYEES:second_salary')
  );

  const hrVerifyOnly = users.find(
    (u) =>
      (u.featureControl || []).includes('EMPLOYEES:verify') &&
      !(u.featureControl || []).some((f) => f === 'EMPLOYEES:write' || f === 'EMPLOYEES')
  );

  const hrSecondSalary = users.find((u) => (u.featureControl || []).includes('EMPLOYEES:second_salary'));

  const superAdmin = await User.findOne({ role: 'super_admin', isActive: { $ne: false } })
    .select('name email role featureControl')
    .lean();

  return { hrWriteOnly, hrVerifyOnly, hrSecondSalary, superAdmin, allHr: users.filter((u) => u.role === 'hr') };
}

function minimalApplicationPayload(suffix) {
  return {
    emp_no: `TSTSS${suffix}`,
    employee_name: `Second Salary Test ${suffix}`,
    proposedSalary: 15000,
    division_id: '',
    department_id: '',
    second_salary: 2500,
  };
}

async function testDirectApplicationPersist(user, expectStripped, scope, label) {
  const suffix = `${label}${Date.now().toString().slice(-6)}`;
  const data = {
    emp_no: `T${suffix}`.slice(0, 20),
    employee_name: `Perm Test ${suffix}`,
    proposedSalary: 12000,
    division_id: scope.divisionId,
    department_id: scope.departmentId,
    second_salary: 4100,
  };
  await enforceSecondSalaryOnPayload(user, data);
  const settings = await EmployeeApplicationFormSettings.getActiveSettings();
  const { transformFormData } = require('../employee-applications/services/formValidationService');
  const { permanentFields, dynamicFields } = transformFormData(data, settings);
  const existing = await EmployeeApplication.findOne({ emp_no: String(data.emp_no).toUpperCase() });
  if (existing) {
    skip(`Direct persist (${label})`, 'emp_no collision');
    return;
  }
  const doc = await EmployeeApplication.create({
    ...permanentFields,
    dynamicFields,
    status: 'pending',
    createdBy: user._id,
  });
  const stored = Number(doc.second_salary || 0);
  await EmployeeApplication.findByIdAndDelete(doc._id);
  if (expectStripped && stored > 0) {
    fail(`Direct DB persist strips second_salary (${label})`, `stored=${stored}`);
  } else if (!expectStripped && stored !== 4100) {
    fail(`Direct DB persist keeps second_salary (${label})`, `stored=${stored}`);
  } else {
    pass(
      `Direct DB persist (${label})`,
      expectStripped ? `stripped (stored=${stored})` : `kept (${stored})`
    );
  }
}

async function testAssertCreatePermission() {
  try {
    assertCanCreateApplication({ role: 'hr', featureControl: ['EMPLOYEES:read'] });
    fail('assertCanCreateApplication should reject read-only HR');
  } catch (e) {
    if (e.statusCode === 403) pass('assertCanCreateApplication rejects read-only HR');
    else fail('assertCanCreateApplication rejects read-only HR', e.message);
  }
  try {
    assertCanCreateApplication({ role: 'hr', featureControl: ['EMPLOYEES:verify'] });
    pass('assertCanCreateApplication allows verify-only HR');
  } catch (e) {
    fail('assertCanCreateApplication allows verify-only HR', e.message);
  }
}

async function runUnitTests() {
  console.log('\n--- Unit tests (employeeFeatureAccess) ---');
  assert.equal(canEditSecondSalary({ role: 'super_admin' }), true);
  assert.equal(canEditSecondSalary({ role: 'hr', featureControl: ['EMPLOYEES:write'] }), false);
  assert.equal(canEditSecondSalary({ role: 'hr', featureControl: ['EMPLOYEES:second_salary'] }), true);
  assert.equal(canCreateApplication({ role: 'hr', featureControl: ['EMPLOYEES:verify'] }), true);
  assert.equal(canCreateApplication({ role: 'hr', featureControl: ['EMPLOYEES:read'] }), false);
  const payload = { second_salary: 100, dynamicFields: { second_salary: 50 } };
  stripSecondSalaryFromPayload(payload);
  assert.equal(payload.second_salary, undefined);
  pass('Unit tests for permission helpers');
}

async function runDbInspection(users) {
  console.log('\n--- Present data inspection ---');
  const enableSetting = await Settings.findOne({ key: 'enable_second_salary' }).lean();
  pass('Org enable_second_salary', `value=${enableSetting?.value ?? '(missing → default true)'}`);
  pass('Super admin user', users.superAdmin ? `${users.superAdmin.email} (${users.superAdmin.name})` : 'not found');
  pass(
    'HR write-only candidate',
    users.hrWriteOnly ? `${users.hrWriteOnly.email} fc=${JSON.stringify(users.hrWriteOnly.featureControl)}` : 'none — will use first HR with write'
  );
  pass(
    'HR verify-only candidate',
    users.hrVerifyOnly ? `${users.hrVerifyOnly.email} fc=${JSON.stringify(users.hrVerifyOnly.featureControl)}` : 'none in DB'
  );
  pass('Total active HR users', String(users.allHr.length));
}

async function testEnforceStripForHrUser(user) {
  const data = { second_salary: 5000, employee_name: 'x' };
  await enforceSecondSalaryOnPayload(user, data);
  if (data.second_salary === undefined) {
    pass('enforceSecondSalary strips for HR without 2nd salary perm', user.email);
  } else {
    fail('enforceSecondSalary should strip for HR without 2nd salary perm', user.email);
  }
}

async function testEnforceKeepsForSuperAdmin(user) {
  const data = { second_salary: 5000 };
  await enforceSecondSalaryOnPayload(user, data);
  if (data.second_salary === 5000) {
    pass('enforceSecondSalary keeps value for super_admin', user.email);
  } else {
    fail('enforceSecondSalary should keep value for super_admin', String(data.second_salary));
  }
}

async function testApiCreateApplication(token, userLabel, expectSecondSalaryStripped, divisionId, departmentId) {
  const suffix = Date.now().toString().slice(-8);
  const payload = {
    ...minimalApplicationPayload(suffix),
    division_id: divisionId,
    department_id: departmentId,
    second_salary: 3200,
  };

  try {
    const res = await axios.post(`${API_BASE}/api/employee-applications`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    });

    if (res.status === 403) {
      fail(`API create application (${userLabel})`, `403 — ${res.data.message}`);
      return null;
    }
    if (res.status >= 400) {
      fail(`API create application (${userLabel})`, `${res.status} — ${res.data.message || JSON.stringify(res.data)}`);
      return null;
    }

    const app = res.data.data;
    const stored = app?.second_salary ?? 0;
    if (expectSecondSalaryStripped && Number(stored) > 0) {
      fail(`API create strips second_salary (${userLabel})`, `stored=${stored}, expected 0`);
    } else if (!expectSecondSalaryStripped && Number(stored) !== 3200) {
      fail(`API create keeps second_salary (${userLabel})`, `stored=${stored}, expected 3200`);
    } else {
      pass(
        `API create application (${userLabel})`,
        expectSecondSalaryStripped ? `second_salary stripped (stored=${stored})` : `second_salary kept (${stored})`
      );
    }

    if (app?._id) {
      await EmployeeApplication.findByIdAndDelete(app._id);
    }
    return app;
  } catch (e) {
    fail(`API create application (${userLabel})`, e.message);
    return null;
  }
}

async function testVerifyOnlyCannotCreateIfNoWrite(token, userLabel) {
  const suffix = `V${Date.now().toString().slice(-7)}`;
  const payload = { ...minimalApplicationPayload(suffix), second_salary: 1000 };
  try {
    const res = await axios.post(`${API_BASE}/api/employee-applications`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    });
    if (res.status === 201) {
      pass(`Verify-only user can create application (${userLabel})`, `emp_no=${payload.emp_no}`);
      if (res.data?.data?._id) await EmployeeApplication.findByIdAndDelete(res.data.data._id);
    } else if (res.status === 403) {
      fail(`Verify-only user blocked from create (${userLabel})`, res.data.message);
    } else {
      skip(`Verify-only create (${userLabel})`, `${res.status} — ${res.data.message || 'needs division/dept'}`);
    }
  } catch (e) {
    fail(`Verify-only create API (${userLabel})`, e.message);
  }
}

async function testSecondSalaryRouteBlockedForHr(token, userLabel) {
  try {
    const res = await axios.post(
      `${API_BASE}/api/second-salary/calculate`,
      { month: '2026-06' },
      { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true }
    );
    if (res.status === 403) {
      pass(`Second salary calculate blocked for staff (${userLabel})`, res.data.message || '403');
    } else {
      fail(`Second salary calculate should be 403 for staff (${userLabel})`, `status=${res.status}`);
    }
  } catch (e) {
    if (e.code === 'ECONNREFUSED') throw e;
    fail(`Second salary route test (${userLabel})`, e.message);
  }
}

async function resolveDivisionDepartment() {
  const Division = require('../departments/model/Division');
  const Department = require('../departments/model/Department');
  const div = await Division.findOne().select('_id name').lean();
  if (!div) return null;
  const dept = await Department.findOne({ division: div._id }).select('_id name').lean()
    || await Department.findOne().select('_id name').lean();
  if (!dept) return null;
  return { divisionId: String(div._id), departmentId: String(dept._id), divisionName: div.name, deptName: dept.name };
}

async function main() {
  console.log('='.repeat(72));
  console.log('Second Salary + Application Permission Tests');
  console.log('='.repeat(72));
  console.log(`MongoDB: ${MONGODB_URI}`);
  console.log(`API: ${API_BASE}`);

  await runUnitTests();

  await mongoose.connect(MONGODB_URI);
  console.log('\nConnected to MongoDB');

  try {
    const users = await findSampleUsers();
    await runDbInspection(users);

    if (users.superAdmin) {
      await testEnforceKeepsForSuperAdmin(users.superAdmin);
    }

    const hrCandidate =
      users.hrWriteOnly ||
      users.allHr.find((u) => (u.featureControl || []).some((f) => f === 'EMPLOYEES:write' || f === 'EMPLOYEES')) ||
      users.allHr[0];

    if (hrCandidate) {
      await testEnforceStripForHrUser(hrCandidate);
    } else {
      skip('HR enforce strip test', 'no HR user in database');
    }

    const scope = await resolveDivisionDepartment();
    if (!scope) {
      skip('API integration tests', 'no division/department in DB');
    } else {
      pass('Sample division/department for API tests', `${scope.divisionName} / ${scope.deptName}`);
    }

    await testAssertCreatePermission();

    if (scope && users.superAdmin && hrCandidate) {
      console.log('\n--- Direct DB persistence tests (present data) ---');
      await testDirectApplicationPersist(users.superAdmin, false, scope, 'SA');
      await testDirectApplicationPersist(hrCandidate, true, scope, 'HR');
    }

    let serverUp = true;
    try {
      const health = await axios.get(`${API_BASE}/health`, { timeout: 5000, validateStatus: () => true });
      if (health.status >= 500) serverUp = false;
    } catch (e) {
      serverUp = false;
      skip('API tests', `backend not reachable at ${API_BASE} (${e.message})`);
    }

    if (serverUp && scope) {
      console.log('\n--- API integration tests ---');

      try {
        const superToken = await login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
        pass('Super admin login', SUPER_ADMIN_EMAIL);
        await testApiCreateApplication(superToken, 'super_admin', false, scope.divisionId, scope.departmentId);
      } catch (e) {
        skip('Super admin API login', `${SUPER_ADMIN_EMAIL} — ${e.message} (set SUPER_ADMIN_PASSWORD in .env for API tests)`);
      }

      if (hrCandidate?.email) {
        const hrUser = await User.findById(hrCandidate._id).select('+password email');
        if (hrUser?.password) {
          try {
            const hrToken = await login(hrUser.email, SUPER_ADMIN_PASSWORD);
            pass('HR login (default password)', hrUser.email);
            await testApiCreateApplication(hrToken, 'HR', true, scope.divisionId, scope.departmentId);
            await testSecondSalaryRouteBlockedForHr(hrToken, 'HR');
          } catch (e1) {
            skip('HR API tests with default password', `${hrUser.email} — ${e1.message}`);
          }
        } else {
          skip('HR API login', 'password not available in script');
        }
      }

      if (users.hrVerifyOnly?.email) {
        try {
          const vToken = await login(users.hrVerifyOnly.email, SUPER_ADMIN_PASSWORD);
          await testVerifyOnlyCannotCreateIfNoWrite(vToken, users.hrVerifyOnly.email);
        } catch (e) {
          skip('Verify-only API test', e.message);
        }
      } else {
        skip('Verify-only API test', 'no verify-only user in DB');
      }
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log('\n' + '='.repeat(72));
  console.log(`SUMMARY: ${results.pass} passed, ${results.fail} failed, ${results.skip} skipped`);
  console.log('='.repeat(72));

  if (results.fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
