/**
 * One-time backfill: sync Employee.dynamicFields division/department/designation
 * labels to match current master division_id / department_id / designation_id.
 *
 * Dry-run (default):
 *   node scripts/sync_employee_org_dynamic_fields.js
 *
 * Apply:
 *   node scripts/sync_employee_org_dynamic_fields.js --apply
 *
 * Refuses Atlas/remote URIs unless ALLOW_REMOTE=1.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Designation = require('../departments/model/Designation');
const { applyOrgLabelsToDynamicFields, idStr } = require('../employees/services/employeeTimelineService');

const APPLY = process.argv.includes('--apply');

function isLocalMongoUri(uri) {
  if (!uri) return false;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(uri);
}

function toMap(docs) {
  const map = new Map();
  for (const d of docs) map.set(String(d._id), d);
  return map;
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!isLocalMongoUri(uri) && process.env.ALLOW_REMOTE !== '1') {
    console.error('Refusing to run against non-local MONGODB_URI. Set ALLOW_REMOTE=1 to override.');
    console.error('URI host check failed for:', uri);
    process.exit(1);
  }

  console.log(`[sync_employee_org_dynamic_fields] ${APPLY ? 'APPLY' : 'DRY-RUN'} ${uri}`);
  await mongoose.connect(uri);

  const [divisions, departments, designations] = await Promise.all([
    Division.find({}).select('name code').lean(),
    Department.find({}).select('name code').lean(),
    Designation.find({}).select('name code').lean(),
  ]);
  const divMap = toMap(divisions);
  const deptMap = toMap(departments);
  const desigMap = toMap(designations);

  const cursor = Employee.find({})
    .select('emp_no employee_name division_id department_id designation_id dynamicFields')
    .cursor();

  let scanned = 0;
  let mismatched = 0;
  let updated = 0;
  const samples = [];

  for await (const emp of cursor) {
    scanned += 1;
    const prevDivisionName = emp.dynamicFields?.division_name;
    const changed = applyOrgLabelsToDynamicFields(emp, {
      division: divMap.get(idStr(emp.division_id)),
      department: deptMap.get(idStr(emp.department_id)),
      designation: desigMap.get(idStr(emp.designation_id)),
    });
    if (!changed) continue;

    mismatched += 1;
    if (samples.length < 20) {
      samples.push({
        emp_no: emp.emp_no,
        name: emp.employee_name,
        from: prevDivisionName,
        to: emp.dynamicFields?.division_name,
      });
    }
    if (APPLY) {
      await emp.save();
      updated += 1;
    }
  }

  console.log('scanned:', scanned);
  console.log('would_update / updated:', APPLY ? updated : mismatched);
  if (samples.length) {
    console.log('samples:', JSON.stringify(samples, null, 2));
  }

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
