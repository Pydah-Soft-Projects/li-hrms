/**
 * DANGER: Irreversibly removes MongoDB data tied to an employee (emp_no) in this HRMS codebase.
 *
 * What it covers: collections that store employeeId, emp_no, employee, or employeeNumber, plus
 * portal User rows, payroll batch list cleanup, and loan guarantor $pull. Run against the same
 * MONGODB_URI as the API (backend/.env).
 *
 * What it does NOT cover: external SQL/legacy DBs, biometric service Mongo (if different DB),
 * S3 files, or in-app audit trails embedded inside unrelated documents beyond the steps below.
 *
 * Usage:
 *   node backend/scripts/purge_employee_data_by_emp_no.js --emp-no=EMP123 --dry-run
 *   node backend/scripts/purge_employee_data_by_emp_no.js --emp-no=EMP123 --execute --i-confirm
 *
 * --execute requires typing YES (stdin) unless you pass --i-confirm (for automation only).
 * On Windows: set EMP_NO=EMP123&& node ...
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');

const modelPaths = {
  // Load all models the script uses (side-effect: register models with Mongoose)
  ArrearsRequest: require('../arrears/model/ArrearsRequest'),
  AssetAssignment: require('../assets/model/AssetAssignment'),
  AttendanceDaily: require('../attendance/model/AttendanceDaily'),
  AttendanceRawLog: require('../attendance/model/AttendanceRawLog'),
  BonusRecord: require('../bonus/model/BonusRecord'),
  CCLRequest: require('../leaves/model/CCLRequest'),
  ConfusedShift: require('../shifts/model/ConfusedShift'),
  DeductionRequest: require('../manual-deductions/model/DeductionRequest'),
  ELHistory: require('../leaves/model/ELHistory'),
  EmployeeApplication: require('../employee-applications/model/EmployeeApplication'),
  EmployeeHistory: require('../employees/model/EmployeeHistory'),
  EmployeeUpdateApplication: require('../employee-updates/model/EmployeeUpdateApplication'),
  Leave: require('../leaves/model/Leave'),
  LeaveRegister: require('../leaves/model/LeaveRegister'),
  LeaveRegisterMonthlySnapshot: require('../leaves/model/LeaveRegisterMonthlySnapshot'),
  LeaveRegisterYear: require('../leaves/model/LeaveRegisterYear'),
  LeaveSplit: require('../leaves/model/LeaveSplit'),
  Loan: require('../loans/model/Loan'),
  MonthlyAttendanceSummary: require('../attendance/model/MonthlyAttendanceSummary'),
  MonthlyLeaveRecord: require('../leaves/model/MonthlyLeaveRecord'),
  Notification: require('../notifications/model/Notification'),
  OD: require('../leaves/model/OD'),
  OT: require('../overtime/model/OT'),
  PayRegisterSummary: require('../pay-register/model/PayRegisterSummary'),
  PayrollBatch: require('../payroll/model/PayrollBatch'),
  PayrollPayslipSnapshot: require('../payroll/model/PayrollPayslipSnapshot'),
  PayrollRecord: require('../payroll/model/PayrollRecord'),
  PayrollTransaction: require('../payroll/model/PayrollTransaction'),
  Permission: require('../permissions/model/Permission'),
  PreScheduledShift: require('../shifts/model/PreScheduledShift'),
  PromotionTransferRequest: require('../promotions-transfers/model/PromotionTransferRequest'),
  ResignationRequest: require('../resignations/model/ResignationRequest'),
  SecondSalaryBatch: require('../payroll/model/SecondSalaryBatch'),
  SecondSalaryRecord: require('../payroll/model/SecondSalaryRecord'),
  SecurityLog: require('../security/model/SecurityLog'),
  User: require('../users/model/User'),
};

function parseArgs() {
  const out = { empNo: null, dryRun: true, execute: false, iConfirm: false };
  const fromEnv = process.env.EMP_NO;
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--execute') {
      out.dryRun = false;
      out.execute = true;
    } else if (a === '--i-confirm') out.iConfirm = true;
    else if (a.startsWith('--emp-no=')) out.empNo = a.slice('--emp-no='.length).trim();
  }
  if (!out.empNo && fromEnv) out.empNo = String(fromEnv).trim();
  return out;
}

function model(name) {
  return mongoose.model(name);
}

async function runDeleteResult(label, fn) {
  const r = await fn();
  if (r && (r.dryCount != null || r.deletedCount != null || r.modifiedCount != null)) {
    const dry = r.dryCount != null ? ` would delete: ${r.dryCount}` : '';
    const d = r.deletedCount != null ? ` deleted: ${r.deletedCount}` : '';
    const m = r.modifiedCount != null ? ` modified: ${r.modifiedCount}` : '';
    console.log(`  [${label}]${dry}${d}${m}`);
  } else {
    console.log(`  [${label}] done`);
  }
  return r;
}

async function main() {
  const { empNo: raw, dryRun, execute, iConfirm } = parseArgs();
  if (!raw) {
    console.error('Set --emp-no=... or EMP_NO=...');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is missing in backend/.env');
    process.exit(1);
  }
  if (execute && !iConfirm) {
    console.error('WARNING: This permanently deletes data. Type YES and press Enter to continue.');
    const ok = await new Promise((resolve) => {
      process.stdin.setEncoding('utf8');
      process.stdin.once('data', (d) => resolve(String(d).trim() === 'YES'));
    });
    if (!ok) {
      console.error('Aborted.');
      process.exit(1);
    }
  } else if (execute && iConfirm) {
    console.error('WARNING: --execute with --i-confirm (irreversible deletes).');
  }

  const empNo = String(raw).toUpperCase();
  void modelPaths; // keep requires for side effects

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. emp_no =', empNo, dryRun ? '(dry-run)' : '(EXECUTE)');

  const employee = await Employee.findOne({ emp_no: empNo }).lean();
  if (!employee) {
    console.error('No Employee document found for this emp_no. Stopping.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const id = employee._id;

  const [payrollRecIds, secondRecIds] = await Promise.all([
    model('PayrollRecord')
      .find({ employeeId: id })
      .select('_id')
      .lean()
      .then((rows) => rows.map((r) => r._id)),
    model('SecondSalaryRecord')
      .find({ employeeId: id })
      .select('_id')
      .lean()
      .then((rows) => rows.map((r) => r._id)),
  ]);

  const dm = async (Model, filter) => {
    if (dryRun) {
      return { dryCount: await Model.countDocuments(filter) };
    }
    return Model.deleteMany(filter);
  };
  const dm1 = async (Model, filter) => {
    if (dryRun) {
      return { dryCount: await Model.countDocuments(filter) };
    }
    return Model.deleteOne(filter);
  };

  // --- Deletes keyed by ObjectId and/or emp_no / employee number ---
  await runDeleteResult('PayrollPayslipSnapshot', () => dm(model('PayrollPayslipSnapshot'), { employeeId: id }));
  await runDeleteResult('PayrollTransaction', () => dm(model('PayrollTransaction'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('PayrollRecord', () => dm(model('PayrollRecord'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('SecondSalaryRecord', () => dm(model('SecondSalaryRecord'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));

  await runDeleteResult('PayRegisterSummary', () => dm(model('PayRegisterSummary'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('MonthlyAttendanceSummary', () => dm(model('MonthlyAttendanceSummary'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('MonthlyLeaveRecord', () => dm(model('MonthlyLeaveRecord'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));

  await runDeleteResult('LeaveRegisterYear', () => dm(model('LeaveRegisterYear'), { employeeId: id }));
  await runDeleteResult('LeaveRegister', () => dm(model('LeaveRegister'), { $or: [{ employeeId: id }, { empNo: empNo }] }));
  await runDeleteResult('LeaveRegisterMonthlySnapshot', () => dm(model('LeaveRegisterMonthlySnapshot'), { employeeId: id }));

  await runDeleteResult('Leave', () => dm(model('Leave'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('LeaveSplit', () => dm(model('LeaveSplit'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('OD', () => dm(model('OD'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('CCLRequest', () => dm(model('CCLRequest'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('ELHistory', () => dm(model('ELHistory'), { employeeId: id }));

  await runDeleteResult('ResignationRequest', () => dm(model('ResignationRequest'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('PromotionTransferRequest', () => dm(model('PromotionTransferRequest'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));
  await runDeleteResult('EmployeeUpdateApplication', () => dm(model('EmployeeUpdateApplication'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));

  await runDeleteResult('EmployeeApplication', () => dm(model('EmployeeApplication'), { emp_no: empNo }));
  await runDeleteResult('EmployeeHistory', () => dm(model('EmployeeHistory'), { emp_no: empNo }));

  await runDeleteResult('Permission', () => dm(model('Permission'), { employeeId: id }));
  await runDeleteResult('OT', () => dm(model('OT'), { employeeId: id }));

  await runDeleteResult('ArrearsRequest', () => dm(model('ArrearsRequest'), { employee: id }));
  await runDeleteResult('DeductionRequest (manual)', () => dm(model('DeductionRequest'), { employee: id }));
  await runDeleteResult('AssetAssignment', () => dm(model('AssetAssignment'), { employee: id }));
  await runDeleteResult('SecurityLog', () => dm(model('SecurityLog'), { employeeId: id }));
  await runDeleteResult('BonusRecord', () => dm(model('BonusRecord'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));

  await runDeleteResult('Loan: pull guarantor ($pull)', async () => {
    const gq = { 'guarantors.employeeId': id };
    if (dryRun) {
      return { dryCount: await model('Loan').countDocuments(gq) };
    }
    return model('Loan').updateMany(gq, { $pull: { guarantors: { employeeId: id } } });
  });
  await runDeleteResult('Loan (borrower)', () => dm(model('Loan'), { $or: [{ employeeId: id }, { emp_no: empNo }] }));

  await runDeleteResult('AttendanceDaily', () => dm(model('AttendanceDaily'), { employeeNumber: empNo }));
  await runDeleteResult('AttendanceRawLog', () => dm(model('AttendanceRawLog'), { employeeNumber: empNo }));
  await runDeleteResult('PreScheduledShift', () => dm(model('PreScheduledShift'), { employeeNumber: empNo }));
  await runDeleteResult('ConfusedShift', () => dm(model('ConfusedShift'), { employeeNumber: empNo }));

  await runDeleteResult('PayrollBatch: pull PayrollRecord ids', async () => {
    if (!payrollRecIds.length) {
      return dryRun ? { dryCount: 0 } : { modifiedCount: 0 };
    }
    const bq = { employeePayrolls: { $in: payrollRecIds } };
    if (dryRun) {
      return { dryCount: await model('PayrollBatch').countDocuments(bq) };
    }
    return model('PayrollBatch').updateMany(bq, { $pull: { employeePayrolls: { $in: payrollRecIds } } });
  });
  await runDeleteResult('PayrollBatch: pull missingEmployees', async () => {
    const bq = { 'validationStatus.missingEmployees': id };
    if (dryRun) {
      return { dryCount: await model('PayrollBatch').countDocuments(bq) };
    }
    return model('PayrollBatch').updateMany(bq, { $pull: { 'validationStatus.missingEmployees': id } });
  });
  await runDeleteResult('SecondSalaryBatch: pull SecondSalaryRecord ids', async () => {
    if (!secondRecIds.length) {
      return dryRun ? { dryCount: 0 } : { modifiedCount: 0 };
    }
    const bq = { employeePayrolls: { $in: secondRecIds } };
    if (dryRun) {
      return { dryCount: await model('SecondSalaryBatch').countDocuments(bq) };
    }
    return model('SecondSalaryBatch').updateMany(bq, { $pull: { employeePayrolls: { $in: secondRecIds } } });
  });

  // Portal users: User.employeeId is often emp_no (string) or legacy id string; employeeRef is ObjectId
  const userQuery = { $or: [{ employeeRef: id }, { employeeId: empNo }, { employeeId: id.toString() }] };
  const userIds = await model('User').find(userQuery).distinct('_id');

  await runDeleteResult('Notification (for portal users)', () => dm(model('Notification'), { recipientUserId: { $in: userIds } }));
  await runDeleteResult('User', () => dm(model('User'), userQuery));
  await runDeleteResult('Employee', () => dm1(model('Employee'), { _id: id }));

  await mongoose.disconnect();
  console.log(dryRun ? 'Dry-run finished (no writes).' : 'Purge finished.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
