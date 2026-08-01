/**
 * Salary hold on PayrollRecord (batch/month scoped) — exclude held rows from paysheet.
 */

const PayrollRecord = require('../../payroll/model/PayrollRecord');
const PayrollPayslipSnapshot = require('../../payroll/model/PayrollPayslipSnapshot');
const {
  mapEmployeeToDetail,
  formatEmployeeLabel,
} = require('../../payroll/utils/payrollBatchValidationMessages');

function isPayrollRecordSalaryHeld(record) {
  if (!record || typeof record !== 'object') return false;
  return record.salaryOnHold === true;
}

/** Drop payroll rows marked on hold (record-level). */
function filterPayrollRecordsExcludingSalaryHeld(records) {
  if (!Array.isArray(records)) return [];
  return records.filter((r) => !isPayrollRecordSalaryHeld(r));
}

function mapHeldRecordDetail(record) {
  const emp = record?.employeeId && typeof record.employeeId === 'object' ? record.employeeId : null;
  const idStr = (emp?._id || record?.employeeId || record?._id || '').toString();
  const base = emp
    ? mapEmployeeToDetail(emp, idStr)
    : {
        employeeId: idStr,
        emp_no: record?.emp_no || '',
        employee_name: 'Unknown',
        department_name: '',
        designation_name: '',
        doj: null,
      };
  return {
    ...base,
    payrollRecordId: record?._id ? String(record._id) : null,
    salaryOnHold: true,
    salaryHoldReason: record?.salaryHoldReason || null,
    salaryHeldAt: record?.salaryHeldAt || null,
  };
}

async function resolveSalaryHeldDetailsFromRecords(records) {
  if (!Array.isArray(records) || !records.length) return [];
  return records
    .filter(isPayrollRecordSalaryHeld)
    .map(mapHeldRecordDetail)
    .sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));
}

async function findSalaryHeldPayrollRecords({ month, employeeIds, payrollRecordIds }) {
  const q = { salaryOnHold: true };
  if (month) q.month = month;
  if (payrollRecordIds?.length) q._id = { $in: payrollRecordIds };
  else if (employeeIds?.length) q.employeeId = { $in: employeeIds };

  const docs = await PayrollRecord.find(q)
    .select('_id emp_no employeeId salaryOnHold salaryHoldReason salaryHeldAt month')
    .populate({
      path: 'employeeId',
      select: 'emp_no employee_name department_id designation_id doj',
      populate: [
        { path: 'department_id', select: 'name' },
        { path: 'designation_id', select: 'name' },
      ],
    })
    .lean();

  return docs
    .map(mapHeldRecordDetail)
    .sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));
}

function buildSalaryHeldMessage(details) {
  if (!details?.length) return 'Some payroll records have salary on hold.';
  const labels = details.map((d) => {
    const reason = d.salaryHoldReason ? ` (${d.salaryHoldReason})` : '';
    return `${formatEmployeeLabel(d)}${reason}`;
  });
  const shown = labels.slice(0, 8);
  const suffix = labels.length > 8 ? ` (+${labels.length - 8} more)` : '';
  return `Salary on hold: ${shown.join(', ')}${suffix}`;
}

/**
 * Apply hold/release on payroll records and mirror to regular payslip snapshots.
 */
async function setPayrollRecordsSalaryHold({
  payrollRecordIds,
  hold,
  reason,
  userId,
  batchId,
}) {
  const ids = (payrollRecordIds || []).map(String).filter(Boolean);
  if (!ids.length) {
    const err = new Error('Select at least one payroll record');
    err.statusCode = 400;
    throw err;
  }
  if (hold && !String(reason || '').trim()) {
    const err = new Error('Hold reason is required');
    err.statusCode = 400;
    throw err;
  }

  const query = { _id: { $in: ids } };
  if (batchId) query.payrollBatchId = batchId;

  const records = await PayrollRecord.find(query);
  if (!records.length) {
    const err = new Error('No matching payroll records found in this batch');
    err.statusCode = 404;
    throw err;
  }

  const now = new Date();
  const heldEmpIds = [];

  for (const rec of records) {
    if (hold) {
      rec.salaryOnHold = true;
      rec.salaryHoldReason = String(reason).trim();
      rec.salaryHeldAt = now;
      rec.salaryHeldBy = userId || null;
      rec.salaryHoldReleasedAt = null;
      rec.salaryHoldReleasedBy = null;
    } else {
      rec.salaryOnHold = false;
      rec.salaryHoldReason = null;
      rec.salaryHoldReleasedAt = now;
      rec.salaryHoldReleasedBy = userId || null;
    }
    await rec.save();
    heldEmpIds.push(rec.employeeId);

    await PayrollPayslipSnapshot.updateMany(
      { payrollRecordId: rec._id, kind: 'regular' },
      {
        $set: {
          salaryOnHold: !!hold,
          salaryHoldReason: hold ? String(reason).trim() : null,
          salaryHeldAt: hold ? now : null,
          salaryHeldBy: hold ? userId || null : null,
        },
      }
    ).catch(() => {});

    // Also sync by employee+month if snapshot linked differently
    await PayrollPayslipSnapshot.updateMany(
      { employeeId: rec.employeeId, month: rec.month, kind: 'regular' },
      {
        $set: {
          salaryOnHold: !!hold,
          salaryHoldReason: hold ? String(reason).trim() : null,
          salaryHeldAt: hold ? now : null,
          salaryHeldBy: hold ? userId || null : null,
        },
      }
    ).catch(() => {});
  }

  return {
    updated: records.length,
    hold: !!hold,
    records: records.map((r) => ({
      _id: r._id,
      emp_no: r.emp_no,
      salaryOnHold: r.salaryOnHold,
      salaryHoldReason: r.salaryHoldReason,
    })),
  };
}

module.exports = {
  isPayrollRecordSalaryHeld,
  /** @deprecated alias — employee-level hold removed; use record-level */
  isEmployeeSalaryHeld: () => false,
  filterPayrollRecordsExcludingSalaryHeld,
  resolveSalaryHeldDetailsFromRecords,
  findSalaryHeldPayrollRecords,
  buildSalaryHeldMessage,
  setPayrollRecordsSalaryHold,
  mapHeldRecordDetail,
};
