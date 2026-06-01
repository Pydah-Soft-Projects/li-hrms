/**
 * Shared register grid values for PDF / Excel export (matches LeaveRegisterPage grid).
 */

const mongoose = require('mongoose');
const { getEmployeeIdsInScope } = require('../../shared/middleware/dataScopeMiddleware');
const leaveRegisterService = require('./leaveRegisterService');
const Department = require('../../departments/model/Department');

function exportCellNum(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n - Math.round(n)) < 0.001) return Math.round(n);
  return Math.round(n * 100) / 100;
}

function policyPoolDays(rm, kind) {
  if (!rm) return '';
  if (kind === 'cl') {
    if (rm.policyScheduledCl != null && Number.isFinite(Number(rm.policyScheduledCl))) {
      return exportCellNum(rm.policyScheduledCl);
    }
    const ti = Number(rm.cl?.transferIn) || 0;
    if (rm.scheduledCl != null && Number.isFinite(Number(rm.scheduledCl))) {
      return exportCellNum(Math.max(0, Number(rm.scheduledCl) - ti));
    }
    return exportCellNum(rm.scheduledCl);
  }
  if (kind === 'ccl') {
    if (rm.policyScheduledCco != null && Number.isFinite(Number(rm.policyScheduledCco))) {
      return exportCellNum(rm.policyScheduledCco);
    }
    const ti = Number(rm.ccl?.transferIn) || 0;
    if (rm.scheduledCco != null && Number.isFinite(Number(rm.scheduledCco))) {
      return exportCellNum(Math.max(0, Number(rm.scheduledCco) - ti));
    }
    return exportCellNum(rm.scheduledCco);
  }
  if (kind === 'el') {
    if (rm.policyScheduledEl != null && Number.isFinite(Number(rm.policyScheduledEl))) {
      return exportCellNum(rm.policyScheduledEl);
    }
    const ti = Number(rm.el?.transferIn) || 0;
    if (rm.scheduledEl != null && Number.isFinite(Number(rm.scheduledEl))) {
      return exportCellNum(Math.max(0, Number(rm.scheduledEl) - ti));
    }
    return exportCellNum(rm.scheduledEl);
  }
  return '';
}

function bucket(rm, kind) {
  if (kind === 'cl') return rm?.cl;
  if (kind === 'ccl') return rm?.ccl;
  return rm?.el;
}

function registerTransferIn(rm, kind) {
  const b = bucket(rm, kind);
  if (b?.transferIn != null && Number.isFinite(Number(b.transferIn))) return exportCellNum(b.transferIn);
  return '';
}

function registerTransferOut(rm, kind) {
  const b = bucket(rm, kind);
  if (b?.transferOut != null && Number.isFinite(Number(b.transferOut))) return exportCellNum(b.transferOut);
  if (b?.transfer != null && Number.isFinite(Number(b.transfer))) return exportCellNum(b.transfer);
  return '';
}

/** Matches UI Used column: approved debits + pending lock. */
function registerUsedPlusLocked(rm, kind) {
  const b = bucket(rm, kind);
  const u = b?.used != null && Number.isFinite(Number(b.used)) ? Number(b.used) : null;
  const l = b?.locked != null && Number.isFinite(Number(b.locked)) ? Number(b.locked) : null;
  if (u === null && l === null) return '';
  return exportCellNum((u ?? 0) + (l ?? 0));
}

/** Matches UI Bal column: Cr + carried in − (used + locked) − transfer out. */
function registerMonthEquationBal(rm, kind) {
  const crRaw = policyPoolDays(rm, kind);
  const cr = crRaw === '' ? null : Number(crRaw);
  const b = bucket(rm, kind);
  const tin = b?.transferIn != null && Number.isFinite(Number(b.transferIn)) ? Number(b.transferIn) : null;
  const toutRaw = registerTransferOut(rm, kind);
  const tout = toutRaw === '' ? null : Number(toutRaw);
  const u = b?.used != null && Number.isFinite(Number(b.used)) ? Number(b.used) : 0;
  const l = b?.locked != null && Number.isFinite(Number(b.locked)) ? Number(b.locked) : 0;
  if (cr === null && tin === null && tout === null && b?.used == null && b?.locked == null) return '';
  return exportCellNum((cr ?? 0) + (tin ?? 0) - u - l - (tout ?? 0));
}

function registerRowSlice(rm, kind) {
  return [
    policyPoolDays(rm, kind),
    registerTransferIn(rm, kind),
    registerUsedPlusLocked(rm, kind),
    registerTransferOut(rm, kind),
    registerMonthEquationBal(rm, kind),
  ];
}

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
    employee_group_id,
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
    employee_group_id:
      employee_group_id && mongoose.Types.ObjectId.isValid(String(employee_group_id))
        ? new mongoose.Types.ObjectId(String(employee_group_id))
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

  const registerResult = await leaveRegisterService.getLeaveRegister(filters, monthNum, yearNum);
  const groupedData = Array.isArray(registerResult)
    ? registerResult
    : registerResult?.entries || [];

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
  if (filters.designationId) {
    const Designation = require('../../departments/model/Designation');
    const des = await Designation.findById(filters.designationId).select('name').lean();
    if (des?.name) filterParts.push(`Designation: ${des.name}`);
  }
  if (filters.employee_group_id) {
    const EmployeeGroup = require('../../employees/model/EmployeeGroup');
    const grp = await EmployeeGroup.findById(filters.employee_group_id).select('name').lean();
    if (grp?.name) filterParts.push(`Group: ${grp.name}`);
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
  exportCellNum,
  policyPoolDays,
  registerTransferIn,
  registerTransferOut,
  registerUsedPlusLocked,
  registerMonthEquationBal,
  registerRowSlice,
};
