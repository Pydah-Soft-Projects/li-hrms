/**
 * Pay Register "All" summary — same day-units as pay-register / frontend payRegisterAllSummaryRow.
 * @param {Object|null|undefined} s - Monthly attendance summary
 * @param {string} [processingMode] - 'single_shift' uses present + partial − overlap (see totalsCalculationService.syncTotalsFromMonthlySummary)
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function contributingDatesPartialPresentOverlap(summary) {
  const cd = summary && summary.contributingDates;
  if (!cd || typeof cd !== 'object') return 0;
  const partialArr = cd.partial;
  const presentArr = cd.present;
  if (!Array.isArray(partialArr) || !Array.isArray(presentArr) || partialArr.length === 0) return 0;

  const presentByDate = new Map();
  for (const e of presentArr) {
    if (!e || !e.date) continue;
    const d = String(e.date);
    const v = Number(e.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    presentByDate.set(d, round2((presentByDate.get(d) || 0) + v));
  }
  const partialByDate = new Map();
  for (const e of partialArr) {
    if (!e || !e.date) continue;
    const d = String(e.date);
    const v = Number(e.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    partialByDate.set(d, round2((partialByDate.get(d) || 0) + v));
  }
  let t = 0;
  for (const [d, partSum] of partialByDate) {
    const pSum = presentByDate.get(d);
    if (pSum == null || pSum <= 0 || partSum <= 0) continue;
    t += Math.min(pSum, partSum);
  }
  return round2(t);
}

function getPartialPresentOverlapForSync(summary, partialRollup) {
  if (!summary || typeof summary !== 'object') return 0;
  const cdOverlap = contributingDatesPartialPresentOverlap(summary);
  let stored = 0;
  if (Object.prototype.hasOwnProperty.call(summary, 'totalPartialPresentPayableOverlap')) {
    const n = Number(summary.totalPartialPresentPayableOverlap);
    if (Number.isFinite(n)) stored = round2(n);
  }
  const raw = round2(Math.max(stored, cdOverlap));
  const partCap = round2(partialRollup);
  if (partCap <= 0) return 0;
  return round2(Math.min(raw, partCap));
}

function mergeSingleShiftPresentForPayRegisterRow(s) {
  const sPresRaw = round2(Number(s.totalPresentDays) || 0);
  const sPartRaw = round2(Number(s.totalPartialDays) || 0);
  const sOverlapRaw = getPartialPresentOverlapForSync(s, sPartRaw);
  let merged = round2(sPresRaw + sPartRaw - sOverlapRaw);
  const ceiling = round2(sPresRaw + sPartRaw);
  merged = Math.min(ceiling, Math.max(sPresRaw, merged));
  return merged;
}

function payRegisterAllRowFromSummary(s, processingMode) {
  if (!s) {
    return {
      present: 0,
      weekOffs: 0,
      holidays: 0,
      totalLeaves: 0,
      od: 0,
      absent: 0,
      totalDaysSummed: 0,
      lates: 0,
      dedAbsent: 0,
      dedLop: 0,
      attDed: 0,
      paidLeaves: 0,
      paidDays: 0,
    };
  }
  const useMerge = processingMode === 'single_shift';
  const present = useMerge
    ? mergeSingleShiftPresentForPayRegisterRow(s)
    : round2(s.totalPresentDays);
  const weekOffs = round2(s.totalWeeklyOffs);
  const holidays = round2(s.totalHolidays);
  const paidLeaves = round2(s.totalPaidLeaves);
  const lop = round2(s.totalLopLeaves);
  const totalLeaves = round2(
    s.totalLeaves != null
      ? s.totalLeaves
      : (Number(s.totalPaidLeaves) || 0) + (Number(s.totalLopLeaves) || 0)
  );
  const od = round2(s.totalODs);
  const absent = round2(s.totalAbsentDays);
  const lates =
    s.lateInCount != null || s.earlyOutCount != null
      ? (Number(s.lateInCount) || 0) + (Number(s.earlyOutCount) || 0)
      : Number(s.lateOrEarlyCount) || 0;
  const attRaw = s.totalAttendanceDeductionDays ?? s.attendanceDeductionBreakdown?.daysDeducted;
  const attDed = Number.isFinite(Number(attRaw)) ? round2(Number(attRaw)) : 0;
  const totalDaysSummed = round2(present + weekOffs + holidays + totalLeaves + od + absent);
  const paidDays = Math.max(0, round2(present + weekOffs + holidays + od + paidLeaves - attDed));
  return {
    present,
    weekOffs,
    holidays,
    totalLeaves,
    od,
    absent,
    totalDaysSummed,
    lates,
    dedAbsent: absent,
    dedLop: lop,
    attDed,
    paidLeaves,
    paidDays,
  };
}

module.exports = { payRegisterAllRowFromSummary, mergeSingleShiftPresentForPayRegisterRow };
