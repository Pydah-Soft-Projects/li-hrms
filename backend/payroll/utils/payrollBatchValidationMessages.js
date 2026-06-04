const Employee = require('../../employees/model/Employee');

const MAX_LABELS_IN_MESSAGE = 8;

function formatDojDate(doj) {
    if (!doj) return '';
    const d = doj instanceof Date ? doj : new Date(doj);
    if (Number.isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatEmployeeLabel(emp) {
    const code = emp?.emp_no || '?';
    const name = emp?.employee_name || 'Unknown';
    return `${code} - ${name}`;
}

function mapEmployeeToDetail(emp, employeeId) {
    const department = emp?.department_id;
    const designation = emp?.designation_id;
    return {
        employeeId,
        emp_no: emp?.emp_no || '',
        employee_name: emp?.employee_name || 'Unknown',
        department_name:
            (typeof department === 'object' && department?.name) ||
            (typeof department === 'string' ? department : '') ||
            '',
        designation_name:
            (typeof designation === 'object' && designation?.name) ||
            (typeof designation === 'string' ? designation : '') ||
            '',
        doj: formatDojDate(emp?.doj),
    };
}

/**
 * Resolve missing employee IDs to display fields (sorted by emp_no).
 */
async function resolveMissingEmployeeDetails(missingEmployeeIds) {
    if (!missingEmployeeIds?.length) return [];

    const docs = await Employee.find({ _id: { $in: missingEmployeeIds } })
        .select('emp_no employee_name doj department_id designation_id')
        .populate('department_id', 'name')
        .populate('designation_id', 'name')
        .lean();

    const byId = new Map(docs.map((d) => [d._id.toString(), d]));

    return missingEmployeeIds
        .map((id) => {
            const idStr = id.toString();
            const emp = byId.get(idStr);
            return mapEmployeeToDetail(emp, id);
        })
        .sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));
}

function buildMissingPayrollApprovalMessage(details) {
    if (!details?.length) {
        return 'Cannot approve: Not all employees have payroll calculated';
    }
    const labels = details.map(formatEmployeeLabel);
    const shown = labels.slice(0, MAX_LABELS_IN_MESSAGE);
    const suffix =
        labels.length > MAX_LABELS_IN_MESSAGE
            ? ` (+${labels.length - MAX_LABELS_IN_MESSAGE} more)`
            : '';
    return `Cannot approve: payroll not calculated for: ${shown.join(', ')}${suffix}`;
}

function createMissingPayrollApprovalError(details) {
    const error = new Error(buildMissingPayrollApprovalMessage(details));
    error.code = 'MISSING_PAYROLL';
    error.missingEmployees = details;
    return error;
}

module.exports = {
    formatDojDate,
    formatEmployeeLabel,
    mapEmployeeToDetail,
    resolveMissingEmployeeDetails,
    buildMissingPayrollApprovalMessage,
    createMissingPayrollApprovalError,
    MAX_LABELS_IN_MESSAGE,
};
