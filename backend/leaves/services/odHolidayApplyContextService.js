/**
 * Holiday / week-off OD apply context: roster check + optional punch-based half/full (aligned with auto-OD heuristics).
 * When there are no qualifying punches, callers should use legacy free-form apply behaviour.
 */

const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const { extractISTComponents } = require('../../shared/utils/dateUtils');
const { parseRosterHalfNonWorking } = require('../../shifts/utils/rosterHalfNonWorking');
const {
  getPunchBasedOdSuggestionForRecord,
  getAutoOdEligibilityFromRecord,
  extractPunchTimingsFromRecord,
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
  })
    .select('status firstHalfStatus secondHalfStatus shiftId')
    .lean();
  if (!ps) return false;
  if (ps.status === 'WO' || ps.status === 'HOL') return true;
  const parsed = parseRosterHalfNonWorking(ps);
  return !!(parsed.firstHOL || parsed.secondHOL || parsed.firstWO || parsed.secondWO);
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
  const timings = s.hasPunches ? extractPunchTimingsFromRecord(record) : {
    odStartTime: null,
    odEndTime: null,
    durationHours: null,
  };
  return {
    isHolidayOrWeekOff: true,
    hasPunches: s.hasPunches,
    suggestedOdTypeExtended: s.suggestedOdTypeExtended,
    totalWorkingHours: s.totalWorkingHours,
    punchContextDetail: s.punchContextDetail,
    odStartTime: timings.odStartTime,
    odEndTime: timings.odEndTime,
    durationHours: timings.durationHours,
  };
}

/**
 * Punch IN/OUT for a calendar day from AttendanceDaily (legacy CO OD detail when OD row has no timings).
 */
async function getAttendancePunchTimingsForEmployeeDate(empNo, dateInput) {
  const dateStr = normalizeIstDateStr(dateInput);
  const empNos = employeeNumberVariants(empNo);
  const preferredEmp = empNos[0] || String(empNo || '').trim().toUpperCase();
  const record = await AttendanceDaily.findOne({
    employeeNumber: { $in: empNos.length ? empNos : [preferredEmp] },
    date: dateStr,
  }).lean();
  if (!record) return null;
  const timings = extractPunchTimingsFromRecord(record);
  if (!timings.odStartTime || !timings.odEndTime) return null;
  return { date: dateStr, ...timings, fromAttendance: true };
}

/** Same CO scope as OD detail: roster HOL/WO, half HOL, attendance HOL/WO status, or apply-time CO flag. */
async function odQualifiesForCoPunchDisplay(empNo, fromStr, isCOEligible) {
  if (isCOEligible === true) return true;
  if (await isHolidayOrWeekOff(empNo, fromStr)) return true;
  const { getRosterHalfHolidayForEmployeeDate } = require('./odHalfHolidayRosterService');
  const halfCtx = await getRosterHalfHolidayForEmployeeDate(empNo, fromStr);
  if (halfCtx.hasHalfHoliday) return true;
  const empNos = employeeNumberVariants(empNo);
  const preferredEmp = empNos[0] || String(empNo || '').trim().toUpperCase();
  const att = await AttendanceDaily.findOne({
    date: fromStr,
    employeeNumber: { $in: empNos.length ? empNos : [preferredEmp] },
  })
    .select('status')
    .lean();
  const st = String(att?.status || '').toUpperCase();
  return st === 'HOLIDAY' || st === 'WEEK_OFF';
}

/**
 * CO-contributing OD (holiday/week-off) missing stored punch times — attach that day's attendance timings.
 */
async function enrichCoOdWithAttendancePunchTimings(odPlain) {
  const result = typeof odPlain === 'object' && odPlain !== null ? { ...odPlain } : odPlain;
  if (!result || typeof result !== 'object') return result;
  if (result.odStartTime && result.odEndTime) return result;

  const empNo = result.emp_no || result.employeeId?.emp_no;
  if (!empNo || !result.fromDate) return result;

  const fromStr = normalizeIstDateStr(result.fromDate);
  const qualifies = await odQualifiesForCoPunchDisplay(empNo, fromStr, result.isCOEligible);
  if (!qualifies) return result;

  const timings = await getAttendancePunchTimingsForEmployeeDate(empNo, fromStr);
  if (timings) {
    result.attendancePunchTimings = timings;
  } else {
    result.attendanceNotLoggedForDay = true;
    result.attendanceNotLoggedDate = fromStr;
  }
  return result;
}

module.exports = {
  isHolidayOrWeekOff,
  getPunchBasedOdSuggestionForRecord,
  getAutoOdEligibilityFromRecord,
  extractPunchTimingsFromRecord,
  resolveHolWoPunchOdShape,
  getHolidayWeekOffOdApplyContext,
  getAttendancePunchTimingsForEmployeeDate,
  odQualifiesForCoPunchDisplay,
  enrichCoOdWithAttendancePunchTimings,
  MIN_HOURS_FOR_PUNCH_CONTEXT,
  FULL_DAY_HOURS_THRESHOLD,
};
