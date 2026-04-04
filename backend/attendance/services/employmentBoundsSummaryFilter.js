const { extractISTComponents } = require('../../shared/utils/dateUtils');

/**
 * True if calendar dateStr (YYYY-MM-DD) is within [DOJ, last working day] inclusive.
 */
function employmentDateInRange(dateStr, dojStr, leftDateStr) {
  if (!dateStr) return false;
  if (dojStr && dateStr < dojStr) return false;
  if (leftDateStr && dateStr > leftDateStr) return false;
  return true;
}

/**
 * Remove contributingDates rows outside employment and realign WO/HOL totals.
 * Use on API responses so UI matches DOJ/leftDate even if DB summary predates engine fixes.
 */
function filterMonthlySummaryForEmploymentBounds(summary, employeeDoc) {
  if (!summary) return summary;
  const emp = employeeDoc || {};
  const dojStr = emp.doj ? extractISTComponents(emp.doj).dateStr : null;
  const leftDateStr = emp.leftDate ? extractISTComponents(emp.leftDate).dateStr : null;
  if (!dojStr && !leftDateStr) return summary;

  const cd = summary.contributingDates;
  if (!cd || typeof cd !== 'object') return summary;

  const rowDateStr = (x) => {
    if (!x || x.date == null) return '';
    const d = x.date;
    if (typeof d === 'string') return d.substring(0, 10);
    return extractISTComponents(d instanceof Date ? d : new Date(d)).dateStr;
  };

  const inEmpRow = (x) => employmentDateInRange(rowDateStr(x), dojStr, leftDateStr);

  const weeklyOffs = (cd.weeklyOffs || []).filter(inEmpRow);
  const holidays = (cd.holidays || []).filter(inEmpRow);

  const woSum = weeklyOffs.reduce((s, x) => s + (Number(x.value) || 1), 0);
  const holSum = holidays.reduce((s, x) => s + (Number(x.value) || 1), 0);

  const out = typeof summary.toObject === 'function' ? summary.toObject() : { ...summary };
  out.contributingDates = { ...cd, weeklyOffs, holidays };
  out.totalWeeklyOffs = woSum;
  out.totalHolidays = holSum;
  return out;
}

module.exports = {
  employmentDateInRange,
  filterMonthlySummaryForEmploymentBounds,
};
