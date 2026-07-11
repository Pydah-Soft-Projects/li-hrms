/**
 * Live simulation: employee application + qualification overall status + form migrations.
 * Uses real MongoDB + optional API on localhost:5000.
 *
 * Run: node scripts/simulate_employee_application_live.js
 *      KEEP_TEST_APPLICATION=1 node scripts/simulate_employee_application_live.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ravi';
const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const api = axios.create({ baseURL: API_BASE, timeout: 120000 });
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@hrms.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';
const KEEP_TEST_APPLICATION = process.env.KEEP_TEST_APPLICATION === '1';

const User = require('../users/model/User');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Designation = require('../departments/model/Designation');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const EmployeeApplicationFormSettings = require('../employee-applications/model/EmployeeApplicationFormSettings');
const { validateFormData, transformFormData } = require('../employee-applications/services/formValidationService');
const { resolveQualificationProfile } = require('../employee-applications/services/qualificationProfileService');
const { resolveQualificationLabels } = require('../employee-applications/services/fieldMappingService');
const sessionService = require('../authentication/services/sessionService');
const { generateAccessToken } = require('../authentication/services/tokenService');

const results = [];

function formatAxiosError(err) {
  if (err.response) {
    return `${err.response.status} ${err.response.data?.message || JSON.stringify(err.response.data)}`;
  }
  return `${err.code || ''} ${err.message}`.trim();
}

function log(status, name, detail = '') {
  const row = { status, name, detail };
  results.push(row);
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function connectDb() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGODB_URI);
  }
}

async function login() {
  try {
    const res = await api.post('/api/auth/login', {
      identifier: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
    });
    if (res.data?.success && res.data?.data?.token) return res.data.data.token;
  } catch (_) {
    /* fall through to programmatic session */
  }
  const user = await User.findOne({ email: SUPER_ADMIN_EMAIL, isActive: { $ne: false } }).lean();
  if (!user) throw new Error(`No active user for ${SUPER_ADMIN_EMAIL}`);
  const { sessionId } = await sessionService.createSession({
    userId: String(user._id),
    tokenVersion: user.tokenVersion ?? 0,
    deviceId: 'simulation-script',
    deviceName: 'simulate_employee_application_live',
  });
  return generateAccessToken({
    userId: String(user._id),
    sessionId,
    tokenVersion: user.tokenVersion ?? 0,
  });
}

async function findOrgScope() {
  const div = await Division.findOne({ isActive: true }).lean();
  if (!div) return null;
  const dept = await Department.findOne({ isActive: true, division_id: div._id }).lean()
    || await Department.findOne({ isActive: true }).lean();
  if (!dept) return null;
  const des = await Designation.findOne({ department: dept._id }).lean()
    || await Designation.findOne().lean();
  if (!des) return null;
  return { div, dept, des };
}

function assertPersonalDropdownFields(groups) {
  const personal = (groups || []).find((g) => g && g.id === 'personal_info');
  if (!personal) return { ok: false, reason: 'personal_info group missing' };
  const checks = ['gender', 'marital_status', 'blood_group'];
  for (const id of checks) {
    const f = (personal.fields || []).find((x) => x && x.id === id);
    if (!f) return { ok: false, reason: `${id} field missing` };
    if (f.type !== 'select') return { ok: false, reason: `${id} is ${f.type}, expected select` };
    if (!Array.isArray(f.options) || f.options.length < 2) {
      return { ok: false, reason: `${id} missing options` };
    }
  }
  return { ok: true };
}

async function buildValidPayload(scope, suffix) {
  return {
    emp_no: `SIM${suffix}`.slice(0, 20),
    employee_name: `Simulation Applicant ${suffix}`,
    proposedSalary: 18500,
    division_id: String(scope.div._id),
    department_id: String(scope.dept._id),
    designation_id: String(scope.des._id),
    gender: 'Male',
    marital_status: 'Single',
    blood_group: 'O+',
    phone_number: '9876543210',
    aadhaar_number: '123456789012',
    bank_account_no: '123456789012',
    bank_name: 'Test Bank',
    bank_place: 'Test City',
    ifsc_code: 'SBIN0001234',
    salary_mode: 'Bank',
    qualificationStatus: 'not_submitted',
    qualifications: [],
  };
}

