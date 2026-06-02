const PayRegisterSummary = require('../model/PayRegisterSummary');
const Employee = require('../../employees/model/Employee');
const { EMP_NO_SORT, EMP_NO_COLLATION, compareEmpNo } = require('../../shared/utils/employeeSort');
const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const FIELD_LABELS = {
  'firstHalf.status': '1st half status',
  'secondHalf.status': '2nd half status',
  'firstHalf.leaveType': '1st half leave type',
  'secondHalf.leaveType': '2nd half leave type',
  'firstHalf.leaveNature': '1st half leave nature',
  'secondHalf.leaveNature': '2nd half leave nature',
  otHours: 'OT hours',
  shiftId: 'Shift',
  shiftIds: 'Shifts',
  shiftSelections: 'Shift full/half',
  payableShifts: 'Payable shifts',
  isLate: 'Late in',
  isEarlyOut: 'Early out',
};

function formatExportValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object' && value._id) return String(value._id);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function humanizeField(field) {
  return FIELD_LABELS[field] || String(field || '').replace(/\./g, ' ');
}

/**
 * Build flat modification rows for pay register manual edits in a month.
 */
async function buildModificationRows(month, filters = {}) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Month must be in YYYY-MM format');
  }

  const { departmentId, divisionId, employeeGroupId, search, scopeFilter } = filters;
  const { buildPayRegisterEmployeeFilter } = require('./payRegisterEmployeeFilter');

  const [year, monthNum] = month.split('-').map(Number);
  const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
  const rangeStart = new Date(`${startDate}T00:00:00.000Z`);
  const rangeEnd = new Date(`${endDate}T23:59:59.999Z`);

  const employeeQuery = await buildPayRegisterEmployeeFilter(rangeStart, rangeEnd, {
    departmentId,
    divisionId,
    employeeGroupId,
    search,
    scopeFilter,
  });

  const employees = await Employee.find(employeeQuery)
    .select('_id employee_name emp_no department_id division_id designation_id')
    .populate('department_id', 'name')
    .populate('division_id', 'name')
    .populate('designation_id', 'name')
    .sort(EMP_NO_SORT)
    .collation(EMP_NO_COLLATION)
    .lean();

  if (employees.length === 0) {
    return { startDate, endDate, rows: [], employeeCount: 0, changeCount: 0 };
  }

  const employeeIds = employees.map((e) => e._id);
  const empMap = new Map(employees.map((e) => [String(e._id), e]));

  const payRegisters = await PayRegisterSummary.find({
    employeeId: { $in: employeeIds },
    month,
    'editHistory.0': { $exists: true },
  })
    .select('employeeId emp_no editHistory lastEditedAt')
    .lean();

  const flatRows = [];

  for (const pr of payRegisters) {
    const emp = empMap.get(String(pr.employeeId));
    if (!emp || !Array.isArray(pr.editHistory) || pr.editHistory.length === 0) continue;

    for (const edit of pr.editHistory) {
      flatRows.push({
        empNo: emp.emp_no || pr.emp_no || '-',
        employeeName: emp.employee_name || '-',
        division: emp.division_id?.name || 'N/A',
        department: emp.department_id?.name || 'N/A',
        designation: emp.designation_id?.name || 'N/A',
        date: edit.date || '-',
        field: edit.field || '-',
        fieldLabel: humanizeField(edit.field),
        oldValue: formatExportValue(edit.oldValue),
        newValue: formatExportValue(edit.newValue),
        editedByName: edit.editedByName || 'Unknown',
        editedByRole: edit.editedByRole || '-',
        editedAt: edit.editedAt
          ? dayjs(edit.editedAt).tz('Asia/Kolkata').format('DD MMM YYYY, hh:mm A')
          : '-',
        editedAtSort: edit.editedAt ? new Date(edit.editedAt).getTime() : 0,
        remarks: edit.remarks || '',
        sortEmpNo: emp.emp_no || pr.emp_no || '',
      });
    }
  }

  flatRows.sort((a, b) => {
    const empCmp = compareEmpNo(a.sortEmpNo, b.sortEmpNo);
    if (empCmp !== 0) return empCmp;
    if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
    return (a.editedAtSort || 0) - (b.editedAtSort || 0);
  });

  const uniqueEmployees = new Set(flatRows.map((r) => r.empNo));

  return {
    startDate,
    endDate,
    rows: flatRows,
    employeeCount: uniqueEmployees.size,
    changeCount: flatRows.length,
  };
}

function toExcelRows(flatRows) {
  return flatRows.map((r) => ({
    'Employee Code': r.empNo,
    'Employee Name': r.employeeName,
    Division: r.division,
    Department: r.department,
    Designation: r.designation,
    Date: r.date,
    Field: r.fieldLabel,
    'Old Value': r.oldValue,
    'New Value': r.newValue,
    'Edited By': r.editedByName,
    Role: r.editedByRole,
    'Edited At': r.editedAt,
    Remarks: r.remarks || '',
  }));
}

module.exports = {
  buildModificationRows,
  toExcelRows,
  formatExportValue,
  humanizeField,
};
