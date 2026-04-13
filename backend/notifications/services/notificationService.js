const Notification = require('../model/Notification');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const { sendNotification, getIO } = require('../../shared/services/socketService');

const uniqueIds = (ids = []) => [...new Set(ids.map((id) => String(id)).filter(Boolean))];
const isObjectIdLike = (v) => /^[a-f0-9]{24}$/i.test(String(v || ''));

async function resolveUsersByRole(role, context = {}) {
  const users = await User.find({
    isActive: true,
    $or: [{ role }, { roles: role }],
  })
    .select('_id role dataScope divisionMapping employeeRef employeeId')
    .populate('employeeRef', 'department_id division_id')
    .lean();

  if (!context.employee) return users.map((u) => String(u._id));

  const employee = context.employee;
  const empDept = String(employee.department_id?._id || employee.department_id || '');
  const empDiv = String(employee.division_id?._id || employee.division_id || '');

  return users
    .filter((u) => {
      const scope = u.dataScope || 'all';
      if (['all', 'own'].includes(scope) || ['hr', 'sub_admin', 'super_admin'].includes(u.role)) return true;

      // Scope by linked employee profile.
      const uDept = String(u.employeeRef?.department_id || '');
      const uDiv = String(u.employeeRef?.division_id || '');
      if ((scope === 'department' || scope === 'departments') && empDept && uDept && empDept === uDept) return true;
      if ((scope === 'division' || scope === 'divisions') && empDiv && uDiv && empDiv === uDiv) return true;

      // Scope by explicit division mapping.
      const mappings = Array.isArray(u.divisionMapping) ? u.divisionMapping : [];
      for (const m of mappings) {
        const mappedDiv = String(m.division?._id || m.division || '');
        if (!mappedDiv || mappedDiv !== empDiv) continue;
        const mappedDepts = Array.isArray(m.departments) ? m.departments : [];
        if (mappedDepts.length === 0) return true;
        if (mappedDepts.some((d) => String(d?._id || d) === empDept)) return true;
      }

      return false;
    })
    .map((u) => String(u._id));
}

async function resolveUsersByRoleFallback(role) {
  const users = await User.find({
    isActive: true,
    $or: [{ role }, { roles: role }],
  }).select('_id').lean();
  return uniqueIds(users.map((u) => u._id));
}

async function resolveRequesterUserIds(record = {}) {
  const direct = [record.appliedBy, record.requestedBy, record.assignedBy]
    .map((u) => (u && typeof u === 'object' ? u._id : u))
    .filter(Boolean)
    .map(String);
  if (direct.length > 0) return uniqueIds(direct);

  const employeeId = record.employeeId && typeof record.employeeId === 'object' ? record.employeeId._id : record.employeeId;
  if (!employeeId) return [];

  const users = await User.find({
    isActive: true,
    $or: [{ employeeRef: employeeId }, { employeeId: record.emp_no }],
  })
    .select('_id')
    .lean();
  return uniqueIds(users.map((u) => u._id));
}

async function resolveEmployeeUserIds(record = {}) {
  const employeeId = record?.employeeId && typeof record.employeeId === 'object'
    ? record.employeeId._id
    : record?.employeeId;
  const empNo = record?.employeeId?.emp_no || record?.emp_no || null;

  if (!employeeId && !empNo) return [];

  const users = await User.find({
    isActive: true,
    $or: [
      ...(employeeId ? [{ employeeRef: employeeId }] : []),
      ...(empNo ? [{ employeeId: empNo }] : []),
    ],
  }).select('_id').lean();

  return uniqueIds(users.map((u) => u._id));
}

async function resolveGuarantorUserIds(record = {}) {
  const guarantors = Array.isArray(record?.guarantors) ? record.guarantors : [];
  if (!guarantors.length) return [];

  const employeeIds = guarantors
    .map((g) => (g?.employeeId && typeof g.employeeId === 'object' ? g.employeeId._id : g?.employeeId))
    .filter(Boolean);
  const empNos = guarantors.map((g) => g?.emp_no).filter(Boolean);

  if (!employeeIds.length && !empNos.length) return [];

  const users = await User.find({
    isActive: true,
    $or: [
      ...(employeeIds.length ? [{ employeeRef: { $in: employeeIds } }] : []),
      ...(empNos.length ? [{ employeeId: { $in: empNos } }] : []),
    ],
  }).select('_id').lean();

  return uniqueIds(users.map((u) => u._id));
}

