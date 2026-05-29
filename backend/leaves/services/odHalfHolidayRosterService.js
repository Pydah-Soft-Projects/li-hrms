/**
 * Half-day roster holiday rules for OD + leave apply + reconciliation.
 */

const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const { parseRosterHalfNonWorking } = require('../../shifts/utils/rosterHalfNonWorking');

const NARROW_REMARK =
  'Narrowed due to half-day holiday: OD limited to working half only (0.5d).';
const REJECT_SAME_HALF_REMARK =
  'Half-day OD rejected: cannot apply OD on the roster holiday half.';
const LEAVE_NARROW_REMARK =
  'Narrowed due to half-day holiday: leave limited to working half only (0.5d).';
const LEAVE_REJECT_SAME_HALF_REMARK =
  'Half-day leave rejected: cannot apply leave on the roster holiday half.';

function employeeNumberVariants(employeeNumber) {
  const raw = String(employeeNumber || '').trim();
  if (!raw) return [];
  return [...new Set([raw, raw.toUpperCase()])];
}

/**
 * @returns {Promise<{
 *   hasHalfHoliday: boolean,
 *   holidayHalf: 'first_half'|'second_half'|null,
 *   workingHalf: 'first_half'|'second_half'|null,
 *   parsed: object|null,
 * }>}
 */
async function getRosterHalfHolidayForEmployeeDate(employeeNumber, dateStr) {
  const empNos = employeeNumberVariants(employeeNumber);
  if (!empNos.length || !dateStr) {
    return { hasHalfHoliday: false, holidayHalf: null, workingHalf: null, parsed: null };
  }
  const row = await PreScheduledShift.findOne({
    employeeNumber: { $in: empNos },
    date: dateStr,
  })
    .select('status shiftId firstHalfStatus secondHalfStatus')
    .lean();
  const parsed = parseRosterHalfNonWorking(row);
  if (parsed.isFullHOL) {
    return { hasHalfHoliday: false, holidayHalf: null, workingHalf: null, parsed };
  }
  const holidayHalf = parsed.firstHOL
    ? 'first_half'
    : parsed.secondHOL
      ? 'second_half'
      : null;
  if (!holidayHalf) {
    return { hasHalfHoliday: false, holidayHalf: null, workingHalf: null, parsed };
  }
  const workingHalf = holidayHalf === 'first_half' ? 'second_half' : 'first_half';
  return { hasHalfHoliday: true, holidayHalf, workingHalf, parsed };
}

function isFullDayOdRequest({ isHalfDay, halfDayType, odType_extended, numberOfDays }) {
  if (String(odType_extended || '') === 'hours') return false;
  if (isHalfDay || String(odType_extended || '') === 'half_day') return false;
  const nd = Number(numberOfDays);
  if (Number.isFinite(nd) && nd > 0 && nd < 1 - 1e-6) return false;
  return true;
}

function isHalfDayOdRequest({ isHalfDay, halfDayType, odType_extended, numberOfDays }) {
  if (String(odType_extended || '') === 'hours') return false;
  if (isHalfDay || String(odType_extended || '') === 'half_day') return true;
  const nd = Number(numberOfDays);
  return Number.isFinite(nd) && nd > 0 && nd < 1 - 1e-6;
}

function halfDayTypeFromOd(odOrPayload) {
  const t = String(odOrPayload?.halfDayType || '').trim();
  if (t === 'second_half') return 'second_half';
  return 'first_half';
}

/**
 * Apply-time validation / auto-narrow for single-day OD on half roster holiday.
 * @returns {{ ok: boolean, error?: string, narrowed?: boolean, halfDayType?: string, isHalfDay?: boolean, numberOfDays?: number, odType_extended?: string, remark?: string }}
 */
