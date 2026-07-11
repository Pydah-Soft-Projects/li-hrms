/**
 * Create one demo employee application with real org data + qualifications + overall status.
 * Run: node scripts/create_demo_application.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../users/model/User');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Designation = require('../departments/model/Designation');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const EmployeeApplicationFormSettings = require('../employee-applications/model/EmployeeApplicationFormSettings');
const { validateFormData, transformFormData } = require('../employee-applications/services/formValidationService');
const { resolveQualificationProfile } = require('../employee-applications/services/qualificationProfileService');
const { resolveQualificationLabels } = require('../employee-applications/services/fieldMappingService');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ravi');

  const admin = await User.findOne({ role: 'super_admin' }).lean();
  const div = await Division.findOne({ isActive: true }).lean();
  const dept = await Department.findOne({ isActive: true }).lean();
  const des = await Designation.findOne().lean();
  if (!admin || !div || !dept || !des) throw new Error('Missing admin or org data');

  const settings = await EmployeeApplicationFormSettings.getActiveSettings();
  const resolved = await resolveQualificationProfile(div._id, dept._id, des._id);

  await EmployeeApplication.deleteMany({ emp_no: { $in: ['SIM67117884', 'SIM67290961'] } });

  const suffix = Date.now().toString().slice(-6);
  const emp_no = (`DEMO${suffix}`).slice(0, 20);

  const payload = {
    emp_no,
    employee_name: `Demo Application ${suffix}`,
    proposedSalary: 22000,
    division_id: String(div._id),
    department_id: String(dept._id),
    designation_id: String(des._id),
    gender: 'Female',
    marital_status: 'Single',
    blood_group: 'A+',
    phone_number: '9988776655',
    aadhaar_number: '987654321012',
    bank_account_no: '112233445566',
    bank_name: 'HDFC Bank',
    bank_place: 'Vizag',
    ifsc_code: 'HDFC0001234',
    salary_mode: 'Bank',
    qualificationStatus: 'partial_verified',
    qualifications: (resolved.defaultRows || []).map((r) => ({ ...r, isPreFilled: true })),
  };

  const validation = await validateFormData(payload, settings);
  if (!validation.isValid) {
    console.error('Validation failed:', validation.errors);
    process.exit(1);
  }

  const { permanentFields, dynamicFields } = transformFormData(payload, settings);
  permanentFields.qualifications = resolveQualificationLabels(payload.qualifications, resolved);

  const doc = await EmployeeApplication.create({
    ...permanentFields,
    dynamicFields,
    emp_no: emp_no.toUpperCase(),
    createdBy: admin._id,
    status: 'pending',
  });

  console.log('\n✅ Demo application created — check Applications tab in UI\n');
  console.log(JSON.stringify({
    emp_no: doc.emp_no,
    employee_name: doc.employee_name,
    qualificationStatus: doc.qualificationStatus,
    qualificationRows: Array.isArray(doc.qualifications) ? doc.qualifications.length : 0,
    division: div.name,
    department: dept.name,
    designation: des.name,
    gender: doc.gender,
    marital_status: doc.marital_status,
    blood_group: doc.blood_group,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