async function resolveNextApproverUserIds(nextApproverRole, record = {}, employee = null) {
  const raw = String(nextApproverRole || '').trim();
  if (!raw) return [];

  // Sometimes workflow.nextApprover can be a direct user id.
  if (isObjectIdLike(raw)) return [raw];

  // Reporting manager is usually stored in workflow.reportingManagerIds.
  if (raw === 'reporting_manager') {
    const ids = Array.isArray(record?.workflow?.reportingManagerIds)
      ? record.workflow.reportingManagerIds.map(String).filter(Boolean)
      : [];
    if (ids.length === 0) return [];

    const users = await User.find({
      isActive: true,
      $or: [
        { _id: { $in: ids } },
        { employeeRef: { $in: ids.filter(isObjectIdLike) } },
        { employeeId: { $in: ids } },
      ],
    }).select('_id').lean();

    return uniqueIds(users.map((u) => u._id));
  }

  // Final authority generally resolves to HR unless explicitly configured to a user id.
  if (raw === 'final_authority') {
    const finalAuthority = String(record?.workflow?.finalAuthority || '').trim();
    if (finalAuthority && isObjectIdLike(finalAuthority)) return [finalAuthority];
    const role = finalAuthority && !isObjectIdLike(finalAuthority) ? finalAuthority : 'hr';
    const scoped = await resolveUsersByRole(role, { employee });
    if (scoped.length > 0) return scoped;
    return resolveUsersByRoleFallback(role);
  }

  // Standard role resolution.
  const scoped = await resolveUsersByRole(raw, { employee });
  if (scoped.length > 0) return scoped;
  return resolveUsersByRoleFallback(raw);
}

async function resolveSuperAdminUserIds() {
  const users = await User.find({
    isActive: true,
    $or: [{ role: 'super_admin' }, { roles: 'super_admin' }],
  }).select('_id').lean();
  return uniqueIds(users.map((u) => u._id));
}

async function createNotifications({
  recipientUserIds = [],
  module = 'system',
  eventType,
  title,
  message,
  priority = 'medium',
  entityType,
  entityId,
  actionUrl,
  meta = {},
  createdBy = null,
  dedupeKey = null,
}) {
  const ids = uniqueIds(recipientUserIds);
  if (!ids.length) return [];

  const docs = ids.map((recipientUserId) => ({
    recipientUserId,
    module,
    eventType,
    title,
    message,
    priority,
    entityType: entityType || module,
    entityId: entityId || null,
    actionUrl: actionUrl || null,
    meta,
    createdBy: createdBy || null,
    dedupeKey: dedupeKey ? `${dedupeKey}:${recipientUserId}` : null,
  }));

  const created = await Notification.insertMany(docs, { ordered: false });

  // Realtime emit + toast for online users.
  for (const n of created) {
    const unreadCount = await Notification.countDocuments({ recipientUserId: n.recipientUserId, isRead: false });
    sendNotification(String(n.recipientUserId), {
      type: priority === 'urgent' ? 'warning' : 'info',
      title,
      message,
    });
    try {
      const io = getIO();
      io.to(String(n.recipientUserId)).emit('in_app_notification', n);
      io.to(String(n.recipientUserId)).emit('notification_unread_count', { unreadCount });
    } catch (_) {
      // Socket may not be initialized in tests.
    }
  }

  return created;
}

async function notifyWorkflowEvent({
  module,
  eventType,
  record,
  actor,
  title,
  message,
  nextApproverRole = null,
  priority = 'medium',
}) {
  const actorId = actor?._id || actor?.userId || null;
  const requesterIds = await resolveRequesterUserIds(record);
  const employeeUserIds = await resolveEmployeeUserIds(record);
  const guarantorUserIds = await resolveGuarantorUserIds(record);

  let employee = null;
  if (record?.employeeId) {
    const employeeId = record.employeeId && typeof record.employeeId === 'object' ? record.employeeId._id : record.employeeId;
    if (employeeId) {
      employee = await Employee.findById(employeeId).select('department_id division_id emp_no employee_name').lean();
    }
  }

  const approverIds = nextApproverRole
    ? await resolveNextApproverUserIds(nextApproverRole, record, employee)
    : [];
  const superAdminIds = await resolveSuperAdminUserIds();

  const recipients = uniqueIds([
    ...requesterIds,
    ...employeeUserIds,
    ...guarantorUserIds,
    ...approverIds,
    ...superAdminIds,
  ]).filter((id) => String(id) !== String(actorId));

  return createNotifications({
    recipientUserIds: recipients,
    module,
    eventType,
    title,
    message,
    priority,
    entityType: module,
    entityId: record?._id || null,
    actionUrl: `/${module === 'od' || module === 'leave' ? 'leaves' : module === 'ot_permission' ? 'ot-permissions' : module}s`,
    meta: {
      status: record?.status,
      nextApproverRole: nextApproverRole || null,
      employeeName:
        record?.employeeId?.employee_name ||
        employee?.employee_name ||
        null,
      empNo: record?.employeeId?.emp_no || record?.emp_no || employee?.emp_no || null,
    },
    createdBy: actorId,
    dedupeKey: `${module}:${eventType}:${record?._id || ''}:${record?.status || ''}`,
  });
}

module.exports = {
  createNotifications,
  notifyWorkflowEvent,
};
