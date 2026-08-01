const Employee = require('../../employees/model/Employee');
const {
  mapEmployeeToDetail,
  formatEmployeeLabel,
} = require('../../payroll/utils/payrollBatchValidationMessages');

/** True when employee salary is not finalized (matches Employees page "Salary Pending" badge). */
function isEmployeeSalaryPending(emp) {
  if (!emp) return true;
  return emp.salaryStatus !== 'approved';
}

/** Mongo condition: only employees with finalized salary. */
function salaryApprovedQueryFragment() {
  return { salaryStatus: 'approved' };
}

/** Drop payroll rows whose populated employeeId has salary pending. */
function filterPayrollRecordsExcludingSalaryPending(records) {
  if (!Array.isArray(records)) return [];
  return records.filter((r) => {
    const emp = r?.employeeId;
    if (!emp || typeof emp !== 'object') return false;
    return !isEmployeeSalaryPending(emp);
  });
}

async function resolveSalaryPendingEmployeeDetails(employeeIds) {
  if (!employeeIds?.length) return [];
  const docs = await Employee.find({ _id: { $in: employeeIds } })
    .select('emp_no employee_name doj department_id designation_id salaryStatus')
    .populate('department_id', 'name')
    .populate('designation_id', 'name')
    .lean();
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));
  return employeeIds
    .map((id) => {
      const idStr = id.toString();
      const emp = byId.get(idStr);
      return mapEmployeeToDetail(emp, idStr);
    })
    .sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));
}

async function findSalaryPendingInEmployeeQuery(employeeQuery) {
  const q =
    employeeQuery && typeof employeeQuery === 'object'
      ? { $and: [employeeQuery, { salaryStatus: { $ne: 'approved' } }] }
      : { salaryStatus: { $ne: 'approved' } };
  const docs = await Employee.find(q)
    .select('_id emp_no employee_name doj department_id designation_id salaryStatus')
    .populate('department_id', 'name')
    .populate('designation_id', 'name')
    .lean();
  return docs
    .map((d) => mapEmployeeToDetail(d, d._id.toString()))
    .sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));
}

function buildSalaryPendingApprovalMessage(details) {
  if (!details?.length) {
    return 'Cannot approve: some employees still have salary pending approval.';
  }
  const labels = details.map(formatEmployeeLabel);
  const shown = labels.slice(0, 8);
  const suffix = labels.length > 8 ? ` (+${labels.length - 8} more)` : '';
  return `Cannot approve: finalize salary and recalculate payroll for: ${shown.join(', ')}${suffix}`;
}

function createSalaryPendingApprovalError(details) {
  const error = new Error(buildSalaryPendingApprovalMessage(details));
  error.code = 'SALARY_PENDING';
  error.salaryPendingEmployees = details;
  return error;
}

module.exports = {
  isEmployeeSalaryPending,
  salaryApprovedQueryFragment,
  filterPayrollRecordsExcludingSalaryPending,
  resolveSalaryPendingEmployeeDetails,
  findSalaryPendingInEmployeeQuery,
  buildSalaryPendingApprovalMessage,
  createSalaryPendingApprovalError,
};
