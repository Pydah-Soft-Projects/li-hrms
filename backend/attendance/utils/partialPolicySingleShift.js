/**
 * Single-shift PARTIAL policy pay-register halves: worked half = present, missing working half = LOP leave.
 * Independent of partialDaysContributeToPayableShifts (payable flag only affects pay totals, not LOP display).
 */

const PRESENT_HALF = {
  status: 'present',
  leaveType: null,
  leaveNature: null,
  isOD: false,
  otHours: 0,
};

const LOP_HALF = {
  status: 'leave',
  leaveType: 'lop',
  leaveNature: 'lop',
  isOD: false,
  otHours: 0,
};

/**
 * @param {object} snapshot - pay register day snapshot
 * @param {boolean} usePartialPolicy - apply when true (single-shift partial policy day)
 * @param {number} dayPayable
 * @param {number} partialLopPortion - policy LOP units (0..1)
 * @param {number} attFirst - 0 or 0.5
 * @param {number} attSecond - 0 or 0.5
 */
function enforceSingleShiftPartialLopSnapshot(
  snapshot,
  usePartialPolicy,
  dayPayable,
  partialLopPortion,
  attFirst,
  attSecond
) {
  if (!snapshot || !usePartialPolicy) return snapshot;
  const lop = Math.min(1, Math.max(0, Number(partialLopPortion) || 0));
  if (lop <= 0.001) return snapshot;

  const af = Number(attFirst) || 0;
  const as = Number(attSecond) || 0;

  if (af >= 0.5 && as < 0.5) {
    return {
      ...snapshot,
      firstHalf: { ...PRESENT_HALF },
      secondHalf: { ...LOP_HALF },
      isSplit: true,
      status: null,
      leaveType: null,
      leaveNature: null,
      isOD: false,
    };
  }
  if (as >= 0.5 && af < 0.5) {
    return {
      ...snapshot,
      firstHalf: { ...LOP_HALF },
      secondHalf: { ...PRESENT_HALF },
      isSplit: true,
      status: null,
      leaveType: null,
      leaveNature: null,
      isOD: false,
    };
  }

  const pay = Math.min(1, Math.max(0, Number(dayPayable) || 0));
  if (pay >= 0.5 - 1e-6 && lop >= 0.5 - 1e-6 && pay + lop <= 1.0001) {
    return {
      ...snapshot,
      firstHalf: { ...PRESENT_HALF },
      secondHalf: { ...LOP_HALF },
      isSplit: true,
      status: null,
      leaveType: null,
      leaveNature: null,
      isOD: false,
    };
  }

  return snapshot;
}

module.exports = {
  enforceSingleShiftPartialLopSnapshot,
};
