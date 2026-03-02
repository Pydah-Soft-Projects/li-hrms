/**
 * Single-Shift Attendance Processing Service
 * One shift per day: first IN, last OUT
 * Per ATTENDANCE_DUAL_MODE_DESIGN.md Section 5
 */

const AttendanceDaily = require('../model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const OD = require('../../leaves/model/OD');
const { detectAndAssignShift } = require('../../shifts/services/shiftDetectionService');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');

const formatDate = (date) => extractISTComponents(date).dateStr;

/**
 * Compute working duration for OT: clamp to shift window so early arrival does not inflate OT.
 * - Effective IN = later of (shift start, first punch IN) — early arrival excluded
 * - Effective OUT = last punch OUT (no cap) — leaving after shift end = real OT
 * Duration = effectiveOut - effectiveIn
 */
function getEffectiveWorkingDuration(firstInTime, lastOutTime, shiftStartTime, shiftEndTime, date) {
  if (!shiftStartTime || !shiftEndTime) {
    const rawMs = lastOutTime - firstInTime;
    return Math.round((rawMs / 3600000) * 100) / 100;
  }
  const shiftStartDate = createISTDate(date, shiftStartTime);
  const effectiveIn = firstInTime < shiftStartDate ? shiftStartDate : firstInTime;
  const effectiveOut = lastOutTime;
  if (effectiveOut <= effectiveIn) return 0;
  const ms = effectiveOut.getTime() - effectiveIn.getTime();
  return Math.round((ms / 3600000) * 100) / 100;
}

/**
 * Process single-shift attendance for one employee on one date
 * @param {String} employeeNumber
 * @param {String} date - YYYY-MM-DD
 * @param {Array} rawLogs - All raw logs (will filter by date and pairing rules)
 * @param {Object} generalConfig - General settings
 * @param {Object} processingMode - From AttendanceSettings.getProcessingMode
 * @returns {Promise<Object>} { success, dailyRecord, ... }
 */
async function processSingleShiftAttendance(employeeNumber, date, rawLogs, generalConfig, processingMode = {}) {
  try {
    const validLogs = (rawLogs || []).filter(l => l && l.timestamp);
    const allPunches = validLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const targetDatePunches = allPunches.filter(p => {
      const d = new Date(p.timestamp);
      const { dateStr } = extractISTComponents(d);
      return dateStr === date;
    });

    const ins = targetDatePunches.filter(p => p.type === 'IN');
    const outs = targetDatePunches.filter(p => p.type === 'OUT');

    if (ins.length === 0 || outs.length === 0) {
      // No valid pairing - create/update with empty or partial
      const updateData = buildEmptyUpdate(employeeNumber, date);
      const dailyRecord = await upsertDaily(employeeNumber, date, updateData);
      return { success: true, dailyRecord, shiftsProcessed: 0, totalHours: 0, totalOT: 0 };
    }

    const firstInTime = new Date(ins[0].timestamp);
    const lastOutTime = new Date(outs[outs.length - 1].timestamp);

    if (lastOutTime <= firstInTime) {
      const updateData = buildEmptyUpdate(employeeNumber, date);
      const dailyRecord = await upsertDaily(employeeNumber, date, updateData);
      return { success: true, dailyRecord, shiftsProcessed: 0, totalHours: 0, totalOT: 0 };
    }

    const configWithMode = { ...generalConfig, processingMode };
    const shiftAssignment = await detectAndAssignShift(
      employeeNumber,
      date,
      firstInTime,
      lastOutTime,
      configWithMode
    );

    const Shift = require('../../shifts/model/Shift');
    const assignedShiftDef = shiftAssignment?.assignedShift
      ? await Shift.findById(shiftAssignment.assignedShift).select('payableShifts duration').lean()
      : null;

    const rawDurationMs = lastOutTime - firstInTime;
    const punchHours = Math.round((rawDurationMs / 3600000) * 100) / 100; // Display: duration since punched
    const shiftStart = shiftAssignment?.shiftStartTime || null;
    const shiftEnd = shiftAssignment?.shiftEndTime || null;
    const effectiveHours = getEffectiveWorkingDuration(
      firstInTime, lastOutTime, shiftStart, shiftEnd, date
    ); // OT only: clamp early arrival
    const expectedHours = (assignedShiftDef?.duration) || 8;
    const extraHours = effectiveHours > expectedHours ? Math.round((effectiveHours - expectedHours) * 100) / 100 : 0;

    const pShift = {
      shiftNumber: 1,
      inTime: firstInTime,
      outTime: lastOutTime,
      duration: Math.round(rawDurationMs / 60000),
      punchHours,
      workingHours: punchHours, // Display: actual duration worked since punched
      odHours: 0,
      extraHours,
      otHours: 0, // Only set when OT is approved via Convert to OT flow
      status: 'incomplete',
      inPunchId: ins[0]._id || ins[0].id,
      outPunchId: outs[outs.length - 1]._id || outs[outs.length - 1].id,
    };

    if (shiftAssignment?.success) {
      pShift.shiftId = shiftAssignment.assignedShift;
      pShift.shiftName = shiftAssignment.shiftName;
      pShift.shiftStartTime = shiftAssignment.shiftStartTime;
      pShift.shiftEndTime = shiftAssignment.shiftEndTime;
      pShift.lateInMinutes = shiftAssignment.lateInMinutes;
      pShift.earlyOutMinutes = shiftAssignment.earlyOutMinutes;
      pShift.isLateIn = shiftAssignment.isLateIn;
      pShift.isEarlyOut = shiftAssignment.isEarlyOut;
      pShift.expectedHours = shiftAssignment.expectedHours || expectedHours;

      const basePayable = (assignedShiftDef?.payableShifts ?? 1);
      const statusDuration = punchHours + (pShift.odHours || 0); // Use actual punch duration for status

      if (statusDuration >= expectedHours * 0.75) {
        pShift.status = 'PRESENT';
        pShift.payableShift = basePayable;
      } else if (statusDuration >= expectedHours * 0.40) {
        pShift.status = 'HALF_DAY';
        pShift.payableShift = basePayable * 0.5;
      } else {
        pShift.status = 'ABSENT';
        pShift.payableShift = 0;
      }
    } else {
      pShift.status = 'PRESENT';
      pShift.payableShift = 1;
    }

    const processedShifts = [pShift];
    const totalPayableShifts = pShift.payableShift || 0;
    const status = pShift.status === 'PRESENT' || totalPayableShifts >= 1 ? 'PRESENT'
      : pShift.status === 'HALF_DAY' ? 'HALF_DAY' : 'ABSENT';

    const updateData = {
      shifts: processedShifts,
      totalShifts: 1,
      totalWorkingHours: punchHours,
      totalOTHours: 0, // Only set when OT is approved via Convert to OT
      extraHours,
      payableShifts: totalPayableShifts,
      status,
      lastSyncedAt: new Date(),
      totalLateInMinutes: pShift.lateInMinutes || 0,
      totalEarlyOutMinutes: pShift.earlyOutMinutes || 0,
      totalExpectedHours: pShift.expectedHours || expectedHours,
      otHours: 0, // Display as extra hours until Convert to OT + management approval
    };

    const dailyRecord = await upsertDaily(employeeNumber, date, updateData);
    // Monthly summary is recalculated in background by AttendanceDaily post-save hook

    return {
      success: true,
      dailyRecord,
      shiftsProcessed: 1,
      totalHours: punchHours,
      totalOT: extraHours,
    };
  } catch (error) {
    console.error('[SingleShift] Error:', error);
    return { success: false, error: error.message };
  }
}

function buildEmptyUpdate(employeeNumber, date) {
  return {
    shifts: [],
    totalShifts: 0,
    totalWorkingHours: 0,
    totalOTHours: 0,
    extraHours: 0,
    payableShifts: 0,
    status: 'ABSENT',
    lastSyncedAt: new Date(),
    totalLateInMinutes: 0,
    totalEarlyOutMinutes: 0,
    totalExpectedHours: 0,
    otHours: 0,
  };
}

async function upsertDaily(employeeNumber, date, updateData) {
  let dailyRecord = await AttendanceDaily.findOne({ employeeNumber, date });
  if (!dailyRecord) {
    dailyRecord = new AttendanceDaily({ employeeNumber, date, ...updateData });
  } else {
    Object.keys(updateData).forEach(k => { dailyRecord[k] = updateData[k]; });
  }
  if (!dailyRecord.source) dailyRecord.source = [];
  if (!dailyRecord.source.includes('biometric-realtime')) {
    dailyRecord.source.push('biometric-realtime');
  }
  await dailyRecord.save();
  return dailyRecord;
}

module.exports = { processSingleShiftAttendance };
