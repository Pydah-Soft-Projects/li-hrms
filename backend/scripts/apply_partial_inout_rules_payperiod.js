/**
 * Apply new PARTIAL IN+OUT rules to stored AttendanceDaily rows, then recalc monthly summaries.
 *
 * - Re-saves each matching daily (pre-save: reconcilePartialDayStatus → ABSENT when below half-day, etc.)
 * - Recalculates monthly summary for the payroll month (default 2026-05)
 *
 * Usage (from backend/):
 *   node scripts/apply_partial_inout_rules_payperiod.js
 *   MONTH=2026-05 DRY_RUN=1 node scripts/apply_partial_inout_rules_payperiod.js
 *   MONTH=2026-05 EMP_LIST=1715 node scripts/apply_partial_inout_rules_payperiod.js
 *   MONTH=2026-05 SKIP_SUMMARY=1 node scripts/apply_partial_inout_rules_payperiod.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceSettings = require('../attendance/model/AttendanceSettings');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');
const {
  dailyHasShiftLevelIn,
  dailyHasShiftLevelOut,
  partialInOutSatisfiesHalfDay,
  partialSingleShiftHalfCredits,
  reconcilePartialDayStatus,
} = require('../attendance/utils/attendanceHalfPresence');
const { calculateAllEmployeesSummary, calculateMonthlySummaryByEmpNo } = require('../attendance/services/summaryCalculationService');

const MONTH = process.env.MONTH || '2026-05';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const SKIP_SUMMARY = process.env.SKIP_SUMMARY === '1' || process.env.SKIP_SUMMARY === 'true';
/** When true (default), only .save() rows whose status/payable would change — much faster. */
const ONLY_CHANGED =
  process.env.ONLY_CHANGED !== '0' && process.env.ONLY_CHANGED !== 'false';
