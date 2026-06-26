'use strict';

/**
 * Daily status from shift rows + OD payable (AttendanceDaily pre-save).
 * When total payable reaches a full day (e.g. two 0.5 half-segment rows), status is PRESENT.
 */
function resolveDailyStatusFromShiftTotals({
  hasPresentShift,
  totalPayableWithOD,
  odPayableContribution,
  hasPunches,
}) {
  if (hasPresentShift || totalPayableWithOD >= 0.95) return 'PRESENT';
  if (odPayableContribution > 0) return 'OD';
  if (totalPayableWithOD >= 0.45) return 'HALF_DAY';
  return hasPunches ? 'PARTIAL' : 'ABSENT';
}

module.exports = {
  resolveDailyStatusFromShiftTotals,
};
