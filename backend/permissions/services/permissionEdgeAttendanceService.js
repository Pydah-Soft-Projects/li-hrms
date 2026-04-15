/**
 * Late-in / early-out permission types: adjust shift late/early flags and credit hours
 * after gate verification. Idempotent from current punch + shift + permission docs.
 */

const Permission = require('../model/Permission');
const { createISTDate } = require('../../shared/utils/dateUtils');
const { calculateLateIn, calculateEarlyOut } = require('../../shifts/services/shiftDetectionService');

const DEFAULT_GRACE = 0;

/**
 * @param {string} timeStr HH:MM
 * @param {string} dateStr YYYY-MM-DD
 * @param {boolean} nextDay
 */
function timeOnDate(timeStr, dateStr, nextDay = false) {
  if (!timeStr || !dateStr) return null;
  let d = dateStr;
  if (nextDay) {
    const base = new Date(`${dateStr}T12:00:00+05:30`);
    base.setDate(base.getDate() + 1);
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    d = `${y}-${m}-${day}`;
  }
  const [h, m] = timeStr.split(':').map(Number);
  const hh = String(h ?? 0).padStart(2, '0');
  const mm = String(m ?? 0).padStart(2, '0');
  return new Date(`${d}T${hh}:${mm}:00+05:30`);
}

function shiftOvernight(shiftStartTime, shiftEndTime) {
  if (!shiftStartTime || !shiftEndTime) return false;
  const [sh] = shiftStartTime.split(':').map(Number);
  const [eh] = shiftEndTime.split(':').map(Number);
  return eh < sh;
}

/**
 * Map HH:MM + attendance date to an IST instant when the shift may cross midnight.
 * Attendance `date` is the shift-start calendar day (same convention as AttendanceDaily).
 * - Day shift: permitted time is always on `date`.
 * - Overnight: if clock time >= shift start (e.g. 22:00 >= 21:00), instant is on start day;
 *   if clock time < shift start (e.g. 05:00 < 21:00), instant is on the next calendar day
 *   (morning of shift end). This covers early-out before shift end and late-in after midnight.
 */
function resolvePermittedInstant(permittedTimeStr, attendanceDateStr, shiftStartTime, overnight) {
  if (!overnight) {
    return timeOnDate(permittedTimeStr, attendanceDateStr, false);
  }
  const [ph, pm] = permittedTimeStr.split(':').map(Number);
  const permittedM = (ph || 0) * 60 + (pm || 0);
  const [sh, sm] = shiftStartTime.split(':').map(Number);
  const startM = (sh || 0) * 60 + (sm || 0);
  const onStartDay = permittedM >= startM;
  return timeOnDate(permittedTimeStr, attendanceDateStr, !onStartDay);
}

/**
 * Apply late_in / early_out effects to a single shift segment (mutates pShift).
 * Expects pShift already has punchHours, odHours, late/early from detect + OD pass.
 *
 * @returns {typeof pShift}
 */
async function applyEdgePermissionAdjustmentsToShiftSegment({
  employeeNumber,
  date,
  pShift,
  globalGrace = DEFAULT_GRACE,
}) {
  if (!pShift || !employeeNumber || !date) return pShift;
  if (!pShift.shiftStartTime || !pShift.shiftEndTime || !pShift.inTime) {
    pShift.edgePermissionHours = 0;
    return pShift;
  }

  const empUpper = String(employeeNumber).toUpperCase();
  const perms = await Permission.find({
    employeeNumber: empUpper,
    date,
    isActive: true,
    permissionType: { $in: ['late_in', 'early_out'] },
    status: { $in: ['checked_out', 'checked_in'] },
  }).lean();

  const punchIn = pShift.inTime instanceof Date ? pShift.inTime : new Date(pShift.inTime);
  const punchOut = pShift.outTime ? (pShift.outTime instanceof Date ? pShift.outTime : new Date(pShift.outTime)) : null;
  const shiftStart = pShift.shiftStartTime;
  const shiftEnd = pShift.shiftEndTime;
  const overnight = shiftOvernight(shiftStart, shiftEnd);

  let lateMin =
    pShift.isLateIn && pShift.lateInMinutes != null
      ? Number(pShift.lateInMinutes)
      : calculateLateIn(punchIn, shiftStart, 0, date, 0);

  let earlyMin = 0;
  if (punchOut) {
    earlyMin =
      pShift.isEarlyOut && pShift.earlyOutMinutes != null
        ? Number(pShift.earlyOutMinutes)
        : calculateEarlyOut(punchOut, shiftEnd, shiftStart, date, 0) || 0;
  }

  let edgeHours = 0;

  const shiftStartDate = createISTDate(date, shiftStart);
  const shiftStartGraceMs = 0;
  const shiftStartGraceDate = new Date(shiftStartDate.getTime() + shiftStartGraceMs);

  let shiftEndDate = createISTDate(date, shiftEnd);
  if (overnight) {
    shiftEndDate = new Date(shiftEndDate.getTime() + 24 * 60 * 60 * 1000);
  }
  const shiftEndGraceDate = new Date(shiftEndDate.getTime());

  for (const perm of perms) {
    if (!perm.permittedEdgeTime || !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(perm.permittedEdgeTime)) continue;

    if (perm.permissionType === 'late_in' && perm.status === 'checked_in' && perm.gateInTime) {
      const permittedArrival = resolvePermittedInstant(perm.permittedEdgeTime, date, shiftStart, overnight);
      if (!permittedArrival) continue;
      const allowedExtraLateMin = Math.max(0, (permittedArrival.getTime() - shiftStartGraceDate.getTime()) / 60000);
      const forgiven = Math.min(Math.max(lateMin, 0), allowedExtraLateMin);
      lateMin = Math.max(0, lateMin - forgiven);
      edgeHours += forgiven / 60;
    }

    if (perm.permissionType === 'early_out' && perm.status === 'checked_out' && perm.gateOutTime && punchOut) {
      const permittedExit = resolvePermittedInstant(perm.permittedEdgeTime, date, shiftStart, overnight);
      if (!permittedExit) continue;

      if (punchOut.getTime() < permittedExit.getTime()) {
        pShift.isEarlyOut = true;
        pShift.earlyOutMinutes = Math.round(
          ((permittedExit.getTime() - punchOut.getTime()) / 60000) * 100
        ) / 100;
        earlyMin = Math.max(earlyMin, pShift.earlyOutMinutes);
        continue;
      }

      const preApprovedEarlyMin = Math.max(
        0,
        (shiftEndGraceDate.getTime() - permittedExit.getTime()) / 60000
      );
      const forgiven = Math.min(Math.max(earlyMin, 0), preApprovedEarlyMin);
      earlyMin = Math.max(0, earlyMin - forgiven);
      edgeHours += forgiven / 60;
    }
  }

  edgeHours = Math.round(edgeHours * 100) / 100;
  pShift.edgePermissionHours = edgeHours;
  pShift.lateInMinutes = lateMin > 0 ? Math.round(lateMin * 100) / 100 : null;
  pShift.isLateIn = lateMin > 0;

  if (punchOut) {
    pShift.earlyOutMinutes = earlyMin > 0 ? Math.round(earlyMin * 100) / 100 : null;
    pShift.isEarlyOut = earlyMin > 0;
  }

  const punchH = Number(pShift.punchHours) || 0;
  const odH = Number(pShift.odHours) || 0;
  pShift.workingHours = Math.round((punchH + odH + edgeHours) * 100) / 100;

  return pShift;
}