async function resolveOdApplyAgainstHalfHoliday(employeeNumber, dateStr, payload) {
  const ctx = await getRosterHalfHolidayForEmployeeDate(employeeNumber, dateStr);
  if (!ctx.hasHalfHoliday) {
    return { ok: true };
  }

  const isHalf = isHalfDayOdRequest(payload);
  const isFull = isFullDayOdRequest(payload);
  const odHalf = halfDayTypeFromOd(payload);

  if (isHalf && odHalf === ctx.holidayHalf) {
    return {
      ok: false,
      error: `Cannot apply OD on ${ctx.holidayHalf === 'first_half' ? 'first' : 'second'} half — that half is a roster holiday.`,
    };
  }

  if (isFull) {
    return {
      ok: true,
      narrowed: true,
      isHalfDay: true,
      halfDayType: ctx.workingHalf,
      numberOfDays: 0.5,
      odType_extended: 'half_day',
      remark: NARROW_REMARK,
    };
  }

  return { ok: true };
}

function applyNarrowFieldsToOdDoc(od, workingHalf, detail) {
  od.isHalfDay = true;
  od.halfDayType = workingHalf;
  od.numberOfDays = 0.5;
  od.odType_extended = 'half_day';
  const line = detail || NARROW_REMARK;
  const prev = String(od.remarks || '').trim();
  if (!prev.includes(line)) {
    od.remarks = prev ? `${prev}\n${line}` : line;
  }
}

function isFullDayLeaveRequest({ isHalfDay, numberOfDays }) {
  if (isHalfDay) return false;
  const nd = Number(numberOfDays);
  return Number.isFinite(nd) && nd >= 1 - 1e-6;
}

function isHalfDayLeaveRequest({ isHalfDay, numberOfDays }) {
  if (isHalfDay) return true;
  const nd = Number(numberOfDays);
  return Number.isFinite(nd) && nd > 0 && nd < 1 - 1e-6;
}

function halfDayTypeFromLeave(leaveOrPayload) {
  const t = String(leaveOrPayload?.halfDayType || '').trim();
  if (t === 'second_half') return 'second_half';
  return 'first_half';
}

async function resolveLeaveApplyAgainstHalfHoliday(employeeNumber, dateStr, payload) {
  const ctx = await getRosterHalfHolidayForEmployeeDate(employeeNumber, dateStr);
  if (!ctx.hasHalfHoliday) {
    return { ok: true };
  }

  const isHalf = isHalfDayLeaveRequest(payload);
  const isFull = isFullDayLeaveRequest(payload);
  const leaveHalf = halfDayTypeFromLeave(payload);

  if (isHalf && leaveHalf === ctx.holidayHalf) {
    return {
      ok: false,
      error: `Cannot apply leave on ${ctx.holidayHalf === 'first_half' ? 'first' : 'second'} half — that half is a roster holiday.`,
    };
  }

  if (isFull) {
    return {
      ok: true,
      narrowed: true,
      isHalfDay: true,
      halfDayType: ctx.workingHalf,
      numberOfDays: 0.5,
      remark: LEAVE_NARROW_REMARK,
    };
  }

  return { ok: true };
}

function applyNarrowFieldsToLeaveDoc(leave, workingHalf, detail) {
  leave.isHalfDay = true;
  leave.halfDayType = workingHalf;
  leave.numberOfDays = 0.5;
  const line = detail || LEAVE_NARROW_REMARK;
  const prev = String(leave.remarks || '').trim();
  if (!prev.includes(line)) {
    leave.remarks = prev ? `${prev}\n${line}` : line;
  }
}

module.exports = {
  NARROW_REMARK,
  REJECT_SAME_HALF_REMARK,
  LEAVE_NARROW_REMARK,
  LEAVE_REJECT_SAME_HALF_REMARK,
  getRosterHalfHolidayForEmployeeDate,
  isFullDayOdRequest,
  isHalfDayOdRequest,
  halfDayTypeFromOd,
  isFullDayLeaveRequest,
  isHalfDayLeaveRequest,
  halfDayTypeFromLeave,
  resolveOdApplyAgainstHalfHoliday,
  resolveLeaveApplyAgainstHalfHoliday,
  applyNarrowFieldsToOdDoc,
  applyNarrowFieldsToLeaveDoc,
};
