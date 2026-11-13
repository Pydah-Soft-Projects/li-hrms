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
  totalWorkingHours,
}) {
  if (hasPresentShift || totalPayableWithOD >= 0.95) return 'PRESENT';
  if (odPayableContribution > 0) return 'OD';
  // Standard 4.0h half-day with 15m grace: 3.75 hours (3h 45m)
  if (totalPayableWithOD >= 0.45 || (Number(totalWorkingHours) >= 3.75 - 1e-6 && hasPunches)) return 'HALF_DAY';
  return hasPunches ? 'PARTIAL' : 'ABSENT';
}

module.exports = {
  resolveDailyStatusFromShiftTotals,
};
