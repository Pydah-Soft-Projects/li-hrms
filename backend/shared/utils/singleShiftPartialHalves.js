/**
 * Single-shift PARTIAL days: one punch only → credit exactly one calendar half toward attendance merge.
 * Other half is left for partial-day policy LOP (summary) and OD/leave reconciliation.
 *
 * - IN only (has in, no out) → first half 0.5
 * - OUT only (has out, no in) → second half 0.5
 * - Both or neither → 0 / 0 (caller keeps legacy behaviour)
 *
 * @param {object|null} attendance - AttendanceDaily-like { status, shifts, inTime, outTime }
 * @returns {{ attFirst: number, attSecond: number, workedHalf: 'first'|'second'|null }}
 */
function getSingleShiftPartialPunchHalves(attendance) {
  if (!attendance || String(attendance.status || '').toUpperCase() !== 'PARTIAL') {
    return { attFirst: 0, attSecond: 0, workedHalf: null };
  }
  const shifts = Array.isArray(attendance.shifts) ? attendance.shifts : [];
  const hasIn = shifts.some((s) => s && s.inTime) || !!attendance.inTime;
  const hasOut = shifts.some((s) => s && s.outTime) || !!attendance.outTime;
  if (hasIn && !hasOut) {
    return { attFirst: 0.5, attSecond: 0, workedHalf: 'first' };
  }
  if (!hasIn && hasOut) {
    return { attFirst: 0, attSecond: 0.5, workedHalf: 'second' };
  }
  return { attFirst: 0, attSecond: 0, workedHalf: null };
}

module.exports = {
  getSingleShiftPartialPunchHalves,
};
