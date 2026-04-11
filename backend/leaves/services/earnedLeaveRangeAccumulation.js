/**
 * Attendance-range EL: cumulative stacking by **min-days threshold**.
 * For each range (sorted by minDays ascending), if effectiveDays >= minDays, add range.elEarned.
 * Result is capped by maxELPerMonth.
 *
 * Aligns with Leave Policy UI "Attendance ranges (cumulative)".
 */
function accumulateAttendanceRangeEl(attendanceRanges, effectiveDays, maxELPerMonth) {
  const ranges = Array.isArray(attendanceRanges) ? attendanceRanges : [];
  const sortedRanges = [...ranges].sort((a, b) => Number(a.minDays) - Number(b.minDays));
  let elEarned = 0;
  const rangeBreakdown = [];

  for (const range of sortedRanges) {
    const minD = Number(range.minDays);
    const maxD = Number(range.maxDays);
    if (!Number.isFinite(minD)) continue;
    if (effectiveDays + 1e-9 >= minD) {
      const add = Number(range.elEarned) || 0;
      elEarned += add;
      rangeBreakdown.push({
        range: `${minD}-${Number.isFinite(maxD) ? maxD : '?' } days`,
        elEarned: add,
        description: range.description,
        cumulative: true,
        triggeredBecauseCreditDaysGteMin: true,
      });
    }
  }

  const cap = Number(maxELPerMonth);
  const capped = Number.isFinite(cap) && cap >= 0 ? Math.min(elEarned, cap) : elEarned;
  return { elEarned: capped, rangeBreakdown };
}

module.exports = { accumulateAttendanceRangeEl };
