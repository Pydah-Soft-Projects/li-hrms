/**
 * Fix stale PARTIAL policy meta on AttendanceDaily rows that are now full PRESENT.
 *
 * Bug shape: status=PRESENT, payableShifts≈1 (full punches), but policyMeta.partialDayRule
 * still has applied=true with presentPortion=0.5 and lopPortion=0.5 from an earlier PARTIAL
 * summary write-back that was never cleared after punches completed.
 *
 * Usage (from backend/):
 *   node scripts/fix_stale_present_partial_policy.js --dry-run
 *   node scripts/fix_stale_present_partial_policy.js
 *   node scripts/fix_stale_present_partial_policy.js --from=2026-06-26 --to=2026-07-25
 *   node scripts/fix_stale_present_partial_policy.js --emp=2181,2149
 *   node scripts/fix_stale_present_partial_policy.js --skip-summary
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const {
  calculateMonthlySummaryByEmpNo,
  recalculateOnAttendanceUpdate,
} = require('../attendance/services/summaryCalculationService');

function argVal(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const DRY_RUN = hasFlag('dry-run');
const SKIP_SUMMARY = hasFlag('skip-summary');
const FROM = argVal('from', '2026-06-26');
const TO = argVal('to', '2026-07-25');
const EMP_LIST = String(argVal('emp', '') || '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

function clearedPartialDayRule(now = new Date()) {
  return {
    'policyMeta.partialDayRule.applied': false,
    'policyMeta.partialDayRule.ruleCode': null,
    'policyMeta.partialDayRule.firstHalfStatus': null,
    'policyMeta.partialDayRule.secondHalfStatus': null,
    'policyMeta.partialDayRule.presentPortion': 0,
    'policyMeta.partialDayRule.lopPortion': 0,
    'policyMeta.partialDayRule.coveredPortion': 0,
    'policyMeta.partialDayRule.note': null,
    'policyMeta.partialDayRule.updatedAt': now,
  };
}

function isStalePresentPartial(doc) {
  const status = String(doc.status || '').toUpperCase();
  if (status !== 'PRESENT') return false;

  const payable = Number(doc.payableShifts);
  const shiftPay = (Array.isArray(doc.shifts) ? doc.shifts : []).reduce(
    (s, x) => s + (Number(x?.payableShift) || 0),
    0
  );
  const effectivePayable = Math.max(
    Number.isFinite(payable) ? payable : 0,
    Number.isFinite(shiftPay) ? shiftPay : 0
  );
  // Full-day present (or more). Do not touch half-day PRESENT rows.
  if (effectivePayable < 0.999) return false;

  const partial = doc.policyMeta?.partialDayRule;
  if (!partial || partial.applied !== true) return false;

  const presentPortion = Number(partial.presentPortion) || 0;
  const lopPortion = Number(partial.lopPortion) || 0;

  // Stale if policy still claims LOP / half-credit while day is fully payable Present
  if (lopPortion > 0.001) return true;
  if (presentPortion > 0 && presentPortion < 0.999) return true;
  return false;
}

async function run() {
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== APPLYING FIX ===');
  console.log(`Range: ${FROM} → ${TO}`);
  if (EMP_LIST.length) console.log(`Emp filter: ${EMP_LIST.join(', ')}`);
  console.log(`Summary recalc: ${SKIP_SUMMARY ? 'skipped' : 'yes'}`);

  await mongoose.connect(uri);

  const filter = {
    date: { $gte: FROM, $lte: TO },
    status: 'PRESENT',
    'policyMeta.partialDayRule.applied': true,
  };
  if (EMP_LIST.length) filter.employeeNumber = { $in: EMP_LIST };

  const candidates = await AttendanceDaily.find(filter)
    .select(
      'employeeNumber date status payableShifts totalWorkingHours shifts.payableShift shifts.status policyMeta.partialDayRule lastSyncedAt updatedAt'
    )
    .lean();

  const hits = candidates.filter(isStalePresentPartial);
  console.log(`Candidates with applied partial: ${candidates.length}`);
  console.log(`Stale Present+partial rows to fix: ${hits.length}`);

  for (const h of hits) {
    const p = h.policyMeta?.partialDayRule || {};
    console.log(
      `  ${h.date}  emp=${h.employeeNumber}  payable=${h.payableShifts}  hrs=${h.totalWorkingHours}  credit=${p.presentPortion}  lop=${p.lopPortion}  halves=${p.firstHalfStatus}/${p.secondHalfStatus}`
    );
  }

  if (!hits.length) {
    console.log('Nothing to fix.');
    await mongoose.disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry run only — no writes.');
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const ops = hits.map((h) => ({
    updateOne: {
      filter: { _id: h._id },
      update: { $set: clearedPartialDayRule(now) },
    },
  }));

  const result = await AttendanceDaily.bulkWrite(ops, { ordered: false });
  console.log(
    `\nUpdated dailies: matched=${result.matchedCount} modified=${result.modifiedCount}`
  );

  if (!SKIP_SUMMARY) {
    const byMonth = new Map(); // emp|YYYY-MM → sample date
    for (const h of hits) {
      // Use attendance date so payroll-cycle month is resolved correctly
      const key = `${h.employeeNumber}|${h.date}`;
      if (!byMonth.has(key)) byMonth.set(key, h);
    }

    // Deduplicate to one recalc per emp per payroll month via recalculateOnAttendanceUpdate
    const seenPeriod = new Set();
    let ok = 0;
    let fail = 0;
    console.log('\nRecalculating monthly summaries for affected days…');
    for (const h of hits) {
      try {
        // Resolve period once per emp+date via service helper
        await recalculateOnAttendanceUpdate(h.employeeNumber, h.date);
        ok += 1;
        console.log(`  summary ok  ${h.employeeNumber} @ ${h.date}`);
      } catch (e) {
        fail += 1;
        console.error(`  summary FAIL ${h.employeeNumber} @ ${h.date}: ${e.message}`);
        // Fallback: try YYYY-MM from calendar date
        try {
          const ym = String(h.date).slice(0, 7);
          const periodKey = `${h.employeeNumber}|${ym}`;
          if (!seenPeriod.has(periodKey)) {
            seenPeriod.add(periodKey);
            await calculateMonthlySummaryByEmpNo(h.employeeNumber, ym);
            console.log(`  fallback summary ok ${h.employeeNumber} ${ym}`);
          }
        } catch (e2) {
          console.error(`  fallback FAIL ${h.employeeNumber}: ${e2.message}`);
        }
      }
    }
    console.log(`Summary recalc done. ok=${ok} fail=${fail}`);
  }

  // Verify
  const stillBad = await AttendanceDaily.find({
    _id: { $in: hits.map((h) => h._id) },
    'policyMeta.partialDayRule.applied': true,
  })
    .select('employeeNumber date policyMeta.partialDayRule.applied')
    .lean();
  console.log(`\nVerify remaining applied=true on fixed ids: ${stillBad.length}`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
