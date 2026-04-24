/**
 * Holiday / week-off OD apply context: roster check + optional punch-based half/full (aligned with auto-OD heuristics).
 * When there are no qualifying punches, callers should use legacy free-form apply behaviour.
 */

const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const {
  getPunchBasedOdSuggestionForRecord,
  getAutoOdEligibilityFromRecord,
  resolveHolWoPunchOdShape,
  MIN_HOURS_FOR_PUNCH_CONTEXT,
  FULL_DAY_HOURS_THRESHOLD,
} = require('../utils/holwoOdPunchResolver');

async function isHolidayOrWeekOff(employeeNumber, dateStr) {
  const empNo = String(employeeNumber).trim().toUpperCase();
  const ps = await PreScheduledShift.findOne({
    employeeNumber: empNo,
    date: dateStr,
    status: { $in: ['WO', 'HOL'] },
  });
  return !!ps;
}

/**
 * Full context for GET /od/check-holiday: roster HOL/WO + optional punch-based suggestion.
 */
async function getHolidayWeekOffOdApplyContext(empNo, dateStr) {
  const upper = String(empNo).trim().toUpperCase();
  const isHolWo = await isHolidayOrWeekOff(upper, dateStr);
  if (!isHolWo) {
    return {
      isHolidayOrWeekOff: false,
      hasPunches: false,
      suggestedOdTypeExtended: null,
      totalWorkingHours: null,
      punchContextDetail: null,
    };
  }

  const record = await AttendanceDaily.findOne({
    employeeNumber: upper,
    date: dateStr,
  }).lean();

  const s = getPunchBasedOdSuggestionForRecord(record);
  return {
    isHolidayOrWeekOff: true,
    hasPunches: s.hasPunches,
    suggestedOdTypeExtended: s.suggestedOdTypeExtended,
    totalWorkingHours: s.totalWorkingHours,
    punchContextDetail: s.punchContextDetail,
  };
}

module.exports = {
  isHolidayOrWeekOff,
  getPunchBasedOdSuggestionForRecord,
  getAutoOdEligibilityFromRecord,
  resolveHolWoPunchOdShape,
  getHolidayWeekOffOdApplyContext,
  MIN_HOURS_FOR_PUNCH_CONTEXT,
  FULL_DAY_HOURS_THRESHOLD,
};
