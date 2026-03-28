/**
 * Shared query resolution for leave register PDF / Excel exports (same filters & scope as list).
 */

const mongoose = require('mongoose');
const { getEmployeeIdsInScope } = require('../../shared/middleware/dataScopeMiddleware');
const leaveRegisterService = require('./leaveRegisterService');
const Department = require('../../departments/model/Department');

function parseIncludeLeaveTypeFlag(v) {
  if (v === undefined || v === null || String(v).trim() === '') return true;
  const s = String(v).toLowerCase().trim();
  if (s === '0' || s === 'false' || s === 'no') return false;
  return true;
}

/**
 * @returns {Promise<
 *   | { ok: true; groupedData: any[]; filterParts: string[]; includeCL: boolean; includeCCL: boolean; includeEL: boolean; filters: object }
 *   | { ok: false; status: number; message: string }
 * >}
 */
async function resolveLeaveRegisterExportRequest(req) {
  const user = req.scopedUser;
  if (!user) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  const {
    financialYear,
    month: monthQ,
    year: yearQ,
    departmentId,
    divisionId,
    designationId,
    employeeId,
    empNo,
    search,
    includeCL: includeCLQ,
    includeCCL: includeCCLQ,
    includeEL: includeELQ,
  } = req.query;

  const includeCL = parseIncludeLeaveTypeFlag(includeCLQ);
  const includeCCL = parseIncludeLeaveTypeFlag(includeCCLQ);
  const includeEL = parseIncludeLeaveTypeFlag(includeELQ);

  if (!includeCL && !includeCCL && !includeEL) {
    return {
      ok: false,
      status: 400,
      message: 'Select at least one leave type (casual, compensatory, or earned).',
    };
  }

  const monthNum =
    monthQ != null && String(monthQ).trim() !== '' ? parseInt(String(monthQ), 10) : null;
  const yearNum =
    yearQ != null && String(yearQ).trim() !== '' ? parseInt(String(yearQ), 10) : null;

  const filters = {
    financialYear: financialYear && String(financialYear).trim() ? String(financialYear).trim() : undefined,
    divisionId:
      divisionId && mongoose.Types.ObjectId.isValid(String(divisionId))
        ? new mongoose.Types.ObjectId(String(divisionId))
        : undefined,
    departmentId:
      departmentId && mongoose.Types.ObjectId.isValid(String(departmentId))
        ? new mongoose.Types.ObjectId(String(departmentId))
        : undefined,
    designationId:
      designationId && mongoose.Types.ObjectId.isValid(String(designationId))
        ? new mongoose.Types.ObjectId(String(designationId))
        : undefined,
    employeeId:
      employeeId && mongoose.Types.ObjectId.isValid(String(employeeId))
        ? new mongoose.Types.ObjectId(String(employeeId))
        : undefined,
    empNo: empNo && String(empNo).trim() ? String(empNo).trim() : undefined,
    searchTerm: search && String(search).trim() ? String(search).trim() : undefined,
  };

  const fullAccess =
    user.role === 'super_admin' || user.role === 'sub_admin' || user.dataScope === 'all';

  if (!fullAccess) {
    filters.employeeIds = await getEmployeeIdsInScope(user);
    if (user.employeeRef) {
      const userEmployeeRef = user.employeeRef.toString();
      if (!filters.employeeIds.some((id) => id.toString() === userEmployeeRef)) {
        filters.employeeIds.push(user.employeeRef);
      }
    }
  }

  const groupedData = await leaveRegisterService.getLeaveRegister(filters, monthNum, yearNum);

  const filterParts = [
    `Exported (India time): ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
  ];
  if (filters.financialYear) filterParts.push(`Financial year ${filters.financialYear}`);
  if (filters.searchTerm) filterParts.push(`Name or staff number contains: "${filters.searchTerm}"`);
  if (filters.divisionId) {
    const Division = require('../../departments/model/Division');
    const div = await Division.findById(filters.divisionId).select('name').lean();
    if (div?.name) filterParts.push(`Division: ${div.name}`);
  }
  if (filters.departmentId) {
    const dept = await Department.findById(filters.departmentId).select('name').lean();
    if (dept?.name) filterParts.push(`Department: ${dept.name}`);
  }
  const typeLabels = [
    includeCL && 'Casual leave',
    includeCCL && 'Compensatory leave',
    includeEL && 'Earned leave',
  ].filter(Boolean);
  if (typeLabels.length) filterParts.push(`Leave types included: ${typeLabels.join(', ')}`);

  return {
    ok: true,
    groupedData,
    filterParts,
    includeCL,
    includeCCL,
    includeEL,
    filters,
  };
}

module.exports = {
  resolveLeaveRegisterExportRequest,
  parseIncludeLeaveTypeFlag,
};
