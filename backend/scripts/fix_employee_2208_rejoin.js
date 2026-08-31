/**
 * Fix employee 2208: active, DOJ 2026-08-10, cancel stale resignation.
 *
 * Usage:
 *   node scripts/fix_employee_2208_rejoin.js           # dry run (default)
 *   node scripts/fix_employee_2208_rejoin.js --apply   # apply changes
 */
const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const ResignationRequest = require('../resignations/model/ResignationRequest');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');
const EmployeeHistory = require('../employees/model/EmployeeHistory');

const EMP_NO = '2208';
const TARGET_DOJ = new Date('2026-08-10T00:00:00.000Z');
const CANONICAL_REJOIN_APP_ID = '6a9284ef79303a700b8dddbc';
const PENDING_DUPLICATE_REJOIN_APP_ID = '6a9531e5904cc104a6e3c4b9';
const APPROVED_RESIGNATION_ID = '6a6c70e1193bb1efc39e7206';

const APPLY = process.argv.includes('--apply');

function fmt(d) {
  if (!d) return null;
  return new Date(d).toISOString().split('T')[0];
}

function snapshotEmployee(emp) {
  if (!emp) return null;
  return {
    emp_no: emp.emp_no,
    employee_name: emp.employee_name,
    is_active: emp.is_active,
    leftDate: fmt(emp.leftDate),
    leftReason: emp.leftReason,
    doj: fmt(emp.doj),
    salaryStatus: emp.salaryStatus,
    biometricOffboardedAt: emp.biometricOffboardedAt ? new Date(emp.biometricOffboardedAt).toISOString() : null,
    openTenure: (emp.employmentTenures || []).find((t) => !t.leaveDate) || null,
  };
}

function snapshotResignation(r) {
  if (!r) return null;
  return { _id: String(r._id), status: r.status, leftDate: fmt(r.leftDate), remarks: r.remarks };
}

