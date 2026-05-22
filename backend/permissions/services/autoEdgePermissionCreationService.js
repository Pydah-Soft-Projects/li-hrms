const Permission = require('../model/Permission');
const AutoEdgePermissionSettings = require('../model/AutoEdgePermissionSettings');
const Employee = require('../../employees/model/Employee');
const User = require('../../users/model/User');

const AUTO_SOURCE = 'auto_edge';
const AUTO_PURPOSE = 'Auto-created by attendance late-in / early-out policy';
const REJECTED_STATUSES = ['rejected', 'manager_rejected'];
const FINAL_EDGE_STATUSES = ['checked_in', 'checked_out'];

function toMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function toTimeString(totalMinutes) {
  const minsInDay = 24 * 60;
  const normalized = ((Math.round(totalMinutes) % minsInDay) + minsInDay) % minsInDay;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function deriveShiftDurationHours(shift) {
  const expected = Number(shift?.expectedHours);
  if (Number.isFinite(expected) && expected > 0) return expected;

  const start = toMinutes(shift?.shiftStartTime);
  const endRaw = toMinutes(shift?.shiftEndTime);
  if (start == null || endRaw == null) return null;
  const end = endRaw <= start ? endRaw + 24 * 60 : endRaw;
  const duration = (end - start) / 60;
  return duration > 0 ? Math.round(duration * 100) / 100 : null;
}

function findMatchingRange(ranges, shiftDurationHours) {
  if (!Array.isArray(ranges) || !Number.isFinite(shiftDurationHours)) return null;
  return ranges.find((range) => {
    const min = Number(range.minShiftHours);
    const max = Number(range.maxShiftHours);
    return Number.isFinite(min) && Number.isFinite(max) && shiftDurationHours >= min && shiftDurationHours <= max;
  }) || null;
}

function getRuleSet(settings, permissionType) {
  return permissionType === 'late_in' ? settings?.lateInRules : settings?.earlyOutRules;
}

function isTypeEnabled(settings, permissionType) {
  if (!settings?.isEnabled) return false;
  if (settings.applyFor === 'both') return true;
  return settings.applyFor === permissionType;
}

function getDetectedMinutes(shift, permissionType) {
  return permissionType === 'late_in'
    ? Number(shift?.lateInMinutes) || 0
    : Number(shift?.earlyOutMinutes) || 0;
}

function getPermittedEdgeTime(shift, permissionType, allowedMinutes) {
  if (permissionType === 'late_in') {
    const start = toMinutes(shift?.shiftStartTime);
    return start == null ? null : toTimeString(start + allowedMinutes);
  }
  const end = toMinutes(shift?.shiftEndTime);
  return end == null ? null : toTimeString(end - allowedMinutes);
}

function getClockTimeFromDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function isOvernightShift(shift) {
  const start = toMinutes(shift?.shiftStartTime);
  const end = toMinutes(shift?.shiftEndTime);
  return start != null && end != null && end <= start;
}

function dateStrAfter(dateStr, daysToAdd) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  d.setDate(d.getDate() + daysToAdd);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeOnAttendanceDate(dateStr, timeStr, nextDay = false) {
  if (!dateStr || !timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = nextDay ? dateStrAfter(dateStr, 1) : dateStr;
  return new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);
}

function getShiftBoundaryTime(attendanceDate, shift, boundary) {
  const overnight = isOvernightShift(shift);
  if (boundary === 'start') {
    return timeOnAttendanceDate(attendanceDate, shift?.shiftStartTime, false);
  }
  return timeOnAttendanceDate(attendanceDate, shift?.shiftEndTime, overnight);
}

function getActualEdgeTime(shift, permissionType) {
  return permissionType === 'late_in'
    ? getClockTimeFromDate(shift?.inTime)
    : getClockTimeFromDate(shift?.outTime);
}

function getPermissionWindow(attendanceDate, shift, permissionType) {
  const actual = permissionType === 'late_in' ? shift?.inTime : shift?.outTime;
  const actualDate = actual ? new Date(actual) : null;
  if (!actualDate || Number.isNaN(actualDate.getTime())) return null;

  if (permissionType === 'late_in') {
    const shiftStart = getShiftBoundaryTime(attendanceDate, shift, 'start');
    if (!shiftStart) return null;
    return { startTime: shiftStart, endTime: actualDate };
  }

  const shiftEnd = getShiftBoundaryTime(attendanceDate, shift, 'end');
  if (!shiftEnd) return null;
  return { startTime: actualDate, endTime: shiftEnd };
}

function getGrantedMinutesFromWindow(window) {
  if (!window?.startTime || !window?.endTime) return 0;
  return Math.max(
    0,
    Math.round(((window.endTime.getTime() - window.startTime.getTime()) / 60000) * 100) / 100
  );
}

function buildAutoPermissionExplanation(edge, grantedMinutes) {
  const kind = edge.permissionType === 'late_in' ? 'late-in' : 'early-out';
  const detected = Math.round((Number(edge.detectedMinutes) || 0) * 100) / 100;
  const allowed = Math.round((Number(edge.allowedMinutes) || 0) * 100) / 100;
  const minimum = Math.round((Number(edge.minimumMinutes) || 0) * 100) / 100;
  const shiftName = edge.shift?.shiftName ? ` for ${edge.shift.shiftName}` : '';
  return `Auto-created and system verified because attendance detected ${detected} minutes ${kind}${shiftName}. Global auto permission range matched ${edge.shiftDurationHours} shift hours with minimum ${minimum} minutes and allowed up to ${allowed} minutes. Granted ${grantedMinutes} minutes from the shift edge to the actual punch time.`;
}

function completeAutoWorkflow(permission, actorId, edge, comments) {
  const existingWorkflow = permission.workflow || {};
  const approvalChain = Array.isArray(existingWorkflow.approvalChain)
    ? existingWorkflow.approvalChain.map((step) => ({
      ...step,
      status: step.status === 'rejected' ? 'rejected' : 'approved',
      isCurrent: false,
      actionBy: step.actionBy || actorId,
      actionAt: step.actionAt || new Date(),
      comments: step.comments || comments,
    }))
    : [];

  permission.workflow = {
    ...existingWorkflow,
    currentStepRole: null,
    nextApproverRole: null,
    nextApprover: null,
    isCompleted: true,
    finalAuthority: existingWorkflow.finalAuthority || 'system',
    approvalChain,
    history: [
      ...(Array.isArray(existingWorkflow.history) ? existingWorkflow.history : []),
      {
        step: 'system',
        action: 'auto_approved',
        actionBy: actorId,
        actionByName: 'System',
        actionByRole: 'system',
        comments,
        timestamp: new Date(),
      },
      {
        step: 'system',
        action: edge.permissionType === 'late_in' ? 'system_gate_in_verified' : 'system_gate_out_verified',
        actionBy: actorId,
        actionByName: 'System',
        actionByRole: 'system',
        comments: 'System gate verification applied from attendance punch',
        timestamp: new Date(),
      },
    ],
  };
}

function getSystemGateTime(edge) {
  const raw = edge.permissionType === 'late_in' ? edge.shift?.inTime : edge.shift?.outTime;
  if (!raw) return null;
  const gateTime = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(gateTime.getTime()) ? null : gateTime;
}

function getVerifiedStatus(permissionType) {
  return permissionType === 'late_in' ? 'checked_in' : 'checked_out';
}

function buildEligibleEdges(attendanceDaily, settings) {
  const shifts = Array.isArray(attendanceDaily?.shifts) ? attendanceDaily.shifts : [];
  const edges = [];

  for (const permissionType of ['late_in', 'early_out']) {
    if (!isTypeEnabled(settings, permissionType)) continue;

    const ruleSet = getRuleSet(settings, permissionType);
    const ranges = ruleSet?.shiftDurationRanges || [];

    for (const shift of shifts) {
      const detectedMinutes = getDetectedMinutes(shift, permissionType);
      if (detectedMinutes <= 0) continue;
      if (permissionType === 'late_in' && !shift?.inTime) continue;
      if (permissionType === 'early_out' && !shift?.outTime) continue;

      const shiftDurationHours = deriveShiftDurationHours(shift);
      const matchedRange = findMatchingRange(ranges, shiftDurationHours);
      if (!matchedRange) continue;

      const allowedMinutes = Number(matchedRange.allowedMinutes) || 0;
      const minimumMinutes = matchedRange.minimumMinutes == null ? 1 : Number(matchedRange.minimumMinutes) || 0;
      if (detectedMinutes < minimumMinutes) continue;
      if (detectedMinutes > allowedMinutes) continue;

      const permittedEdgeTime = getActualEdgeTime(shift, permissionType);
      if (!permittedEdgeTime) continue;

      edges.push({
        permissionType,
        permittedEdgeTime,
        detectedMinutes,
        allowedMinutes,
        minimumMinutes,
        shiftDurationHours,
        shift,
        matchedRange,
      });
    }
  }

  return edges;
}

async function resolveRequestedBy(employee) {
  const employeeUser = await User.findOne({
    $or: [
      { employeeRef: employee._id },
      { employeeId: String(employee.emp_no || '').toUpperCase() },
    ],
    isActive: true,
  }).select('_id').lean();
  if (employeeUser?._id) return employeeUser._id;

  const systemUser = await User.findOne({
    role: { $in: ['super_admin', 'sub_admin', 'hr'] },
    isActive: true,
  }).sort({ role: 1, createdAt: 1 }).select('_id').lean();
  return systemUser?._id || null;
}

async function findExistingPermission({ employeeId, date, permissionType }) {
  return Permission.findOne({
    employeeId,
    date,
    permissionType,
    isActive: true,
    status: { $nin: REJECTED_STATUSES },
  });
}

async function findExistingAutoPermission({ employeeId, date, permissionType, shiftNumber }) {
  return Permission.findOne({
    employeeId,
    date,
    permissionType,
    creationSource: AUTO_SOURCE,
    isActive: true,
    status: { $nin: REJECTED_STATUSES },
    'autoCreationMeta.shiftNumber': shiftNumber || null,
  });
}

async function createAutoPermissionForEdge({ attendanceDaily, employee, requestedBy, edge }) {
  const window = getPermissionWindow(attendanceDaily.date, edge.shift, edge.permissionType);
  if (!window) {
    throw new Error('Unable to resolve shift-edge permission window');
  }
  const grantedMinutes = getGrantedMinutesFromWindow(window);
  const explanation = buildAutoPermissionExplanation(edge, grantedMinutes);

  return Permission.create({
    employeeId: employee._id,
    employeeNumber: String(employee.emp_no || attendanceDaily.employeeNumber).toUpperCase(),
    date: attendanceDaily.date,
    attendanceRecordId: attendanceDaily._id || null,
    division_id: employee.division_id?._id || employee.division_id || null,
    division_name: employee.division_id?.name || undefined,
    department_id: employee.department_id?._id || employee.department_id || null,
    department_name: employee.department_id?.name || undefined,
    permissionType: edge.permissionType,
    permittedEdgeTime: edge.permittedEdgeTime,
    permissionStartTime: window.startTime,
    permissionEndTime: window.endTime,
    permissionHours: Math.round((grantedMinutes / 60) * 100) / 100,
    purpose: explanation,
    status: 'pending',
    requestedBy,
    comments: explanation,
    creationSource: AUTO_SOURCE,
    autoCreationMeta: {
      ruleType: edge.permissionType,
      shiftNumber: Number(edge.shift?.shiftNumber) || null,
      shiftName: edge.shift?.shiftName || null,
      shiftDurationHours: edge.shiftDurationHours,
      detectedMinutes: edge.detectedMinutes,
      allowedMinutes: edge.allowedMinutes,
      minimumMinutes: edge.minimumMinutes,
      grantedMinutes,
      matchedRange: {
        minShiftHours: Number(edge.matchedRange.minShiftHours),
        maxShiftHours: Number(edge.matchedRange.maxShiftHours),
        description: edge.matchedRange.description || null,
      },
      createdByService: 'autoEdgePermissionCreationService',
    },
    workflow: {
      currentStepRole: null,
      nextApproverRole: null,
      nextApprover: null,
      isCompleted: false,
      finalAuthority: null,
      approvalChain: [],
      history: [
        {
          step: 'system',
          action: 'auto_created',
          actionBy: requestedBy,
          actionByName: 'System',
          actionByRole: 'system',
          comments: AUTO_PURPOSE,
          timestamp: new Date(),
        },
      ],
    },
  });
}

function applyAutoPermissionEdgeFields(permission, attendanceDaily, edge) {
  const window = getPermissionWindow(attendanceDaily.date, edge.shift, edge.permissionType);
  if (!window) {
    throw new Error('Unable to resolve shift-edge permission window');
  }

  const grantedMinutes = getGrantedMinutesFromWindow(window);
  const explanation = buildAutoPermissionExplanation(edge, grantedMinutes);

  permission.attendanceRecordId = attendanceDaily._id || permission.attendanceRecordId || null;
  permission.permittedEdgeTime = edge.permittedEdgeTime;
  permission.permissionStartTime = window.startTime;
  permission.permissionEndTime = window.endTime;
  permission.permissionHours = Math.round((grantedMinutes / 60) * 100) / 100;
  permission.purpose = explanation;
  permission.comments = explanation;
  permission.autoCreationMeta = {
    ...(permission.autoCreationMeta || {}),
    ruleType: edge.permissionType,
    shiftNumber: Number(edge.shift?.shiftNumber) || null,
    shiftName: edge.shift?.shiftName || null,
    shiftDurationHours: edge.shiftDurationHours,
    detectedMinutes: edge.detectedMinutes,
    allowedMinutes: edge.allowedMinutes,
    minimumMinutes: edge.minimumMinutes,
    grantedMinutes,
    matchedRange: {
      minShiftHours: Number(edge.matchedRange.minShiftHours),
      maxShiftHours: Number(edge.matchedRange.maxShiftHours),
      description: edge.matchedRange.description || null,
    },
    createdByService: 'autoEdgePermissionCreationService',
  };
}

async function finalizeAutoEdgePermission({ permission, edge, actorId }) {
  if (!permission || !edge || !actorId) {
    return { success: false, skippedReason: 'Missing permission, edge, or actor' };
  }

  const verifiedStatus = getVerifiedStatus(edge.permissionType);
  const grantedMinutes = Number(permission.autoCreationMeta?.grantedMinutes) || Number(edge.detectedMinutes) || 0;
  const comments = buildAutoPermissionExplanation(edge, Math.round(grantedMinutes * 100) / 100);
  if (FINAL_EDGE_STATUSES.includes(permission.status)) {
    completeAutoWorkflow(permission, actorId, edge, comments);
    await permission.save();
    return { success: true, finalized: false, skippedReason: 'Permission already system verified' };
  }

  const gateTime = getSystemGateTime(edge);
  if (!gateTime) {
    return { success: false, skippedReason: 'Unable to resolve system gate time from attendance punches' };
  }

  permission.status = verifiedStatus;
  permission.approvedBy = actorId;
  permission.approvedAt = new Date();

  if (edge.permissionType === 'late_in') {
    permission.gateInTime = gateTime;
    permission.gateInVerifiedBy = actorId;
    permission.gateInSecret = null;
  } else {
    permission.gateOutTime = gateTime;
    permission.gateOutVerifiedBy = actorId;
    permission.gateOutSecret = null;
  }

  completeAutoWorkflow(permission, actorId, edge, comments);

  await permission.save();
  return { success: true, finalized: true, status: verifiedStatus };
}

async function autoCreateEdgePermissionsForAttendance(attendanceDaily) {
  try {
    if (!attendanceDaily?.employeeNumber || !attendanceDaily?.date) {
      return { success: false, created: 0, skippedReason: 'Attendance record missing employee/date' };
    }

    const settings = await AutoEdgePermissionSettings.getActiveSettings();
    if (!settings?.isEnabled) {
      return { success: true, created: 0, skippedReason: 'Auto edge permission settings disabled' };
    }

    const eligibleEdges = buildEligibleEdges(attendanceDaily, settings);
    if (!eligibleEdges.length) {
      return { success: true, created: 0, skippedReason: 'No eligible late-in / early-out edges' };
    }

    const employeeNumber = String(attendanceDaily.employeeNumber).toUpperCase();
    const employee = await Employee.findOne({ emp_no: employeeNumber })
      .populate('division_id', 'name')
      .populate('department_id', 'name');
    if (!employee) {
      return { success: false, created: 0, skippedReason: 'Employee not found' };
    }

    const requestedBy = await resolveRequestedBy(employee);
    if (!requestedBy) {
      return { success: false, created: 0, skippedReason: 'No active user found for auto-created permission ownership' };
    }

    const created = [];
    const finalized = [];
    let shouldRefreshAttendance = false;
    for (const edge of eligibleEdges) {
      const shiftNumber = Number(edge.shift?.shiftNumber) || null;
      const manualPermission = await findExistingPermission({
        employeeId: employee._id,
        date: attendanceDaily.date,
        permissionType: edge.permissionType,
      });
      if (manualPermission && manualPermission.creationSource !== AUTO_SOURCE) continue;

      let permission = await findExistingAutoPermission({
        employeeId: employee._id,
        date: attendanceDaily.date,
        permissionType: edge.permissionType,
        shiftNumber,
      });

      if (!permission) {
        permission = await createAutoPermissionForEdge({
          attendanceDaily,
          employee,
          requestedBy,
          edge,
        });
        created.push(permission);
      } else {
        applyAutoPermissionEdgeFields(permission, attendanceDaily, edge);
        await permission.save();
        shouldRefreshAttendance = true;
      }

      const finalizeResult = await finalizeAutoEdgePermission({
        permission,
        edge,
        actorId: requestedBy,
      });
      if (finalizeResult.success && finalizeResult.finalized) {
        finalized.push(permission);
        shouldRefreshAttendance = true;
      }
    }

    if (shouldRefreshAttendance) {
      try {
        // Update permissionCount on AttendanceDaily
        const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
        await AttendanceDaily.updateOne(
          { employeeNumber, date: attendanceDaily.date },
          { $set: { permissionCount: created.length + finalized.length } }
        );
        
        const { refreshAttendanceEdgePermissions } = require('./permissionEdgeAttendanceService');
        await refreshAttendanceEdgePermissions(employeeNumber, attendanceDaily.date);
      } catch (refreshError) {
        console.error('[AutoEdgePermissionCreation] Attendance refresh failed:', refreshError.message);
      }
    }

    return {
      success: true,
      created: created.length,
      finalized: finalized.length,
      permissionIds: created.map((p) => p._id),
      finalizedPermissionIds: finalized.map((p) => p._id),
    };
  } catch (error) {
    console.error('[AutoEdgePermissionCreation] Failed:', error);
    return { success: false, created: 0, error: error.message };
  }
}

module.exports = {
  AUTO_SOURCE,
  AUTO_PURPOSE,
  autoCreateEdgePermissionsForAttendance,
  buildEligibleEdges,
  deriveShiftDurationHours,
  finalizeAutoEdgePermission,
  findMatchingRange,
  getSystemGateTime,
  getVerifiedStatus,
  getPermittedEdgeTime,
  getActualEdgeTime,
  getPermissionWindow,
  applyAutoPermissionEdgeFields,
  toMinutes,
  toTimeString,
};
