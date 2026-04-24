/**
 * Shared contributingDates shape for MonthlyAttendanceSummary + PayRegisterSummary.
 * Keep in sync with attendance summaryCalculationService contributingDates keys.
 */
const contributingDateEntry = [{ date: String, value: Number, label: String }];

const contributingDatesShape = {
  present: contributingDateEntry,
  leaves: contributingDateEntry,
  /** Days that count only toward paid leave totals (for UI highlight). */
  paidLeaves: contributingDateEntry,
  /** Days that count only toward LOP totals — includes policy partial + sandwich LOP. */
  lopLeaves: contributingDateEntry,
  ods: contributingDateEntry,
  partial: contributingDateEntry,
  weeklyOffs: contributingDateEntry,
  holidays: contributingDateEntry,
  payableShifts: contributingDateEntry,
  otHours: contributingDateEntry,
  extraHours: contributingDateEntry,
  lateIn: contributingDateEntry,
  earlyOut: contributingDateEntry,
  permissions: contributingDateEntry,
  absent: contributingDateEntry,
  conflicts: contributingDateEntry,
};

module.exports = {
  contributingDatesShape,
};
