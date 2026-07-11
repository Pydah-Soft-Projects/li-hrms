/**
 * Test: new application with required overall status + creator-edited qualification rows.
 * Run: node scripts/test_application_qualifications_editable.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const api = axios.create({ baseURL: API_BASE, timeout: 120000 });

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
function log(ok, name, detail = '') {
  results.push({ ok, name, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getApiToken() {
  const user = await User.findOne({ role: 'super_admin', isActive: { $ne: false } }).lean();
  if (!user) throw new Error('No super_admin user');
  const { sessionId } = await sessionService.createSession({
    userId: String(user._id),
    tokenVersion: user.tokenVersion ?? 0,
    deviceId: 'test-app-qual-editable',
    deviceName: 'test_application_qualifications_editable',
  });
  return {
    token: generateAccessToken({
      userId: String(user._id),
      sessionId,
      tokenVersion: user.tokenVersion ?? 0,
    }),
    user,
  };
}

function firstEditableFieldId(fields) {
  const f = (fields || []).find((x) => x.isEnabled !== false && x.id !== 's_no' && x.type !== 'boolean');
  return f?.id || null;
}

/** Mimic UI: seed default rows, creator fills empty cell + adds one row */
function buildTouchedQualifications(resolved) {
  const fieldId = firstEditableFieldId(resolved.fields);
  const defaultRows = (resolved.defaultRows || []).map((row, i) => ({
    ...row,
    isPreFilled: true,
    ...(fieldId && i === 0 ? { [fieldId]: 'Creator filled value' } : {}),
  }));
  const extraRow = (resolved.fields || []).reduce((acc, f) => {
    if (f.isEnabled === false || f.id === 's_no') return acc;
    if (f.type === 'number') acc[f.id] = 85;
    else if (f.type === 'boolean') acc[f.id] = false;
    else acc[f.id] = f.id === fieldId ? 'Extra row value' : '';
    return acc;
  }, { isPreFilled: false });
  return [...defaultRows, extraRow];
}

async function main() {
  console.log('\n=== Test: Overall status + editable qualifications ===\n');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ravi');

  const div = await Division.findOne({ isActive: true }).lean();
  const dept = await Department.findOne({ isActive: true }).lean();
  const des = await Designation.findOne().lean();
  if (!div || !dept || !des) {
    log(false, 'Org data');
    process.exit(1);
  }

  const settings = await EmployeeApplicationFormSettings.getActiveSettings();
  const resolved = await resolveQualificationProfile(div._id, dept._id, des._id);
  log(true, 'Qualification profile', `${resolved.source}, ${resolved.defaultRows?.length || 0} default rows, ${resolved.fields?.length || 0} fields`);

  const qualifications = buildTouchedQualifications(resolved);
  const editableField = firstEditableFieldId(resolved.fields);
  log(true, 'Simulated creator edits', `${qualifications.length} rows (default + extra), touched field: ${editableField || 'n/a'}`);

  const suffix = Date.now().toString().slice(-6);
  const emp_no = (`QTEST${suffix}`).slice(0, 20);

  const payload = {
    emp_no,
    employee_name: `Qual Edit Test ${suffix}`,
    proposedSalary: 20000,
    division_id: String(div._id),
    department_id: String(dept._id),
    designation_id: String(des._id),
    gender: 'Female',
    marital_status: 'Married',
    blood_group: 'B+',
    phone_number: '9123456780',
    aadhaar_number: '112233445566',
    bank_account_no: '998877665544',
    bank_name: 'SBI',
    bank_place: 'Hyderabad',
    ifsc_code: 'SBIN0001122',
    salary_mode: 'Bank',
    qualificationStatus: 'partial_verified',
    qualifications,
  };

  // 1) Missing overall status must fail
  const noStatus = await validateFormData({ ...payload, qualificationStatus: '' }, settings);
  log(!noStatus.isValid && !!noStatus.errors?.qualificationStatus, 'Validation blocks empty overall status');

  // 2) Full payload with touched quals must pass validation
  const okVal = await validateFormData(payload, settings);
  log(okVal.isValid, 'Validation accepts overall status + qualifications', okVal.isValid ? '' : JSON.stringify(okVal.errors));

  // 3) DB persist
  const { user } = await getApiToken();
  const { permanentFields, dynamicFields } = transformFormData(payload, settings);
  permanentFields.qualifications = resolveQualificationLabels(qualifications, resolved);

  await EmployeeApplication.deleteOne({ emp_no: emp_no.toUpperCase() });
  const doc = await EmployeeApplication.create({
    ...permanentFields,
    dynamicFields,
    emp_no: emp_no.toUpperCase(),
    createdBy: user._id,
    status: 'pending',
  });

  const storedRows = Array.isArray(doc.qualifications) ? doc.qualifications.length : 0;
  log(doc.qualificationStatus === 'partial_verified', 'DB stores qualificationStatus', doc.qualificationStatus);
  log(storedRows >= 2, 'DB stores multiple qualification rows', String(storedRows));

  const firstRow = Array.isArray(doc.qualifications) ? doc.qualifications[0] : null;
  const hasCreatorEdit = firstRow && editableField
    ? Object.values(firstRow).some((v) => String(v).includes('Creator filled'))
    : storedRows > (resolved.defaultRows?.length || 0);
  log(!!hasCreatorEdit, 'DB keeps creator-edited qualification data');

  // 4) API create (second app)
  const apiEmp = (`QAPI${suffix}`).slice(0, 20);
  const { token } = await getApiToken();
  let apiDoc = null;
  try {
    const res = await api.post(
      '/api/employee-applications',
      {
        ...payload,
        emp_no: apiEmp,
        employee_name: `Qual API Test ${suffix}`,
        qualifications: JSON.stringify(qualifications),
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    apiDoc = res.data?.data;
    log(res.status === 201 && res.data?.success, 'API creates application', apiEmp);
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    log(false, 'API creates application', msg);
  }

  if (apiDoc?._id) {
    const fromDb = await EmployeeApplication.findById(apiDoc._id).lean();
    log(fromDb?.qualificationStatus === 'partial_verified', 'API app qualificationStatus in DB');
    log(Array.isArray(fromDb?.qualifications) && fromDb.qualifications.length >= 2, 'API app qualification rows in DB', String(fromDb?.qualifications?.length));
    console.log(`\n  → Review in UI: Applications tab, emp_no **${apiEmp}** (overall: partial_verified, ${fromDb?.qualifications?.length} qual rows)\n`);
  }

  console.log(`  → DB test app kept: **${emp_no}** (delete manually if not needed)\n`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`--- ${results.length - failed}/${results.length} passed ---\n`);
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
