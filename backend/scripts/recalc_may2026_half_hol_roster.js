/**
 * Recalculate May 2026 monthly summary for employees on 2nd-half HOL roster for TARGET_DATE.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const { parseRosterHalfNonWorking } = require('../shifts/utils/rosterHalfNonWorking');
const { calculateMonthlySummaryByEmpNo } = require('../attendance/services/summaryCalculationService');

const TARGET_DATE = process.env.TARGET_DATE || '2026-05-19';
const MONTH = process.env.MONTH || '2026-05';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const rows = await PreScheduledShift.find({ date: TARGET_DATE })
    .select('employeeNumber firstHalfStatus secondHalfStatus status')
    .lean();
  const empNos = [];
  for (const row of rows) {
    const p = parseRosterHalfNonWorking(row);
    if (p.secondHOL && !p.firstHOL && !p.isFullHOL) {
      empNos.push(String(row.employeeNumber || '').trim().toUpperCase());
    }
  }
  const unique = [...new Set(empNos)];
  console.log('Recalculating', unique.length, 'employees for', MONTH);
  let ok = 0;
  let fail = 0;
  for (const empNo of unique) {
    try {
      await calculateMonthlySummaryByEmpNo(empNo, MONTH);
      ok += 1;
      if (ok % 50 === 0) console.log('  ...', ok);
    } catch (e) {
      fail += 1;
      console.warn('FAIL', empNo, e.message);
    }
  }
  console.log('Done. ok=', ok, 'fail=', fail);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