/**
 * Recompute shift status thresholds (present / half / absent) using punch + OD + edge hours.
 */
function applyStatusFromDuration(pShift, expectedHours) {
  const exp = Number(expectedHours) || 8;
  const statusDuration =
    (Number(pShift.punchHours) || 0) +
    (Number(pShift.odHours) || 0) +
    (Number(pShift.edgePermissionHours) || 0);
  const basePayable = pShift.basePayable ?? 1;
  if (statusDuration >= exp * 0.9) {
    pShift.status = 'PRESENT';
    pShift.payableShift = basePayable;
  } else if (statusDuration >= exp * 0.4) {
    pShift.status = 'HALF_DAY';
    pShift.payableShift = basePayable * 0.5;
  } else {
    pShift.status = 'ABSENT';
    pShift.payableShift = 0;
  }
  return pShift;
}

/**
 * Load daily, apply edge adjustments to first shift, update aggregates, save.
 */
async function refreshAttendanceEdgePermissions(employeeNumber, dateStr) {
  const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
  const Employee = require('../../employees/model/Employee');
  const { calculateMonthlySummary } = require('../../attendance/services/summaryCalculationService');

  const empUpper = String(employeeNumber).toUpperCase();
  const daily = await AttendanceDaily.findOne({ employeeNumber: empUpper, date: dateStr });
  if (!daily || !daily.shifts || !daily.shifts.length) {
    return { success: false, message: 'No attendance daily or shifts' };
  }

  const s0 = daily.shifts[0];
  if (!s0.shiftStartTime || !s0.shiftEndTime) {
    return { success: false, message: 'Shift times missing' };
  }

  const pShift = typeof s0.toObject === 'function' ? s0.toObject() : { ...s0 };
  await applyEdgePermissionAdjustmentsToShiftSegment({
    employeeNumber: empUpper,
    date: dateStr,
    pShift,
    globalGrace: DEFAULT_GRACE,
  });

  const expected = pShift.expectedHours || 8;
  applyStatusFromDuration(pShift, expected);

  daily.shifts[0] = pShift;
  daily.markModified('shifts');
  daily.totalWorkingHours = pShift.workingHours;
  daily.totalLateInMinutes = pShift.lateInMinutes || 0;
  daily.totalEarlyOutMinutes = pShift.earlyOutMinutes ?? 0;
  daily.payableShifts = pShift.payableShift || 0;
  daily.status =
    pShift.status === 'PRESENT' || (pShift.payableShift || 0) >= 1
      ? 'PRESENT'
      : pShift.status === 'HALF_DAY'
        ? 'HALF_DAY'
        : 'ABSENT';

  await daily.save();

  const employee = await Employee.findOne({ emp_no: empUpper }).select('_id').lean();
  if (employee?._id) {
    const [y, m] = dateStr.split('-').map(Number);
    await calculateMonthlySummary(employee._id, empUpper, y, m);
  }

  return { success: true, edgePermissionHours: pShift.edgePermissionHours };
}

module.exports = {
  applyEdgePermissionAdjustmentsToShiftSegment,
  refreshAttendanceEdgePermissions,
  applyStatusFromDuration,
  DEFAULT_GRACE,
  timeOnDate,
  shiftOvernight,
  resolvePermittedInstant,
};
