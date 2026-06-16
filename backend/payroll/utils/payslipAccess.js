const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const Settings = require('../../settings/model/Settings');
const { getEmployeeIdsInScope } = require('../../shared/middleware/dataScopeMiddleware');

const PAYSLIP_ADMIN_ROLES = ['super_admin', 'sub_admin', 'hr'];

/** Payment batch must be frozen or completed before payslips can be released to employees */
const PAYSLIP_BATCH_RELEASABLE_STATUSES = ['freeze', 'complete'];

const PAYSLIP_INELIGIBLE_RECORD_STATUSES = ['draft', 'cancelled'];

function getPayrollBatchStatus(record) {
  const batch = record?.payrollBatchId;
  if (!batch) return null;
  if (typeof batch === 'object' && batch.status) return batch.status;
  return null;
}

function isPayrollRecordReleased(record) {
  return record?.isReleased === true;
}

function getReleaseBlockReason(record) {
  if (!record) return 'ineligible_status';
  if (isPayrollRecordReleased(record)) return 'already_released';
  if (PAYSLIP_INELIGIBLE_RECORD_STATUSES.includes(record.status)) return 'ineligible_status';
  const batchStatus = getPayrollBatchStatus(record);
  if (!batchStatus) return 'no_batch';
  if (!PAYSLIP_BATCH_RELEASABLE_STATUSES.includes(batchStatus)) return 'batch_not_ready';
  return 'pending';
}

function canReleasePayrollRecord(record) {
  return getReleaseBlockReason(record) === 'pending';
}

function summarizePayrollReleaseRecords(records) {
  let alreadyReleased = 0;
  let pendingRelease = 0;
  let batchNotReady = 0;
  let noBatch = 0;
  let notEligible = 0;

  for (const r of records || []) {
    switch (getReleaseBlockReason(r)) {
      case 'already_released':
        alreadyReleased += 1;
        break;
      case 'pending':
        pendingRelease += 1;
        break;
      case 'batch_not_ready':
        batchNotReady += 1;
        break;
      case 'no_batch':
        noBatch += 1;
        break;
      default:
        notEligible += 1;
        break;
    }
  }

  return {
    total: (records || []).length,
    alreadyReleased,
    pendingRelease,
    batchNotReady,
    noBatch,
    notEligible,
  };
}

function formatReleaseStatsMessage(stats, newlyReleased = 0) {
  if (newlyReleased > 0) {
    const parts = [`Released ${newlyReleased} payslip(s)`];
    if (stats.alreadyReleased > 0) parts.push(`${stats.alreadyReleased} already released`);
    if (stats.batchNotReady > 0) parts.push(`${stats.batchNotReady} awaiting batch freeze/complete`);
    if (stats.noBatch > 0) parts.push(`${stats.noBatch} not linked to a payment batch`);
    if (stats.notEligible > 0) parts.push(`${stats.notEligible} ineligible (draft/cancelled)`);
    return parts.join('. ') + '.';
  }

  const parts = ['Nothing to release'];
  if (stats.alreadyReleased > 0) parts.push(`${stats.alreadyReleased} already released`);
  if (stats.batchNotReady > 0) parts.push(`${stats.batchNotReady} awaiting batch freeze/complete`);
  if (stats.noBatch > 0) parts.push(`${stats.noBatch} not linked to a payment batch`);
  if (stats.notEligible > 0) parts.push(`${stats.notEligible} ineligible (draft/cancelled)`);
  if (stats.pendingRelease === 0 && stats.batchNotReady > 0) {
    parts.push('freeze or complete the payment batch first');
  }
  return parts.join('. ') + '.';
}

function resolveFeatureControl(user) {
  if (!user) return [];
  let effectivePermissions = [...(user.featureControl || [])];

  if (user.customRoles && Array.isArray(user.customRoles)) {
    user.customRoles.forEach((role) => {
      if (role.isActive && Array.isArray(role.activeModules)) {
        effectivePermissions = [...new Set([...effectivePermissions, ...role.activeModules])];
      }
    });
  }

  return effectivePermissions;
}

function isPayslipAdmin(user) {
  return Boolean(user && PAYSLIP_ADMIN_ROLES.includes(user.role));
}

function hasPayslipRead(user) {
  if (!user) return false;
  if (isPayslipAdmin(user)) return true;
  const fc = resolveFeatureControl(user);
  if (!fc.length) return true;
  return (
    fc.includes('PAYSLIPS') ||
    fc.includes('PAYSLIPS:read') ||
    fc.includes('PAYSLIPS:write') ||
    fc.includes('PAYSLIPS:release')
  );
}

/** PAYSLIPS:write (or admin) — view payslips for employees within data scope */
function hasPayslipScoped(user) {
  if (!user) return false;
  if (isPayslipAdmin(user)) return true;
  const fc = resolveFeatureControl(user);
  if (!fc.length) {
    return ['hod', 'manager'].includes(user.role);
  }
  return fc.includes('PAYSLIPS:write') || fc.includes('PAYSLIPS');
}

