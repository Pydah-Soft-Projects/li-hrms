/**
 * Holiday / week-off OD apply context: roster check + optional punch-based half/full (aligned with auto-OD heuristics).
 * When there are no qualifying punches, callers should use legacy free-form apply behaviour.
 */

const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const { extractISTComponents } = require('../../shared/utils/dateUtils');
const {
  getPunchBasedOdSuggestionForRecord,
  getAutoOdEligibilityFromRecord,
  resolveHolWoPunchOdShape,
  MIN_HOURS_FOR_PUNCH_CONTEXT,
  FULL_DAY_HOURS_THRESHOLD,
} = require('../utils/holwoOdPunchResolver');

function normalizeIstDateStr(input) {
  const raw = String(input || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return extractISTComponents(new Date(raw)).dateStr;
}

function employeeNumberVariants(employeeNumber) {
  const raw = String(employeeNumber || '').trim();
  if (!raw) return [];
  return [...new Set([raw, raw.toUpperCase()])];
}

async function isHolidayOrWeekOff(employeeNumber, dateInput) {
  const dateStr = normalizeIstDateStr(dateInput);
  const empNos = employeeNumberVariants(employeeNumber);
  if (empNos.length === 0) return false;
  const ps = await PreScheduledShift.findOne({
    employeeNumber: { $in: empNos },
    date: dateStr,
    status: { $in: ['WO', 'HOL'] },
  });
  return !!ps;
}

/**
 * Full context for GET /od/check-holiday: roster HOL/WO + optional punch-based suggestion.
 */
async function getHolidayWeekOffOdApplyContext(empNo, dateInput) {
  const dateStr = normalizeIstDateStr(dateInput);
  const empNos = employeeNumberVariants(empNo);
  const preferredEmp = empNos[0] || String(empNo || '').trim().toUpperCase();
  const isHolWo = await isHolidayOrWeekOff(preferredEmp, dateStr);
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
    employeeNumber: { $in: empNos.length ? empNos : [preferredEmp] },
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
