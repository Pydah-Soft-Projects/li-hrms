/**
 * Persist and refresh shift half-segment metadata (firstHalf / secondHalf) on attendance rows.
 * Uses current Shift master definition + stored punches so historical rows stay correct after segment edits.
 */

const Shift = require('../../shifts/model/Shift');
const Settings = require('../../settings/model/Settings');
const { getShiftSegmentAssignment } = require('../../shifts/services/shiftHalfSegmentService');
const Employee = require('../../employees/model/Employee');
const { applyShiftSegmentOverride } = require('../../shared/utils/shiftSegmentOverrides');

async function resolveGraceFromSettings() {
  try {
    const gen = await Settings.getSettingsByCategory('general');
    return {
      globalLateInGrace: gen?.late_in_grace_time ?? null,
      globalEarlyOutGrace: gen?.early_out_grace_time ?? null,
    };
  } catch {
    return { globalLateInGrace: null, globalEarlyOutGrace: null };
  }
}

/**
 * Attach segment breakdown to one processed shift object (mutates and returns same ref).
 */
async function enrichShiftRecordWithSegments(pShift, dateStr, graceOpts, employeeCtx = null) {
  const opts = graceOpts || (await resolveGraceFromSettings());

  if (!pShift?.shiftId || !pShift?.inTime) {
    pShift.shiftSegments = [];
    pShift.segmentContinuityWarnings = [];
    pShift.segmentTotalPayableShifts = null;
    return pShift;
  }

  const shiftDoc = await Shift.findById(pShift.shiftId).lean();
  if (!shiftDoc) {
    pShift.shiftSegments = [];
    pShift.segmentContinuityWarnings = [];
    pShift.segmentTotalPayableShifts = null;
    return pShift;
  }

  let ctx = employeeCtx;
  if (ctx && !ctx.divisionId && ctx.employeeNumber) {
    const empUpper = String(ctx.employeeNumber).toUpperCase();
    const employee = await Employee.findOne({ emp_no: empUpper })
      .populate('division_id')
      .select('emp_no gender employee_group_id division_id')
      .lean();
    ctx = employee
      ? {
        divisionId: employee.division_id?._id || employee.division_id || null,
      }
      : { divisionId: null };
  }

  const effectiveShiftDoc = applyShiftSegmentOverride(shiftDoc, ctx?.divisionId || null);

  const inTime = new Date(pShift.inTime);
  const outTime = pShift.outTime ? new Date(pShift.outTime) : null;
  const seg = getShiftSegmentAssignment(effectiveShiftDoc, dateStr, inTime, outTime, opts);

  pShift.shiftSegments = seg.shiftSegments || [];
  pShift.segmentContinuityWarnings = seg.continuityWarnings || [];
  pShift.segmentTotalPayableShifts =
    typeof seg.totalPayableShifts === 'number' ? seg.totalPayableShifts : null;

  return pShift;
}

/**
 * Recompute segments for every shift row on a daily attendance document and save.
 */
async function refreshAttendanceShiftSegments(employeeNumber, dateStr) {
  const AttendanceDaily = require('../model/AttendanceDaily');
  const { calculateMonthlySummary } = require('./summaryCalculationService');

  const empUpper = String(employeeNumber).toUpperCase();
  const daily = await AttendanceDaily.findOne({ employeeNumber: empUpper, date: dateStr });
  if (!daily) {
    return { success: false, message: 'No attendance daily record' };
  }
  if (daily.locked === true) {
    return { success: false, message: 'Record locked (payroll immutable)' };
  }
  if (!daily.shifts || !daily.shifts.length) {
    return { success: false, message: 'No shifts on record' };
  }

  const employee = await Employee.findOne({ emp_no: empUpper })
    .populate('division_id')
    .select('emp_no gender employee_group_id division_id')
    .lean();

  const employeeCtx = employee
    ? {
      division: employee.division_id || null,
      gender: employee.gender || null,
      employeeGroupId: employee.employee_group_id || null,
    }
    : { division: null, gender: null, employeeGroupId: null };

  const graceOpts = await resolveGraceFromSettings();
  const refreshed = [];
  for (const s of daily.shifts) {
    const plain = typeof s.toObject === 'function' ? s.toObject() : { ...s };
    refreshed.push(await enrichShiftRecordWithSegments(plain, dateStr, graceOpts, employeeCtx));
  }

  daily.shifts = refreshed;
  daily.markModified('shifts');
  await daily.save();

  if (employee?._id) {
    const [y, m] = dateStr.split('-').map(Number);
    await calculateMonthlySummary(employee._id, empUpper, y, m);
  }

  return {
    success: true,
    shiftsUpdated: refreshed.length,
    segmentRowsWithData: refreshed.filter((s) => Array.isArray(s.shiftSegments) && s.shiftSegments.length > 0).length,
  };
}

module.exports = {
  resolveGraceFromSettings,
  enrichShiftRecordWithSegments,
  refreshAttendanceShiftSegments,
};
