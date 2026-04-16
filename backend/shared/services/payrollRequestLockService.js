const Settings = require('../../settings/model/Settings');
const Employee = require('../../employees/model/Employee');
const PayrollRecord = require('../../payroll/model/PayrollRecord');
const PayrollBatch = require('../../payroll/model/PayrollBatch');
const { getPayrollDateRange } = require('../utils/dateUtils');

const AUTO_REJECT_SETTING_KEY = 'auto_reject_pending_requests_on_batch_complete';

function buildRequestLockError(employeeLabel, periodLabel) {
  const suffix = periodLabel ? ` for ${periodLabel}` : '';
  const who = employeeLabel ? ` for ${employeeLabel}` : '';
  const error = new Error(
    `Requests are locked${who}${suffix} because payroll batch is completed`
  );
  error.code = 'PAYROLL_BATCH_COMPLETED';
  error.reason = 'payroll_batch_completed';
  error.statusCode = 409;
  error.lockType = 'requests';
  error.lockSource = 'payroll_batch';
  error.lockStatus = 'completed';
  error.employeeLabel = employeeLabel || null;
  error.period = periodLabel || null;
  return error;
}

async function findCompletedPayrollRecordForDate(employeeId, dateStr) {
  if (!employeeId || !dateStr) return null;
  const payroll = await PayrollRecord.findOne({
    employeeId,
    payrollBatchId: { $exists: true, $ne: null },
    startDate: { $lte: dateStr },
    endDate: { $gte: dateStr },
  })
    .select('payrollBatchId month startDate endDate')
    .lean();

  if (!payroll?.payrollBatchId) return null;

  const batch = await PayrollBatch.findById(payroll.payrollBatchId).select('status').lean();
  if (batch?.status !== 'complete') return null;

  return payroll;
}

async function assertEmployeeDateRequestsEditable(employeeId, dateStr, employeeLabel = null) {
  const payroll = await findCompletedPayrollRecordForDate(employeeId, dateStr);
  if (payroll) {
    throw buildRequestLockError(employeeLabel, dateStr);
  }
}

async function assertEmployeeNumberDateRequestsEditable(employeeNumber, dateStr) {
  if (!employeeNumber || !dateStr) return;
  const employee = await Employee.findOne({
    emp_no: String(employeeNumber).toUpperCase(),
  })
    .select('_id emp_no')
    .lean();

  if (!employee?._id) return;
  await assertEmployeeDateRequestsEditable(employee._id, dateStr, employee.emp_no);
}

function enumerateDateStrings(fromDate, toDate) {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const dates = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

async function assertEmployeeRangeRequestsEditable(employeeId, fromDate, toDate, employeeLabel = null) {
  const dates = enumerateDateStrings(fromDate, toDate);
  for (const dateStr of dates) {
    const payroll = await findCompletedPayrollRecordForDate(employeeId, dateStr);
    if (payroll) {
      throw buildRequestLockError(employeeLabel, `${dateStr} to ${dates[dates.length - 1] || dateStr}`);
    }
  }
}

async function isAutoRejectPendingRequestsEnabled() {
  const setting = await Settings.findOne({ key: AUTO_REJECT_SETTING_KEY }).select('value').lean();
  return setting?.value === true;
}

async function resolveBatchEmployeePeriods(batch) {
  if (!batch?._id || !batch?.month) return [];

  let payrollRecords = await PayrollRecord.find({
    payrollBatchId: batch._id,
  })
    .select('_id employeeId month startDate endDate')
    .lean();

  if ((!payrollRecords || payrollRecords.length === 0) && Array.isArray(batch.employeePayrolls) && batch.employeePayrolls.length > 0) {
    const ids = batch.employeePayrolls
      .map((entry) => entry?.payrollRecordId || entry?._id || entry)
      .filter(Boolean);

    payrollRecords = await PayrollRecord.find({
      _id: { $in: ids },
    })
      .select('_id employeeId month startDate endDate')
      .lean();
  }

  if ((!payrollRecords || payrollRecords.length === 0) && batch.division) {
    payrollRecords = await PayrollRecord.find({
      month: batch.month,
      division: batch.division,
    })
      .select('_id employeeId month startDate endDate')
      .lean();
  }

  const periods = [];

  for (const record of payrollRecords || []) {
    if (!record?.employeeId) continue;
    periods.push({
      employeeId: String(record.employeeId),
      month: record.month || batch.month,
      startDate: record.startDate,
      endDate: record.endDate,
    });
  }

  if (periods.length > 0) return periods;

  const employeeQuery = {};
  if (batch.division) employeeQuery.division_id = batch.division;
  if (batch.department) employeeQuery.department_id = batch.department;

  const employees = await Employee.find(employeeQuery)
    .select('_id leftDate')
    .lean();

  for (const employee of employees) {
    if (!employee?._id) continue;
    if (typeof Employee.shouldIncludeForMonth === 'function' && !Employee.shouldIncludeForMonth(employee.leftDate || null, batch.month)) {
      continue;
    }

    const [year, monthNum] = String(batch.month).split('-').map(Number);
    const range = await getPayrollDateRange(year, monthNum);
    periods.push({
      employeeId: String(employee._id),
      month: batch.month,
      startDate: range.startDate,
      endDate: range.endDate,
    });
  }

  return periods;
}

module.exports = {
  AUTO_REJECT_SETTING_KEY,
  buildRequestLockError,
  assertEmployeeDateRequestsEditable,
  assertEmployeeNumberDateRequestsEditable,
  assertEmployeeRangeRequestsEditable,
  isAutoRejectPendingRequestsEnabled,
  resolveBatchEmployeePeriods,
};
