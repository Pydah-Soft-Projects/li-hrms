const Employee = require('../../employees/model/Employee');
const PayrollRecord = require('../../payroll/model/PayrollRecord');
const PayrollBatch = require('../../payroll/model/PayrollBatch');

function buildLockError(employeeLabel, dateOrMonth) {
  const suffix = dateOrMonth ? ` for ${dateOrMonth}` : '';
  const who = employeeLabel ? ` for ${employeeLabel}` : '';
  const error = new Error(
    `Attendance and roster are locked${who}${suffix} because payroll batch is completed`
  );
  error.code = 'PAYROLL_BATCH_COMPLETED';
  error.reason = 'payroll_batch_completed';
  error.statusCode = 409;
  error.lockType = 'attendance_and_roster';
  error.lockSource = 'payroll_batch';
  error.lockStatus = 'completed';
  error.employeeLabel = employeeLabel || null;
  error.period = dateOrMonth || null;
  return error;
}

async function isEmployeeMonthLocked(employeeId, month) {
  if (!employeeId || !month) return false;
  const payroll = await PayrollRecord.findOne({
    employeeId,
    month,
    payrollBatchId: { $exists: true, $ne: null },
  })
    .select('payrollBatchId')
    .lean();
  if (!payroll?.payrollBatchId) return false;
  const batch = await PayrollBatch.findById(payroll.payrollBatchId)
    .select('status')
    .lean();
  return batch?.status === 'complete';
}

async function findLockedRangeRecord(employeeId, dateStr) {
  if (!employeeId || !dateStr) return null;
  return PayrollRecord.findOne({
    employeeId,
    payrollBatchId: { $exists: true, $ne: null },
    startDate: { $lte: dateStr },
    endDate: { $gte: dateStr },
  })
    .select('payrollBatchId month startDate endDate')
    .lean();
}

async function isEmployeeDateLocked(employeeId, dateStr) {
  const payroll = await findLockedRangeRecord(employeeId, dateStr);
  if (!payroll?.payrollBatchId) return false;
  const batch = await PayrollBatch.findById(payroll.payrollBatchId)
    .select('status')
    .lean();
  return batch?.status === 'complete';
}

async function isEmployeeNumberDateLocked(employeeNumber, dateStr) {
  if (!employeeNumber || !dateStr) return false;
  const employee = await Employee.findOne({
    emp_no: String(employeeNumber).toUpperCase(),
  })
    .select('_id')
    .lean();
  if (!employee?._id) return false;
  return isEmployeeDateLocked(employee._id, dateStr);
}

async function assertEmployeeMonthEditable(employeeId, month, employeeLabel = null) {
  const locked = await isEmployeeMonthLocked(employeeId, month);
  if (locked) throw buildLockError(employeeLabel, month);
}

async function assertEmployeeDateEditable(employeeId, dateStr, employeeLabel = null) {
  const locked = await isEmployeeDateLocked(employeeId, dateStr);
  if (locked) throw buildLockError(employeeLabel, dateStr);
}

async function assertEmployeeNumberDateEditable(employeeNumber, dateStr) {
  const locked = await isEmployeeNumberDateLocked(employeeNumber, dateStr);
  if (locked) {
    throw buildLockError(String(employeeNumber).toUpperCase(), dateStr);
  }
}

module.exports = {
  isEmployeeMonthLocked,
  isEmployeeDateLocked,
  isEmployeeNumberDateLocked,
  assertEmployeeMonthEditable,
  assertEmployeeDateEditable,
  assertEmployeeNumberDateEditable,
};