function snapshotApp(a) {
  if (!a) return null;
  return {
    _id: String(a._id),
    applicationType: a.applicationType,
    status: a.status,
    doj: fmt(a.doj),
    approvedAt: a.approvedAt ? new Date(a.approvedAt).toISOString() : null,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  console.log(`\n${'='.repeat(60)}`);
  console.log(APPLY ? 'MODE: APPLY (writing to database)' : 'MODE: DRY RUN (no writes)');
  console.log(`Database: ${uri.replace(/\/\/[^@]+@/, '//***@')}`);
  console.log(`${'='.repeat(60)}\n`);

  await mongoose.connect(uri);

  const employee = await Employee.findOne({ emp_no: EMP_NO });
  const resignation = await ResignationRequest.findById(APPROVED_RESIGNATION_ID);
  const allResignations = await ResignationRequest.find({ emp_no: EMP_NO }).lean();
  const rejoinApps = await EmployeeApplication.find({ emp_no: EMP_NO, applicationType: 'rejoin' }).sort({ createdAt: 1 });
  const pendingDuplicate = await EmployeeApplication.findById(PENDING_DUPLICATE_REJOIN_APP_ID);
  const canonicalRejoin = await EmployeeApplication.findById(CANONICAL_REJOIN_APP_ID);

  console.log('--- CURRENT STATE ---');
  console.log('Employee:', JSON.stringify(snapshotEmployee(employee), null, 2));
  console.log('Target resignation:', JSON.stringify(snapshotResignation(resignation), null, 2));
  console.log(
    'All resignations:',
    JSON.stringify(allResignations.map(snapshotResignation), null, 2)
  );
  console.log('Rejoin apps:', JSON.stringify(rejoinApps.map(snapshotApp), null, 2));

  const errors = [];
  if (!employee) errors.push(`Employee ${EMP_NO} not found`);
  if (!canonicalRejoin || canonicalRejoin.status !== 'approved') {
    errors.push(`Canonical rejoin app ${CANONICAL_REJOIN_APP_ID} not found or not approved`);
  }
  if (canonicalRejoin && fmt(canonicalRejoin.doj) !== fmt(TARGET_DOJ)) {
    errors.push(`Canonical rejoin DOJ is ${fmt(canonicalRejoin.doj)}, expected ${fmt(TARGET_DOJ)}`);
  }

  const employeeUpdates = {
    is_active: true,
    leftDate: null,
    leftReason: null,
    doj: TARGET_DOJ,
    biometricOffboardedAt: null,
    biometricOffboardDeviceIds: [],
  };

  const resignationUpdates = [];
  for (const r of allResignations) {
    if (['approved', 'pending'].includes(r.status) && r.requestType !== 'termination') {
      resignationUpdates.push({
        _id: String(r._id),
        from: r.status,
        to: 'cancelled',
        leftDate: fmt(r.leftDate),
      });
    }
  }

  const applicationUpdates = [];
  if (pendingDuplicate && pendingDuplicate.status === 'pending') {
    applicationUpdates.push({
      _id: String(pendingDuplicate._id),
      from: pendingDuplicate.status,
      to: 'rejected',
      doj: fmt(pendingDuplicate.doj),
      reason: 'Duplicate rejoin superseded by approved rejoin on 2026-08-10',
    });
  }

  const tenureFix =
    employee &&
    (() => {
      const tenures = employee.employmentTenures || [];
      const open = tenures.filter((t) => !t.leaveDate);
      const needsFix =
        open.length !== 1 ||
        fmt(open[0]?.joinDate) !== fmt(TARGET_DOJ) ||
        open[0]?.applicationId?.toString() !== CANONICAL_REJOIN_APP_ID;
      return { openCount: open.length, needsFix, openJoinDate: open[0] ? fmt(open[0].joinDate) : null };
    })();

  console.log('\n--- PLANNED CHANGES ---');
  console.log('Employee updates:', JSON.stringify(employeeUpdates, null, 2));
  console.log('Resignation cancellations:', JSON.stringify(resignationUpdates, null, 2));
  console.log('Application updates:', JSON.stringify(applicationUpdates, null, 2));
  console.log('Tenure check:', JSON.stringify(tenureFix, null, 2));

  if (errors.length) {
    console.error('\n--- VALIDATION ERRORS ---');
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    await mongoose.disconnect();
    process.exit(1);
  }

  const alreadyCorrect =
    employee.is_active === true &&
    !employee.leftDate &&
    !employee.leftReason &&
    fmt(employee.doj) === fmt(TARGET_DOJ) &&
    !employee.biometricOffboardedAt &&
    resignationUpdates.length === 0 &&
    applicationUpdates.length === 0;

  if (alreadyCorrect) {
    console.log('\n✓ Employee already in target state. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log('\n--- DRY RUN RESULT ---');
    console.log('✓ Validation passed. Re-run with --apply to write changes.');
    await mongoose.disconnect();
    return;
  }

  console.log('\n--- APPLYING CHANGES ---');

  // 1. Cancel resignations
  for (const plan of resignationUpdates) {
    const doc = await ResignationRequest.findById(plan._id);
    if (!doc) continue;
    doc.status = 'cancelled';
    doc.workflow = doc.workflow || {};
    doc.workflow.isCompleted = true;
    doc.workflow.currentStepRole = null;
    doc.workflow.nextApproverRole = null;
    if (!Array.isArray(doc.workflow.history)) doc.workflow.history = [];
    doc.workflow.history.push({
      step: 'manual_fix',
      action: 'cancelled',
      actionByName: 'System Fix Script',
      actionByRole: 'system',
      comments: `Cancelled by fix_employee_2208_rejoin.js — employee rejoined on ${fmt(TARGET_DOJ)}`,
      timestamp: new Date(),
    });
    await doc.save();
    console.log(`✓ Resignation ${plan._id}: ${plan.from} → cancelled`);
  }

  // 2. Reject duplicate pending rejoin
  for (const plan of applicationUpdates) {
    const doc = await EmployeeApplication.findById(plan._id);
    if (!doc) continue;
    doc.status = 'rejected';
    doc.rejectionComments = plan.reason;
    doc.rejectedAt = new Date();
    await doc.save();
    console.log(`✓ Application ${plan._id}: ${plan.from} → rejected`);
  }

  // 3. Fix employee record
  Object.assign(employee, employeeUpdates);

  // 4. Ensure single open tenure from 2026-08-10
  const tenures = employee.employmentTenures || [];
  let openTenures = tenures.filter((t) => !t.leaveDate);
  if (openTenures.length === 0) {
    tenures.push({
      joinDate: TARGET_DOJ,
      leaveDate: null,
      leaveReason: null,
      closedBy: null,
      applicationId: new mongoose.Types.ObjectId(CANONICAL_REJOIN_APP_ID),
      remarks: 'Opened by fix_employee_2208_rejoin.js',
    });
    console.log('✓ Added open tenure from 2026-08-10');
  } else if (openTenures.length > 1) {
    openTenures.slice(1).forEach((t) => {
      t.leaveDate = TARGET_DOJ;
      t.leaveReason = 'Duplicate tenure closed by fix script';
      t.closedBy = 'manual';
    });
    openTenures[0].joinDate = TARGET_DOJ;
    openTenures[0].applicationId = new mongoose.Types.ObjectId(CANONICAL_REJOIN_APP_ID);
    console.log(`✓ Closed ${openTenures.length - 1} duplicate open tenure(s)`);
  } else {
    openTenures[0].joinDate = TARGET_DOJ;
    openTenures[0].leaveDate = null;
    openTenures[0].leaveReason = null;
    openTenures[0].closedBy = null;
    openTenures[0].applicationId = new mongoose.Types.ObjectId(CANONICAL_REJOIN_APP_ID);
    console.log('✓ Normalized single open tenure to 2026-08-10');
  }
  employee.employmentTenures = tenures;

  await employee.save();
  console.log('✓ Employee record updated');

  await EmployeeHistory.create({
    emp_no: EMP_NO,
    event: 'left_date_cleared',
    performedByName: 'System Fix Script',
    performedByRole: 'system',
    details: {
      script: 'fix_employee_2208_rejoin.js',
      doj: TARGET_DOJ,
      resignationsCancelled: resignationUpdates.map((r) => r._id),
      duplicateRejoinRejected: applicationUpdates.map((a) => a._id),
    },
    comments: 'Manual DB fix: employee reactivated with DOJ 2026-08-10, resignation cancelled',
  }).catch((err) => console.warn('History log skipped:', err.message));

  const after = await Employee.findOne({ emp_no: EMP_NO }).lean();
  const afterResignations = await ResignationRequest.find({ emp_no: EMP_NO }).lean();
  const afterApps = await EmployeeApplication.find({ emp_no: EMP_NO, applicationType: 'rejoin' }).lean();

  console.log('\n--- AFTER STATE ---');
  console.log('Employee:', JSON.stringify(snapshotEmployee(after), null, 2));
  console.log('Resignations:', JSON.stringify(afterResignations.map(snapshotResignation), null, 2));
  console.log('Rejoin apps:', JSON.stringify(afterApps.map(snapshotApp), null, 2));

  const success =
    after.is_active === true &&
    !after.leftDate &&
    fmt(after.doj) === fmt(TARGET_DOJ) &&
    !afterResignations.some((r) => r.status === 'approved' && r.requestType === 'resignation');

  if (success) {
    console.log('\n✓ APPLY SUCCESS — employee 2208 is active with DOJ 2026-08-10');
  } else {
    console.error('\n✗ APPLY completed but verification failed — review AFTER STATE above');
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
