/**
 * Read-only audit: compare STORED monthly summaries vs fresh calculateMonthlySummary
 * WITHOUT persisting recalc (uses lean clone + in-memory compare via recalc then restore).
 *
 * Simpler approach: snapshot stored → recalc (writes) → diff → restore from snapshot.
 * Set RESTORE=1 (default) to put originals back after audit.
 *
 * Usage:
 *   node scripts/audit_june_summary_readonly.js
 *   MONTH=2026-06 node scripts/audit_june_summary_readonly.js
 *   MONTH=2026-06 RESTORE=0 node scripts/audit_june_summary_readonly.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dateCycleService = require('../leaves/services/dateCycleService');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');
const { getProcessingModeForEmployee } = require('../attendance/services/processingModeResolutionService');
const { extractISTComponents } = require('../shared/utils/dateUtils');

const FIELDS = [
  'totalDaysInMonth', 'totalPresentDays', 'totalPartialDays', 'totalAbsentDays',
  'totalPayableShifts', 'totalLeaves', 'totalODs', 'totalWeeklyOffs', 'totalHolidays',
  'lateInCount', 'totalLateInMinutes', 'earlyOutCount', 'totalEarlyOutMinutes',
];

function pick(s) {
  const o = {};
  for (const k of FIELDS) o[k] = s?.[k];
  return o;
}

function diff(a, b) {
  const d = {};
  for (const k of FIELDS) {
    const va = a?.[k];
    const vb = b?.[k];
    if (typeof va === 'number' && typeof vb === 'number') {
      if (Math.abs(va - vb) > 0.009) d[k] = { stored: va, recalc: vb, delta: Math.round((vb - va) * 100) / 100 };
    } else if (va !== vb) d[k] = { stored: va, recalc: vb };
  }
  return d;
}

function hasDiff(d) {
  return d && Object.keys(d).length > 0;
}

async function run() {
  const monthStr = process.env.MONTH || '2026-06';
  const [year, monthNumber] = monthStr.split('-').map(Number);
  const restore = process.env.RESTORE !== '0' && process.env.RESTORE !== 'false';

  await mongoose.connect(process.env.MONGODB_URI);
  const period = await dateCycleService.getPayrollCycleForMonth(year, monthNumber);
  const startDate = extractISTComponents(period.startDate).dateStr;
  const endDate = extractISTComponents(period.endDate).dateStr;

  console.log(`\n=== June summary audit (${monthStr}) ===`);
  console.log(`Pay period: ${startDate} → ${endDate}`);
  console.log(`Restore originals after audit: ${restore}\n`);

  const summaries = await MonthlyAttendanceSummary.find({ month: monthStr }).lean();
  console.log(`Found ${summaries.length} stored summaries\n`);

  const snapshots = new Map();
  for (const s of summaries) snapshots.set(String(s._id), s);

  const mismatches = [];
  const singleShiftMismatches = [];
  let processed = 0;
  let unchanged = 0;
  let failed = 0;

  for (const s of summaries) {
    const stored = pick(s);
    let recalcTotals = null;
    let mode = 'unknown';
    try {
      const emp = await Employee.findById(s.employeeId).select('division_id emp_no').lean();
      const pm = emp ? await getProcessingModeForEmployee(emp) : null;
      mode = pm?.mode || 'unknown';

      const fresh = await calculateMonthlySummary(s.employeeId, s.emp_no, year, monthNumber);
      recalcTotals = pick(fresh);

      const d = diff(stored, recalcTotals);
      if (hasDiff(d)) {
        const row = { emp_no: s.emp_no, mode, stored, recalc: recalcTotals, diff: d };
        mismatches.push(row);
        if (mode === 'single_shift') singleShiftMismatches.push(row);
      } else {
        unchanged += 1;
      }
      processed += 1;
      if (processed % 50 === 0) console.log(`  ... ${processed}/${summaries.length}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${s.emp_no}:`, err.message);
    }
  }

  if (restore) {
    console.log('\nRestoring original summary documents...');
    for (const [id, snap] of snapshots) {
      const { _id, __v, ...rest } = snap;
      await MonthlyAttendanceSummary.updateOne({ _id: snap._id }, { $set: rest });
    }
    console.log('Restore complete.\n');
  }

  // Daily-only naive totals for mismatch employees (quick signal)
  for (const row of mismatches.slice(0, 30)) {
    const empNo = String(row.emp_no).toUpperCase();
    const dailies = await AttendanceDaily.find({
      employeeNumber: empNo,
      date: { $gte: startDate, $lte: endDate },
    })
      .select('status payableShifts')
      .lean();
    let naivePresent = 0;
    let naivePayable = 0;
    let naivePartial = 0;
    let naiveAbsent = 0;
    for (const d of dailies) {
      if (d.status === 'PRESENT') naivePresent += 1;
      else if (d.status === 'HALF_DAY') naivePresent += 0.5;
      else if (d.status === 'PARTIAL') naivePartial += 1;
      else if (d.status === 'ABSENT') naiveAbsent += 1;
      naivePayable += Number(d.payableShifts) || 0;
    }
    row.naiveFromDailies = {
      present: naivePresent,
      partial: naivePartial,
      absent: naiveAbsent,
      payable: Math.round(naivePayable * 100) / 100,
      dailyCount: dailies.length,
    };
  }

  const report = {
    month: monthStr,
    period: { start: startDate, end: endDate },
    total: summaries.length,
    unchanged,
    mismatches: mismatches.length,
    singleShiftMismatches: singleShiftMismatches.length,
    failed,
    restored: restore,
    mismatchDetails: mismatches,
  };

  const outDir = path.resolve(__dirname, '../../tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `june-summary-audit-${monthStr}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  console.log('========== RESULTS ==========');
  console.log(`Unchanged (stored = fresh recalc): ${unchanged}`);
  console.log(`Mismatches (stored ≠ fresh recalc): ${mismatches.length}`);
  console.log(`  of which single_shift: ${singleShiftMismatches.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`Report: ${outFile}\n`);

  if (mismatches.length > 0) {
    console.log('Top mismatches (emp_no | mode | field deltas):');
    for (const row of mismatches.slice(0, 20)) {
      const keys = Object.keys(row.diff).join(', ');
      console.log(`  ${row.emp_no} | ${row.mode} | ${keys}`);
      for (const [k, v] of Object.entries(row.diff)) {
        console.log(`      ${k}: stored=${v.stored} → recalc=${v.recalc} (Δ${v.delta ?? 'n/a'})`);
      }
      if (row.naiveFromDailies) {
        console.log(`      naive dailies: pres=${row.naiveFromDailies.present} part=${row.naiveFromDailies.partial} abs=${row.naiveFromDailies.absent} pay=${row.naiveFromDailies.payable}`);
        console.log(`      stored:        pres=${row.stored.totalPresentDays} part=${row.stored.totalPartialDays} abs=${row.stored.totalAbsentDays} pay=${row.stored.totalPayableShifts}`);
        console.log(`      recalc:        pres=${row.recalc.totalPresentDays} part=${row.recalc.totalPartialDays} abs=${row.recalc.totalAbsentDays} pay=${row.recalc.totalPayableShifts}`);
      }
      console.log('');
    }
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