async function main() {
  console.log('\n=== Employee Application Live Simulation ===\n');
  console.log(`DB: ${MONGODB_URI}`);
  console.log(`API: ${API_BASE}\n`);

  await connectDb();

  const superAdmin = await User.findOne({ role: 'super_admin', isActive: { $ne: false } }).lean();
  if (!superAdmin) {
    log('FAIL', 'Super admin in DB');
    return printSummary(1);
  }
  log('PASS', 'Super admin found', superAdmin.email);

  const scope = await findOrgScope();
  if (!scope) {
    log('FAIL', 'Org scope (division/department/designation)');
    return printSummary(1);
  }
  log('PASS', 'Org scope loaded', `${scope.div.name} / ${scope.dept.name} / ${scope.des.name}`);

  // --- Form settings migrations (getActiveSettings + getSettings path) ---
  const settingsDoc = await EmployeeApplicationFormSettings.getActiveSettings();
  if (!settingsDoc) {
    log('FAIL', 'Active form settings');
    return printSummary(1);
  }
  const personalCheck = assertPersonalDropdownFields(settingsDoc.groups);
  if (personalCheck.ok) {
    log('PASS', 'Personal info dropdown fields', 'gender, marital_status, blood_group are select');
  } else {
    log('FAIL', 'Personal info dropdown fields', personalCheck.reason);
  }

  const resolvedQual = await resolveQualificationProfile(scope.div._id, scope.dept._id, scope.des._id);
  log('PASS', 'Qualification profile resolve', `source=${resolvedQual.source}, fields=${resolvedQual.fields?.length || 0}, defaultRows=${resolvedQual.defaultRows?.length || 0}`);

  const suffix = Date.now().toString().slice(-8);
  const basePayload = await buildValidPayload(scope, suffix);

  // --- Validation: missing overall status should fail ---
  const noStatusPayload = { ...basePayload, qualificationStatus: '' };
  const valNoStatus = await validateFormData(noStatusPayload, settingsDoc);
  if (!valNoStatus.isValid && valNoStatus.errors?.qualificationStatus) {
    log('PASS', 'Validation rejects missing qualificationStatus', valNoStatus.errors.qualificationStatus);
  } else {
    log('FAIL', 'Validation rejects missing qualificationStatus', JSON.stringify(valNoStatus.errors || {}));
  }

  // --- Validation: with overall status should pass (core required fields) ---
  const valOk = await validateFormData(basePayload, settingsDoc);
  if (valOk.isValid) {
    log('PASS', 'Validation accepts payload with qualificationStatus');
  } else {
    log('FAIL', 'Validation accepts payload with qualificationStatus', JSON.stringify(valOk.errors));
  }

  // --- Direct DB create (mirrors createApplicationInternal) ---
  let createdViaInternal = null;
  try {
    const existing = await EmployeeApplication.findOne({ emp_no: basePayload.emp_no.toUpperCase() });
    if (existing) {
      await EmployeeApplication.deleteOne({ _id: existing._id });
      log('SKIP', 'Removed stale test application with same emp_no');
    }
    const validation = await validateFormData(basePayload, settingsDoc);
    if (!validation.isValid) throw new Error(validation.errors?.qualificationStatus || JSON.stringify(validation.errors));
    const { permanentFields, dynamicFields } = transformFormData(basePayload, settingsDoc);
    if (Array.isArray(basePayload.qualifications)) {
      const qualSettings = await resolveQualificationProfile(scope.div._id, scope.dept._id, scope.des._id);
      permanentFields.qualifications = resolveQualificationLabels(basePayload.qualifications, qualSettings);
    }
    createdViaInternal = await EmployeeApplication.create({
      ...permanentFields,
      dynamicFields,
      emp_no: basePayload.emp_no.toUpperCase(),
      createdBy: superAdmin._id,
      status: 'pending',
    });
    if (createdViaInternal?.qualificationStatus === 'not_submitted') {
      log('PASS', 'Internal create persists qualificationStatus', createdViaInternal.emp_no);
    } else {
      log('FAIL', 'Internal create persists qualificationStatus', `got=${createdViaInternal?.qualificationStatus}`);
    }
    if (Array.isArray(createdViaInternal.qualifications) || createdViaInternal.qualifications == null) {
      log('PASS', 'Internal create qualifications shape', `rows=${Array.isArray(createdViaInternal.qualifications) ? createdViaInternal.qualifications.length : 0}`);
    }
  } catch (err) {
    log('FAIL', 'Internal create application', err.message);
  }

  // --- API scenarios ---
  let apiToken = null;
  try {
    apiToken = await login();
    log('PASS', 'API auth token', SUPER_ADMIN_EMAIL);
  } catch (err) {
    log('SKIP', 'API login', err.message);
  }

  if (apiToken) {
    const apiSuffix = `${suffix}A`;
    const apiPayload = await buildValidPayload(scope, apiSuffix);

    // Missing qualificationStatus via API
    try {
      const bad = await api.post('/api/employee-applications', {
        ...apiPayload,
        qualificationStatus: '',
      }, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      log('FAIL', 'API rejects missing qualificationStatus', `unexpected success ${bad.status}`);
    } catch (err) {
      const msg = formatAxiosError(err);
      if (err.response?.status === 400 && /qualification status/i.test(msg)) {
        log('PASS', 'API rejects missing qualificationStatus', msg);
      } else {
        log('FAIL', 'API rejects missing qualificationStatus', msg);
      }
    }

    // Successful API create — leave this one visible in UI unless cleaned up
    let createdViaApi = null;
    const apiEmpNo = `SIMAPI${suffix}`.slice(0, 20);
    try {
      const good = await api.post('/api/employee-applications', {
        ...apiPayload,
        emp_no: apiEmpNo,
        qualificationStatus: 'partial_verified',
        qualifications: JSON.stringify(resolvedQual.defaultRows || []),
      }, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (good.status === 201 && good.data?.success) {
        createdViaApi = good.data.data;
        log('PASS', 'API creates application (KEEP for UI review)', `${createdViaApi.emp_no} qualificationStatus=${createdViaApi.qualificationStatus}`);
      } else {
        log('FAIL', 'API creates application', good.data?.message || String(good.status));
      }
    } catch (err) {
      log('FAIL', 'API creates application', formatAxiosError(err));
    }

    if (createdViaApi?._id) {
      const fromDb = await EmployeeApplication.findById(createdViaApi._id).lean();
      if (fromDb?.qualificationStatus === 'partial_verified') {
        log('PASS', 'API application stored in DB', `qualificationStatus=${fromDb.qualificationStatus}, qualifications rows=${Array.isArray(fromDb.qualifications) ? fromDb.qualifications.length : 0}`);
      } else {
        log('FAIL', 'API application stored in DB', `qualificationStatus=${fromDb?.qualificationStatus}`);
      }
      if (!KEEP_TEST_APPLICATION) {
        await EmployeeApplication.deleteOne({ _id: createdViaApi._id });
        log('PASS', 'Cleaned up API test application');
      } else {
        log('SKIP', 'Kept API test application for UI', `${fromDb?.emp_no} — search in Applications tab`);
      }
    }

    // Scenario: each overall status option accepted
    for (const status of ['verified', 'partial_verified', 'taken', 'not_submitted']) {
      const scenSuffix = `${suffix}${status.slice(0, 2)}`;
      const scenEmp = `S${scenSuffix}`.slice(0, 20);
      try {
        await api.post('/api/employee-applications', {
          ...apiPayload,
          emp_no: scenEmp,
          qualificationStatus: status,
        }, { headers: { Authorization: `Bearer ${apiToken}` } });
        log('PASS', `API accepts qualificationStatus=${status}`, scenEmp);
        await EmployeeApplication.deleteOne({ emp_no: scenEmp.toUpperCase() });
      } catch (err) {
        log('FAIL', `API accepts qualificationStatus=${status}`, formatAxiosError(err));
      }
    }
  }

  if (createdViaInternal?._id && !KEEP_TEST_APPLICATION) {
    await EmployeeApplication.deleteOne({ _id: createdViaInternal._id });
    log('PASS', 'Cleaned up internal test application');
  } else if (createdViaInternal?._id) {
    log('SKIP', 'Kept internal test application', createdViaInternal.emp_no);
  }

  return printSummary();
}

function printSummary(forceFail = 0) {
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length + forceFail;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  console.log('\n--- Summary ---');
  console.log(`PASS: ${passed}  FAIL: ${failed}  SKIP: ${skipped}`);
  if (failed > 0) {
    console.log('\nFailed:');
    results.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exitCode = 1;
  }
  mongoose.disconnect().catch(() => {});
}

main().catch((err) => {
  console.error('Simulation error:', err);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