function hasPayslipRelease(user) {
  if (!user) return false;
  if (user.role === 'super_admin' || user.role === 'sub_admin') return true;
  if (user.role === 'hr') return true;
  const fc = resolveFeatureControl(user);
  if (!fc.length) return ['hod', 'manager'].includes(user.role);
  return fc.includes('PAYSLIPS:release');
}

function isSelfOnlyPayslipViewer(user) {
  return hasPayslipRead(user) && !hasPayslipScoped(user);
}

async function resolveOwnEmployeeObjectId(req, actor) {
  const directRef = req?.user?.employeeRef || actor?.employeeRef;
  if (directRef) return directRef;

  const empNo = req?.user?.employeeId || actor?.employeeId;
  if (empNo) {
    const normalized = String(empNo).trim().toUpperCase();
    const employee = await Employee.findOne({ emp_no: normalized }).select('_id').lean();
    if (employee?._id) return employee._id;
  }

  return null;
}

async function loadPayslipActor(req) {
  if (req.payslipActor) return req.payslipActor;

  const userId = req.user?.userId || req.user?._id;
  let user = null;

  if (userId) {
    user = await User.findById(userId)
      .select('role featureControl dataScope divisionMapping customRoles employeeId employeeRef')
      .populate('customRoles');
  }

  // Employee-direct login: JWT userId is Employee._id, not a User document
  if (!user && req.user) {
    user = {
      role: req.user.role || 'employee',
      featureControl: [],
      dataScope: req.user.dataScope || 'own',
      divisionMapping: req.user.divisionMapping || [],
      employeeRef: req.user.employeeRef,
      employeeId: req.user.employeeId,
    };
  }

  req.payslipActor = user;
  return user;
}

async function getViewableEmployeeIds(user, req = null) {
  if (isPayslipAdmin(user)) return null;
  if (!hasPayslipScoped(user)) {
    const ownId = await resolveOwnEmployeeObjectId(req, user);
    return ownId ? [ownId] : [];
  }
  const scoped = await getEmployeeIdsInScope(user);
  const ownId = await resolveOwnEmployeeObjectId(req, user);
  const ids = new Set(scoped.map((id) => id.toString()));
  if (ownId) ids.add(ownId.toString());
  return Array.from(ids);
}

async function applySelfViewPayrollFilters(query) {
  const releaseRequiredSetting = await Settings.findOne({ key: 'payslip_release_required' });
  if (releaseRequiredSetting && releaseRequiredSetting.value === true) {
    query.isReleased = true;
  }

  const historyMonthsSetting = await Settings.findOne({ key: 'payslip_history_months' });
  if (historyMonthsSetting && historyMonthsSetting.value > 0) {
    const monthsOffset = parseInt(historyMonthsSetting.value, 10);
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOffset);
    const cutoffMonth = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`;

    if (typeof query.month === 'string') {
      if (query.month < cutoffMonth) {
        query._id = null;
      }
    } else {
      query.month = { ...(typeof query.month === 'object' && query.month ? query.month : {}), $gte: cutoffMonth };
    }
  }
}

async function assertCanViewPayrollRecord(user, payrollRecord, req = null) {
  if (!user || !payrollRecord) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  if (isPayslipAdmin(user)) return;

  const empId = (payrollRecord.employeeId?._id || payrollRecord.employeeId)?.toString?.();
  const viewableIds = await getViewableEmployeeIds(user, req);
  if (!viewableIds || !empId || !viewableIds.some((id) => id.toString() === empId)) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }

  if (isSelfOnlyPayslipViewer(user)) {
    const releaseRequiredSetting = await Settings.findOne({ key: 'payslip_release_required' });
    if (releaseRequiredSetting && releaseRequiredSetting.value === true && !payrollRecord.isReleased) {
      const err = new Error('Payslip not yet released');
      err.statusCode = 403;
      throw err;
    }

    const historyMonthsSetting = await Settings.findOne({ key: 'payslip_history_months' });
    if (historyMonthsSetting && historyMonthsSetting.value > 0 && payrollRecord.month) {
      const monthsOffset = parseInt(historyMonthsSetting.value, 10);
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - monthsOffset);
      const cutoffMonth = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`;
      if (payrollRecord.month < cutoffMonth) {
        const err = new Error('Historical payslip access limit exceeded');
        err.statusCode = 403;
        throw err;
      }
    }
  }
}

function assertCanReleasePayslips(user) {
  if (!hasPayslipRelease(user)) {
    const err = new Error('You do not have permission to release payslips');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = {
  PAYSLIP_ADMIN_ROLES,
  PAYSLIP_BATCH_RELEASABLE_STATUSES,
  PAYSLIP_INELIGIBLE_RECORD_STATUSES,
  resolveFeatureControl,
  isPayslipAdmin,
  hasPayslipRead,
  hasPayslipScoped,
  hasPayslipRelease,
  isSelfOnlyPayslipViewer,
  resolveOwnEmployeeObjectId,
  loadPayslipActor,
  getViewableEmployeeIds,
  applySelfViewPayrollFilters,
  assertCanViewPayrollRecord,
  assertCanReleasePayslips,
  isPayrollRecordReleased,
  getPayrollBatchStatus,
  getReleaseBlockReason,
  canReleasePayrollRecord,
  summarizePayrollReleaseRecords,
  formatReleaseStatsMessage,
};
