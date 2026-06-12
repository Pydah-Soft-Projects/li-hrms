const { extractISTComponents } = require('./dateUtils');

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

/**
 * Cached payroll period bounds for a calendar month label (year + month 1–12).
 * Settings changes can take up to TTL to reflect; acceptable for list views.
 */
async function getPayrollPeriodForMonth(year, month, dateCycleService) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const key = `${y}-${String(m).padStart(2, '0')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.value;
  }

  const anchorDateStr = `${y}-${String(m).padStart(2, '0')}-15`;
  const periodInfo = await dateCycleService.getPeriodInfo(new Date(anchorDateStr));
  const value = {
    startDateStr: extractISTComponents(periodInfo.payrollCycle.startDate).dateStr,
    endDateStr: extractISTComponents(periodInfo.payrollCycle.endDate).dateStr,
    startDateObj: periodInfo.payrollCycle.startDate,
    endDateObj: periodInfo.payrollCycle.endDate,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

function clearPayrollPeriodCache() {
  cache.clear();
}

module.exports = { getPayrollPeriodForMonth, clearPayrollPeriodCache, TTL_MS };
