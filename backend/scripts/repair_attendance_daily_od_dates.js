/**
 * One-off repair: AttendanceDaily rows that stored hour-based (or odDetails-linked) OD on the
 * wrong calendar YYYY-MM-DD (UTC vs IST bug before odController + conflict fixes).
 *
 * For each document with odDetails.odId, compares doc.date to the correct IST day(s) from the OD.
 * v1: automatically fixes when the OD is exactly one calendar day in IST; logs others for review.
 *
 * From backend/:
 *   node scripts/repair_attendance_daily_od_dates.js
 *   node scripts/repair_attendance_daily_od_dates.js --apply
 *   node scripts/repair_attendance_daily_od_dates.js --apply --recalc   # also recalc monthly summary for old+new date months
 *
 * @module
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const OD = require('../leaves/model/OD');

const APPLY = process.argv.includes('--apply');
const RECALC = process.argv.includes('--recalc');
const QUIET = process.argv.includes('--quiet');

async function recalcForDates(empNo, dateYmds) {
  if (!RECALC || !dateYmds || dateYmds.length === 0) return;
  const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
  const unique = [...new Set(dateYmds)];
  for (const d of unique) {
    try {
      await recalculateOnAttendanceUpdate(empNo, d);
    } catch (e) {
      console.error(`[recalc] failed ${empNo} ${d}:`, e.message);
    }
  }
}

/**
 * @param {import('mongoose').Document} source — wrong date row
 * @param {string} correctYmd
 * @returns {'moved'|'merged'|'skipped'|'error'}
 */
async function repairOne(source, correctYmd) {
  const emp = String(source.employeeNumber).toUpperCase();
  if (String(source.date) === correctYmd) return 'skipped';

  const target = await AttendanceDaily.findOne({ employeeNumber: emp, date: correctYmd });

  if (!target) {
    if (!APPLY) {
      if (!QUIET) console.log(`[dry-run] set date: ${source.date} -> ${correctYmd} emp=${emp} _id=${source._id}`);
      return 'moved';
    }
    source.set('date', correctYmd);
    await source.save();
    if (!QUIET) console.log(`[apply] moved daily ${source._id} to ${correctYmd} emp=${emp}`);
    return 'moved';
  }

  // Target exists: merge root-level odHours / odDetails from source, then clear source
  if (!APPLY) {
    if (!QUIET) {
      console.log(
        `[dry-run] merge OD into existing ${correctYmd} from wrong ${source.date} emp=${emp} src=${source._id} tgt exists`
      );
    }
    return 'merged';
  }

  const tOd = (target.odHours || 0) + (source.odHours || 0);
  if (!target.odDetails && source.odDetails) {
    target.odDetails = source.odDetails;
  } else if (source.odDetails) {
    target.set('odDetails', { ...(target.odDetails || {}), ...source.odDetails });
  }
  if (tOd) target.set('odHours', Math.round(tOd * 100) / 100);
  target.markModified('odDetails');
  await target.save();

  source.set('odDetails', null);
  source.set('odHours', 0);
  await source.save();
  if (!QUIET) console.log(`[apply] merged odDetails from ${source.date} -> ${correctYmd} emp=${emp} cleared source row`);
  return 'merged';
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(
    !APPLY
      ? 'Mode: DRY-RUN (pass --apply to move/merge, add --recalc to refresh monthly summaries)'
      : 'Mode: APPLY'
  );
  console.log('---');

  const cursor = AttendanceDaily.find({
    'odDetails.odId': { $exists: true, $ne: null },
  })
    .select('employeeNumber date odDetails odHours shifts')
    .cursor();

  let checked = 0;
  let fixed = 0;
  let ok = 0;
  let skippedOther = 0;
  const recalcQueue = new Map();

  for await (const d of cursor) {
    checked += 1;
    const od = await OD.findById(d.odDetails.odId).lean();
    if (!od) {
      skippedOther += 1;
      if (!QUIET) console.log(`[skip] OD missing for daily ${d._id} odId=${d.odDetails?.odId}`);
      continue;
    }
    if (!od.fromDate || !od.toDate) continue;

    const fromS = extractISTComponents(od.fromDate).dateStr;
    const toS = extractISTComponents(od.toDate).dateStr;
    const range = getAllDatesInRange(fromS, toS);
    if (range.length > 1) {
      if (range.includes(d.date)) {
        ok += 1;
      } else {
        skippedOther += 1;
        if (!QUIET) {
          console.log(
            `[review] multi-day OD ${od._id} daily ${d._id} has date ${d.date} not in range ${range.join(',')}. Fix manually.`
          );
        }
      }
      continue;
    }

    const correctYmd = range[0];
    if (d.date === correctYmd) {
      ok += 1;
      continue;
    }

    if (!QUIET) {
      console.log(
        `[mismatch] emp=${d.employeeNumber} daily date=${d.date} OD=${od._id} should be IST day=${correctYmd} (fromDate stored=${od.fromDate})`
      );
    }

    const r = await repairOne(d, correctYmd);
    if (r === 'moved' || r === 'merged') {
      fixed += 1;
      if (RECALC) {
        const k = String(d.employeeNumber).toUpperCase();
        if (!recalcQueue.has(k)) recalcQueue.set(k, new Set());
        recalcQueue.get(k).add(correctYmd);
        recalcQueue.get(k).add(String(d.date).substring(0, 10));
      }
    }
  }

  console.log('---');
  console.log(`Checked dailies with odDetails.odId: ${checked}`);
  console.log(`Already correct: ${ok}`);
  console.log(`Repaired (dry or apply): ${fixed}`);
  console.log(`Skipped / other (multi-day manual, missing OD): ${skippedOther}`);

  if (RECALC && APPLY && recalcQueue.size) {
    console.log('--- recalc');
    for (const [emp, set] of recalcQueue) {
      await recalcForDates(emp, [...set]);
    }
  } else if (RECALC && !APPLY) {
    console.log('(skip --recalc: use with --apply)');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