/** Skip daily saves; only recalc monthly summaries (uses new summary/half-credit code). */
const RECALC_ONLY = process.env.RECALC_ONLY === '1' || process.env.RECALC_ONLY === 'true';
const EMP_FILTER = (process.env.EMP_LIST || '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

function snapshot(doc) {
  return {
    status: doc.status,
    payableShifts: doc.payableShifts,
  };
}

/** Predict status/payable after pre-save reconcile (single-shift PARTIAL IN+OUT). */
function predictAfterPreSave(doc, processingMode) {
  const before = snapshot(doc);
  if (processingMode !== 'single_shift') return before;
  const hasIn = dailyHasShiftLevelIn(doc);
  const hasOut = dailyHasShiftLevelOut(doc);
  if (!hasIn || !hasOut) return before;
  if (String(doc.status || '').toUpperCase() === 'PARTIAL' && reconcilePartialDayStatus(doc) === 'ABSENT') {
    return { status: 'ABSENT', payableShifts: 0 };
  }
  return before;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);

  const attSettings = await AttendanceSettings.getSettings();
  const pm = AttendanceSettings.getProcessingMode(attSettings);
  if (pm.mode !== 'single_shift') {
    console.warn('Warning: processing mode is', pm.mode, '— script targets single_shift PARTIAL rules.');
  }

  const [year, monthNumber] = MONTH.split('-').map(Number);
  const anchor = createISTDate(`${MONTH}-15`, '12:00');
  const { payrollCycle } = await dateCycleService.getPeriodInfo(anchor);
  const startStr = extractISTComponents(payrollCycle.startDate).dateStr;
  const endStr = extractISTComponents(payrollCycle.endDate).dateStr;

  console.log('\nApply PARTIAL IN+OUT rules');
  console.log('Pay period:', startStr, '→', endStr, '| MONTH label:', MONTH);
  console.log(
    'DRY_RUN:',
    DRY_RUN,
    '| SKIP_SUMMARY:',
    SKIP_SUMMARY,
    '| ONLY_CHANGED:',
    ONLY_CHANGED,
    '| RECALC_ONLY:',
    RECALC_ONLY
  );
  if (EMP_FILTER.length) console.log('EMP_LIST:', EMP_FILTER.join(', '));

  const query = { date: { $gte: startStr, $lte: endStr } };
  if (EMP_FILTER.length) query.employeeNumber = { $in: EMP_FILTER };

  const changed = [];
  const examined = [];
  let saved = 0;
  let skipped = 0;
  let unchangedSkip = 0;

  if (!RECALC_ONLY) {
  const docs = await AttendanceDaily.find(query).sort({ employeeNumber: 1, date: 1 });
  console.log('AttendanceDaily rows in period:', docs.length);

  for (const doc of docs) {
    const hasIn = dailyHasShiftLevelIn(doc);
    const hasOut = dailyHasShiftLevelOut(doc);
    if (!hasIn || !hasOut) {
      skipped += 1;
      continue;
    }

    const halfDayMet = partialInOutSatisfiesHalfDay(doc);
    const credits = partialSingleShiftHalfCredits(doc);
    const wouldAbsent =
      String(doc.status || '').toUpperCase() === 'PARTIAL' && reconcilePartialDayStatus(doc) === 'ABSENT';

    examined.push({
      empNo: doc.employeeNumber,
      date: doc.date,
      before: snapshot(doc),
      halfDayMet,
      credits,
      wouldAbsent,
    });

    const before = snapshot(doc);
    const predicted = predictAfterPreSave(doc, pm.mode);
    const willChange =
      predicted.status !== before.status ||
      Number(predicted.payableShifts) !== Number(before.payableShifts);

    if (!willChange && ONLY_CHANGED) {
      unchangedSkip += 1;
      continue;
    }

    if (DRY_RUN) {
      if (willChange) {
        changed.push({
          empNo: doc.employeeNumber,
          date: doc.date,
          before,
          after: predicted,
          halfDayMet,
          credits,
        });
      }
      continue;
    }

    await doc.save();
    saved += 1;
    const after = snapshot(doc);
    if (after.status !== before.status || after.payableShifts !== before.payableShifts) {
      changed.push({
        empNo: doc.employeeNumber,
        date: doc.date,
        before,
        after,
        halfDayMet,
        credits,
      });
    }
  }

  } else {
    console.log('RECALC_ONLY: skipping AttendanceDaily saves.');
  }

  console.log(
    '\nIN+OUT dailies examined:',
    examined.length,
    '| no IN+OUT skip:',
    skipped,
    '| unchanged skip:',
    unchangedSkip
  );
  console.log('Rows saved (pre-save applied):', DRY_RUN ? 0 : saved);
  console.log('Rows with status/payable change:', changed.length);

  for (const c of changed.slice(0, 80)) {
    console.log(
      `  ${c.date} ${c.empNo} | ${c.before.status}/${c.before.payableShifts} → ${c.after.status}/${c.after.payableShifts}` +
        ` | halfDay=${c.halfDayMet} credit=${c.credits?.attFirst}+${c.credits?.attSecond}`
    );
  }
  if (changed.length > 80) console.log(`  ... +${changed.length - 80} more`);

  const reportPath = path.join(
    __dirname,
    `apply_partial_inout_${MONTH.replace('-', '_')}${DRY_RUN ? '_dry' : ''}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        payPeriod: { startStr, endStr, month: MONTH },
        dryRun: DRY_RUN,
        examinedCount: examined.length,
        changed,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log('\nReport:', reportPath);

  if (!DRY_RUN && !SKIP_SUMMARY) {
    console.log('\nRecalculating monthly summaries for', MONTH, '...');
    if (EMP_FILTER.length) {
      for (const empNo of EMP_FILTER) {
        await calculateMonthlySummaryByEmpNo(empNo, MONTH);
        console.log('  summary OK:', empNo);
      }
    } else {
      const results = await calculateAllEmployeesSummary(year, monthNumber);
      const ok = results.filter((r) => r.success).length;
      const fail = results.filter((r) => !r.success).length;
      console.log('Summaries — success:', ok, 'failed:', fail);
      if (fail) {
        results
          .filter((r) => !r.success)
          .slice(0, 20)
          .forEach((r) => console.log('  FAIL', r.employee, r.error));
      }
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
