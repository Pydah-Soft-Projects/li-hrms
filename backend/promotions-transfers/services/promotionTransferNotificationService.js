const PromotionTransferRequest = require('../model/PromotionTransferRequest');
const User = require('../../users/model/User');
const { createNotifications } = require('../../notifications/services/notificationService');
const {
  uniqueIds,
  isObjectIdLike,
  resolveSuperAdminUserIds,
  resolveScopedUserIdsForEmployee,
  resolveEmployeePortalUserIds,
} = require('../../shared/utils/scopedNotificationRecipients');

function idsDiffer(a, b) {
  const sa = a ? a.toString() : '';
  const sb = b ? b.toString() : '';
  return sa !== sb;
}

function orgLabel(node) {
  if (!node || typeof node !== 'object') return null;
  return node.name || null;
}

/**
 * In-app notifications after final approval: super admins + sub admins get full detail;
 * employee (portal user) + HR/HOD/manager/sub_admin scoped to both FROM and TO division/department
 * get a summary (when org changes). Salary-only / same org: employee + detail admins only.
 */
async function notifyPromotionTransferCompleted(requestDoc, approver) {
  try {
  const populated = await PromotionTransferRequest.findById(requestDoc._id)
    .populate('employeeId', 'employee_name emp_no')
    .populate('fromDivisionId', 'name')
    .populate('fromDepartmentId', 'name')
    .populate('fromDesignationId', 'name')
    .populate('toDivisionId', 'name')
    .populate('toDepartmentId', 'name')
    .populate('toDesignationId', 'name')
    .populate('proposedDesignationId', 'name')
    .lean();

  if (!populated) return { detailCount: 0, summaryCount: 0, skipped: true };

  const approverIdStr = String(approver?._id || approver?.userId || '');
  const emp = populated.employeeId;
  const employeeName = emp?.employee_name || populated.emp_no || 'Employee';
  const empNo = populated.emp_no || emp?.emp_no || '';

  const fromDiv = populated.fromDivisionId?._id || populated.fromDivisionId;
  const toDiv = populated.toDivisionId?._id || populated.toDivisionId;
  const fromDept = populated.fromDepartmentId?._id || populated.fromDepartmentId;
  const toDept = populated.toDepartmentId?._id || populated.toDepartmentId;

  const hasOrgMove =
    populated.requestType === 'transfer' ||
    idsDiffer(fromDiv, toDiv) ||
    idsDiffer(fromDept, toDept);

  const toDivId = toDiv || null;
  const toDeptId = toDept || null;
  const fromDivId = fromDiv || null;
  const fromDeptId = fromDept || null;

  const [superAdminIds, subAdminRows, employeeUserIds] = await Promise.all([
    resolveSuperAdminUserIds(),
    User.find({
      isActive: true,
      $or: [{ role: 'sub_admin' }, { roles: 'sub_admin' }],
    })
      .select('_id')
      .lean(),
    resolveEmployeePortalUserIds({
      _id: emp?._id || populated.employeeId,
      emp_no: empNo,
    }),
  ]);
  const subAdminIds = subAdminRows.map((u) => String(u._id));

  let toScopedIds = [];
  if (hasOrgMove && (toDivId || toDeptId)) {
    toScopedIds = await resolveScopedUserIdsForEmployee({
      divisionId: toDivId,
      departmentId: toDeptId || null,
      roles: ['hr', 'hod', 'manager', 'sub_admin'],
    });
  }
  let fromScopedIds = [];
  if (
    hasOrgMove &&
    (fromDivId || fromDeptId) &&
    (idsDiffer(fromDiv, toDiv) || idsDiffer(fromDept, toDept))
  ) {
    fromScopedIds = await resolveScopedUserIdsForEmployee({
      divisionId: fromDivId,
      departmentId: fromDeptId || null,
      roles: ['hr', 'hod', 'manager', 'sub_admin'],
    });
  }
  const newScopedIds = uniqueIds([...toScopedIds, ...fromScopedIds]).filter(
    (id) => id !== approverIdStr
  );

  const fd = orgLabel(populated.fromDivisionId);
  const fdep = orgLabel(populated.fromDepartmentId);
  const fdes = orgLabel(populated.fromDesignationId);
  const td = orgLabel(populated.toDivisionId);
  const tdep = orgLabel(populated.toDepartmentId);
  const tdes =
    orgLabel(populated.toDesignationId) || orgLabel(populated.proposedDesignationId);

  const payrollLabel =
    populated.effectivePayrollYear && populated.effectivePayrollMonth
      ? `${populated.effectivePayrollYear}-${String(populated.effectivePayrollMonth).padStart(2, '0')}`
      : '—';

  const salaryLine =
    populated.previousGrossSalary != null || populated.newGrossSalary != null
      ? `Salary: ₹${populated.previousGrossSalary ?? '—'} → ₹${populated.newGrossSalary ?? '—'} (gross).`
      : '';

  const meta = {
    requestType: populated.requestType,
    empNo,
    employeeName,
    fromDivision: fd,
    fromDepartment: fdep,
    fromDesignation: fdes,
    toDivision: td,
    toDepartment: tdep,
    toDesignation: tdes,
    previousGrossSalary: populated.previousGrossSalary ?? null,
    newGrossSalary: populated.newGrossSalary ?? null,
    incrementAmount: populated.incrementAmount ?? null,
    effectivePayrollYear: populated.effectivePayrollYear ?? null,
    effectivePayrollMonth: populated.effectivePayrollMonth ?? null,
    remarks: populated.remarks || '',
    requestId: String(populated._id),
    approvedByName: approver?.name || null,
    approvedByRole: approver?.role || null,
    hasOrgMove,
  };

  const detailLines = [
    `Request type: ${populated.requestType}`,
    `Employee: ${employeeName} (${empNo})`,
    `Effective payroll month: ${payrollLabel}`,
    fd || fdep || fdes ? `From: ${[fd, fdep, fdes].filter(Boolean).join(' / ') || '—'}` : null,
    td || tdep || tdes ? `To: ${[td, tdep, tdes].filter(Boolean).join(' / ') || '—'}` : null,
    salaryLine || null,
    populated.remarks ? `Remarks: ${populated.remarks}` : null,
    `Approved by: ${approver?.name || '—'} (${approver?.role || '—'})`,
    `Request ID: ${populated._id}`,
  ].filter(Boolean);

  const detailMessage = detailLines.join('\n');
  const rt = populated.requestType || 'request';
  const detailTitle = `${rt.charAt(0).toUpperCase()}${rt.slice(1)} approved: ${employeeName} (${empNo})`;

  const detailRecipients = uniqueIds([...superAdminIds, ...subAdminIds]).filter(isObjectIdLike);
  let detailCount = 0;
  if (detailRecipients.length) {
    await createNotifications({
      recipientUserIds: detailRecipients,
      module: 'promotion_transfer',
      eventType: 'PROMOTION_TRANSFER_COMPLETED',
      title: detailTitle,
      message: detailMessage,
      priority: 'high',
      entityType: 'promotion_transfer_request',
      entityId: populated._id,
      actionUrl: '/promotions-transfers',
      meta,
      createdBy: approver?._id || approver?.userId || null,
      dedupeKey: `promotion_transfer:PROMOTION_TRANSFER_COMPLETED:detail:${populated._id}`,
    });
    detailCount = detailRecipients.length;
  }

  const detailSet = new Set(detailRecipients);
  const summaryRecipients = uniqueIds([...employeeUserIds, ...newScopedIds]).filter(
    (id) => isObjectIdLike(id) && !detailSet.has(id) && id !== approverIdStr
  );

  let summaryMessage = '';
  if (hasOrgMove && (td || tdep || fd || fdep)) {
    const fromLine = [fd, fdep].filter(Boolean).join(' / ') || '—';
    const toLine = [td, tdep].filter(Boolean).join(' / ') || '—';
    summaryMessage = `${employeeName} (${empNo}): org change from ${fromLine} to ${toLine}${tdes ? `, ${tdes}` : ''}.`;
  } else if (populated.requestType === 'increment' || populated.newGrossSalary != null) {
    summaryMessage = `${employeeName} (${empNo}): compensation update is effective (payroll ${payrollLabel}). ${salaryLine}`.trim();
  } else {
    summaryMessage = `${employeeName} (${empNo}): your ${populated.requestType} request has been approved (payroll ${payrollLabel}).`;
  }

  let summaryCount = 0;
  if (summaryRecipients.length) {
    await createNotifications({
      recipientUserIds: summaryRecipients,
      module: 'promotion_transfer',
      eventType: 'PROMOTION_TRANSFER_COMPLETED',
      title: detailTitle,
      message: summaryMessage,
      priority: 'high',
      entityType: 'promotion_transfer_request',
      entityId: populated._id,
      actionUrl: '/promotions-transfers',
      meta,
      createdBy: approver?._id || approver?.userId || null,
      dedupeKey: `promotion_transfer:PROMOTION_TRANSFER_COMPLETED:summary:${populated._id}`,
    });
    summaryCount = summaryRecipients.length;
  }

  return { detailCount, summaryCount, hasOrgMove, detailRecipients, summaryRecipients };
  } catch (err) {
    console.error('[promotionTransferNotificationService]', err?.message || err);
    throw err;
  }
}

module.exports = {
  notifyPromotionTransferCompleted,
  idsDiffer,
  orgLabel,
};
