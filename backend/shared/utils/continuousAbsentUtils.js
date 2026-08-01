/**
 * Continuous ABSENT streak helpers for pay-register / payroll-batch warnings.
 * Strict AttendanceDaily.status === 'ABSENT' (WEEK_OFF / HOLIDAY / PRESENT break the chain).
 */

const AttendanceDaily = require('../../attendance/model/AttendanceDaily');

function ymd(d) {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function todayYmdUTC() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysYmd(ymdStr, delta) {
  const dt = new Date(`${ymdStr}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function enumerateDatesInclusive(fromYmd, toYmd) {
  const out = [];
  if (!fromYmd || !toYmd || fromYmd > toYmd) return out;
  let cur = fromYmd;
  while (cur <= toYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

/**
 * Scan window for an incomplete batch of pay period [periodStart, periodEnd]:
 * from periodStart through max(periodEnd, today) so post-period abscond is visible
 * on the previous incomplete batch.
 */
function buildIncompleteBatchAbsentScanRange(periodStartYmd, periodEndYmd, asOfYmd = todayYmdUTC()) {
  const start = ymd(periodStartYmd);
  const end = ymd(periodEndYmd);
  const asOf = ymd(asOfYmd) || todayYmdUTC();
  if (!start || !end) return null;
  const scanTo = asOf > end ? asOf : end;
  return { scanFrom: start, scanTo };
}

/**
 * Find consecutive ABSENT windows of at least minDays from a date→status map.
 * Returns the most recent window (by toDate), or null.
 */
function findLatestContinuousAbsentWindow(statusByDate, scanFrom, scanTo, minDays = 3) {
  const dates = enumerateDatesInclusive(ymd(scanFrom), ymd(scanTo));
  if (!dates.length) return null;

  let best = null;
  let runStart = null;
  let runLen = 0;

  const flush = (endDate) => {
    if (runLen >= minDays && runStart) {
      const window = {
        active: true,
        fromDate: runStart,
        toDate: endDate,
        days: runLen,
      };
      if (!best || window.toDate > best.toDate || (window.toDate === best.toDate && window.days > best.days)) {
        best = window;
      }
    }
  };

  for (const date of dates) {
    const status = statusByDate.get(date);
    if (status === 'ABSENT') {
      if (!runStart) runStart = date;
      runLen += 1;
    } else {
      if (runStart) flush(addDaysYmd(date, -1));
      runStart = null;
      runLen = 0;
    }
  }
  if (runStart) flush(dates[dates.length - 1]);

  return best;
}

/**
 * Batch-load AttendanceDaily and compute continuousAbsent per emp_no.
 * @returns {Map<string, {active, fromDate, toDate, days}|null>}
 */
async function mapContinuousAbsentForEmployees(empNos, scanFrom, scanTo, minDays = 3) {
  const result = new Map();
  const nos = (empNos || []).map((n) => String(n || '').toUpperCase()).filter(Boolean);
  for (const n of nos) result.set(n, null);
  if (!nos.length || !scanFrom || !scanTo || scanFrom > scanTo) return result;

  const rows = await AttendanceDaily.find({
    employeeNumber: { $in: nos },
    date: { $gte: scanFrom, $lte: scanTo },
  })
    .select('employeeNumber date status')
    .lean();

  const byEmp = new Map();
  for (const r of rows) {
    const emp = String(r.employeeNumber || '').toUpperCase();
    if (!byEmp.has(emp)) byEmp.set(emp, new Map());
    byEmp.get(emp).set(String(r.date).slice(0, 10), r.status);
  }

  for (const emp of nos) {
    const statusMap = byEmp.get(emp) || new Map();
    result.set(emp, findLatestContinuousAbsentWindow(statusMap, scanFrom, scanTo, minDays));
  }
  return result;
}

function formatContinuousAbsentLabel(window) {
  if (!window?.active) return '';
  return `Continuous absent ${window.fromDate} → ${window.toDate} (${window.days} days) — verify before completing this batch`;
}

module.exports = {
  ymd,
  todayYmdUTC,
  addDaysYmd,
  enumerateDatesInclusive,
  buildIncompleteBatchAbsentScanRange,
  findLatestContinuousAbsentWindow,
  mapContinuousAbsentForEmployees,
  formatContinuousAbsentLabel,
};
