const Leave = require('../../leaves/model/Leave');
const OT = require('../model/OT');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const { getMergedOtConfig } = require('./otConfigResolver');

const ACTIVE_OT_STATUSES = ['pending', 'manager_approved', 'approved'];

function isEsiLeaveType(leaveType) {
  const normalized = String(leaveType || '').trim().toUpperCase();
  return normalized === 'ESI' || /\bESI\b/i.test(normalized);
}

function toDateOnlyInIST(dateLike) {
  const d = new Date(dateLike);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

function enumerateDateRangeInIST(fromDate, toDate) {
  const result = [];
  const start = new Date(`${toDateOnlyInIST(fromDate)}T00:00:00+05:30`);
  const end = new Date(`${toDateOnlyInIST(toDate)}T00:00:00+05:30`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    result.push(toDateOnlyInIST(d));
  }
  return result;
}

function sumPunchHours(attendanceRecord) {
  if (!attendanceRecord) return 0;
  if (Array.isArray(attendanceRecord.shifts) && attendanceRecord.shifts.length > 0) {
    const total = attendanceRecord.shifts.reduce((acc, s) => acc + (Number(s.punchHours) || 0), 0);
    return Math.round(total * 100) / 100;
  }
  return Math.round((Number(attendanceRecord.totalWorkingHours) || 0) * 100) / 100;
}

function resolveAttendanceShift(attendanceRecord) {
  if (!attendanceRecord) return null;
  if (attendanceRecord.shiftId) return attendanceRecord.shiftId;
  const shift = (attendanceRecord.shifts || []).find((s) => s.shiftId);
  return shift?.shiftId || null;
}

function resolveEmployeeInTime(attendanceRecord) {
  if (!attendanceRecord) return null;
  if (attendanceRecord.inTime) return attendanceRecord.inTime;
  const shift = (attendanceRecord.shifts || []).find((s) => s.inTime);
  return shift?.inTime || null;
}

function resolvePunchWindow(attendanceRecord) {
  const windows = (attendanceRecord?.shifts || [])
    .filter((s) => s?.inTime && s?.outTime)
    .map((s) => ({
      inTime: new Date(s.inTime),
      outTime: new Date(s.outTime),
    }))
    .filter((w) => !Number.isNaN(w.inTime.getTime()) && !Number.isNaN(w.outTime.getTime()) && w.outTime > w.inTime);

  if (!windows.length) return null;
  windows.sort((a, b) => a.inTime - b.inTime);
  return {
    firstInTime: windows[0].inTime,
    lastOutTime: windows.reduce((mx, w) => (w.outTime > mx ? w.outTime : mx), windows[0].outTime),
  };
}

function createOtWorkflow(userId, otSettings) {
  const approvalSteps = [
    {
      stepOrder: 1,
      role: 'hod',
      label: 'HOD Approval',
      status: 'pending',
      isCurrent: true,
    },
  ];
  if (otSettings?.workflow?.steps && otSettings.workflow.steps.length > 0) {
    otSettings.workflow.steps.forEach((step) => {
      if (step.approverRole !== 'hod') {
        approvalSteps.push({
          stepOrder: approvalSteps.length + 1,
          role: step.approverRole,
          label: step.stepName || `${step.approverRole.toUpperCase()} Approval`,
          status: 'pending',
          isCurrent: false,
        });
      }
    });
  }
  return {
    currentStepRole: 'hod',
    nextApproverRole: 'hod',
    nextApprover: 'hod',
    approvalChain: approvalSteps,
    finalAuthority: otSettings?.workflow?.finalAuthority?.role || 'hr',
    history: [
      {
        step: 'employee',
        action: 'submitted',
        actionBy: userId,
        timestamp: new Date(),
        comments: 'ESI leave attendance conversion',
      },
    ],
  };
}

async function getSystemRequesterUserId(employeeId) {
  const User = require('../../users/model/User');
  let requester = await User.findOne({ employeeRef: employeeId }).select('_id');
  if (!requester) {
    requester = await User.findOne({ role: 'super_admin' }).sort({ createdAt: 1 }).select('_id');
  }
  return requester?._id || null;
}

async function upsertEsiOtForAttendanceDay({
  leave,
  employee,
  attendanceRecord,
  date,
  requestedByUserId,
  selectedOtHours = null,
}) {
  const punchHours = sumPunchHours(attendanceRecord);
  if (punchHours <= 0) {
    return { skipped: true, reason: 'no_punch_hours' };
  }

  const isHalfDay = !!leave?.isHalfDay;
  const requestedHours = selectedOtHours == null ? punchHours : Number(selectedOtHours);
  if (!Number.isFinite(requestedHours) || requestedHours < 0) {
    return { success: false, message: 'Invalid OT hours' };
  }
  const otHours = Math.round(Math.min(punchHours, requestedHours) * 100) / 100;

  const shiftId = resolveAttendanceShift(attendanceRecord);
  const employeeInTime = resolveEmployeeInTime(attendanceRecord);
  if (!shiftId || !employeeInTime) {
    return { skipped: true, reason: 'missing_shift_or_intime' };
  }

  const shift = await Shift.findById(shiftId).select('endTime');
  if (!shift?.endTime) {
    return { skipped: true, reason: 'shift_not_found' };
  }

  // For ESI conversion, OT should mirror real worked punch window
  // so payroll reflects exact thumb-based worked interval.
  const punchWindow = resolvePunchWindow(attendanceRecord);
  const [endHour, endMinute] = String(shift.endTime).split(':').map(Number);
  const safeHour = Number.isFinite(endHour) ? endHour : 18;
  const safeMinute = Number.isFinite(endMinute) ? endMinute : 0;
  const fallbackOtInTime = new Date(`${date}T${String(safeHour).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}:00+05:30`);
  const otInTime = punchWindow?.firstInTime || fallbackOtInTime;
  const otOutTime = punchWindow?.lastOutTime || new Date(otInTime.getTime() + otHours * 60 * 60 * 1000);

  let ot = await OT.findOne({
    employeeId: employee._id,
    date,
    status: { $in: ACTIVE_OT_STATUSES },
    isActive: true,
  });

  if (ot) {
    ot.attendanceRecordId = attendanceRecord._id;
    ot.shiftId = shiftId;
    ot.employeeInTime = employeeInTime;
    ot.shiftEndTime = shift.endTime;
    ot.otInTime = otInTime;
    ot.otOutTime = otOutTime;
    ot.otHours = otHours;
    ot.rawOtHours = punchHours;
    ot.computedOtHours = otHours;
    ot.convertedFromAttendance = true;
    ot.convertedBy = requestedByUserId;
    ot.convertedAt = new Date();
    ot.source = 'esi_leave_conversion';
    ot.comments = isHalfDay
      ? `ESI half-day conversion: punch ${punchHours}h, selected OT ${otHours}h.`
      : `ESI conversion: punch ${punchHours}h moved to OT.`;
    await ot.save();
    return { success: true, action: 'updated', data: ot, punchHours, otHours };
  }

  const deptId = employee.department_id?._id || employee.department_id;
  const divId = employee.division_id?._id || employee.division_id;
  const mergedOt = await getMergedOtConfig(deptId, divId);
  const workflow = createOtWorkflow(requestedByUserId, { workflow: mergedOt.workflow });
  ot = await OT.create({
    employeeId: employee._id,
    employeeNumber: employee.emp_no,
    date,
    attendanceRecordId: attendanceRecord._id,
    division_id: employee.division_id?._id || employee.division_id,
    division_name: employee.division_id?.name || 'N/A',
    department_id: employee.department_id?._id || employee.department_id,
    department_name: employee.department_id?.name || 'N/A',
    shiftId,
    employeeInTime,
    shiftEndTime: shift.endTime,
    otInTime,
    otOutTime,
    otHours,
    rawOtHours: punchHours,
    computedOtHours: otHours,
    status: 'pending',
    requestedBy: requestedByUserId,
    convertedFromAttendance: true,
    convertedBy: requestedByUserId,
    convertedAt: new Date(),
    source: 'esi_leave_conversion',
    comments: isHalfDay
      ? `ESI half-day conversion: punch ${punchHours}h, selected OT ${otHours}h.`
      : `ESI conversion: punch ${punchHours}h moved to OT.`,
    workflow,
  });
  return { success: true, action: 'created', data: ot, punchHours, otHours };
}

async function syncEsiLeaveOtForLeave(leave, options = {}) {
  if (!leave || !isEsiLeaveType(leave.leaveType)) return { skipped: true, reason: 'not_esi_leave' };

  const isApproved = leave.status === 'approved' && leave.isActive !== false;
  if (!isApproved) {
    // Reversal/cancel path: deactivate OT records linked to this ESI conversion window.
    const dates = enumerateDateRangeInIST(leave.fromDate, leave.toDate);
    const result = await OT.updateMany(
      {
        employeeId: leave.employeeId,
        date: { $in: dates },
        source: 'esi_leave_conversion',
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          comments: `Deactivated: ESI leave moved to ${leave.status}.`,
        },
      }
    );
    return { success: true, action: 'deactivated', modifiedCount: result.modifiedCount || 0 };
  }

  const employee = await Employee.findById(leave.employeeId)
    .populate('division_id', 'name')
    .populate('department_id', 'name');
  if (!employee) return { skipped: true, reason: 'employee_not_found' };

  const requestedByUserId = options.requestedByUserId || (await getSystemRequesterUserId(leave.employeeId));
  if (!requestedByUserId) return { skipped: true, reason: 'requester_not_found' };

  const days = enumerateDateRangeInIST(leave.fromDate, leave.toDate);
  const results = [];

  for (const day of days) {
    const attendanceRecord = await require('../../attendance/model/AttendanceDaily').findOne({
      employeeNumber: leave.emp_no,
      date: day,
    });
    if (!attendanceRecord) {
      results.push({ date: day, skipped: true, reason: 'attendance_missing' });
      continue;
    }

    // Half-day ESI is user-driven from attendance detail; do not auto-convert unless explicitly forced.
    if (leave.isHalfDay && !options.forceHalfDayConvert) {
      results.push({
        date: day,
        skipped: true,
        reason: 'half_day_requires_manual_selection',
        maxConvertibleHours: sumPunchHours(attendanceRecord),
      });
      continue;
    }

    const selectedMap = options.halfDaySelectedHoursByDate || {};
    const selectedOtHours = selectedMap[day] ?? null;
    const upsertResult = await upsertEsiOtForAttendanceDay({
      leave,
      employee,
      attendanceRecord,
      date: day,
      requestedByUserId,
      selectedOtHours,
    });
    results.push({ date: day, ...upsertResult });
  }

  return { success: true, action: 'synced', results };
}

async function getApprovedEsiLeaveForDate(empNo, date) {
  const dayStart = new Date(`${date}T00:00:00+05:30`);
  const dayEnd = new Date(`${date}T23:59:59.999+05:30`);
  return Leave.findOne({
    emp_no: String(empNo || '').toUpperCase(),
    status: 'approved',
    isActive: true,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  }).sort({ fromDate: -1 });
}

module.exports = {
  isEsiLeaveType,
  sumPunchHours,
  upsertEsiOtForAttendanceDay,
  syncEsiLeaveOtForLeave,
  getApprovedEsiLeaveForDate,
};
