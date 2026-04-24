/**
 * Make AttendanceDaily records editable again and optionally re-run pre-save + monthly summary.
 *
 * Why: `locked`, `isEdited`, and `source: 'manual'` block biometric upsert (see singleShiftProcessingService / multiShiftProcessingService).
 *
 * Usage (from backend/):
 *   node scripts/unlock_and_reprocess_attendance_dailies.js --dry-run
 *   node scripts/unlock_and_reprocess_attendance_dailies.js
 *   node scripts/unlock_and_reprocess_attendance_dailies.js --resave
 *   node scripts/unlock_and_reprocess_attendance_dailies.js --resave --emp 931 --from 2026-03-01 --to 2026-03-31
 *   node scripts/unlock_and_reprocess_attendance_dailies.js --flags-only
 *
 * --resave: each document .save() (recomputes daily via pre-save, triggers monthly summary / extra hours).
 *   Sets SKIP_LEAVE_ATTENDANCE_RECONCILIATION=1 for the resave run so mass re-save does not auto-reject/narrow leaves.
 * --flags-only: only $set locked/isEdited and $pull manual; no save.
 * --limit N: max records for --resave (safety).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { dryRun: false, resave: false, flagsOnly: false, limit: 0, emp: null, from: null, to: null };
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === '--dry-run') o.dryRun = true;
    else if (a[i] === '--resave') o.resave = true;
    else if (a[i] === '--flags-only') o.flagsOnly = true;
    else if (a[i] === '--emp' && a[i + 1]) {
      o.emp = String(a[++i]).toUpperCase();
    } else if (a[i] === '--from' && a[i + 1]) {
      o.from = a[++i];
    } else if (a[i] === '--to' && a[i + 1]) {
      o.to = a[++i];
    } else if (a[i] === '--limit' && a[i + 1]) {
      o.limit = Math.max(0, parseInt(a[++i], 10) || 0);
    }
  }
  return o;
}

async function main() {
  const opts = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected. Options:', opts);

  const q = {};
  if (opts.emp) {
    q.employeeNumber = opts.emp;
  }
  if (opts.from || opts.to) {
    const r = {};
    if (opts.from) r.$gte = opts.from;
    if (opts.to) r.$lte = opts.to;
    q.date = r;
  }

  if (opts.dryRun) {
    const c = await AttendanceDaily.countDocuments({
      ...q,
      $or: [{ locked: true }, { isEdited: true }, { source: 'manual' }],
    });
    const total = await AttendanceDaily.countDocuments(q);
    console.log('Dry run: would clear locks/manual source on', c, 'of', total, 'matched docs (query:', JSON.stringify(q), ')');
    await mongoose.disconnect();
    return;
  }

  // 1) Clear immutability flags; pull 'manual' from source so sync pipeline can update again
  const upd = await AttendanceDaily.updateMany(q, {
    $set: { locked: false, isEdited: false },
    $pull: { source: 'manual' },
  });
  console.log('Cleared locked/isEdited and pulled source manual. matched:', upd.matchedCount, 'modified:', upd.modifiedCount);

  if (opts.flagsOnly || !opts.resave) {
    await mongoose.disconnect();
    console.log('Done (no resave).');
    return;
  }

  // 2) Re-save: skip auto leave–attendance reconciliation so leaves are not mass-updated
  const prev = process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION;
  process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION = '1';
  let processed = 0;
  let finder = AttendanceDaily.find(q);
  if (opts.limit > 0) {
    finder = finder.limit(opts.limit);
  }
  const cursor = finder.cursor();
  try {
    for await (const doc of cursor) {
      await doc.save();
      processed += 1;
      if (processed % 500 === 0) {
        console.log('Resaved', processed, '...');
      }
    }
  } finally {
    if (prev === undefined) {
      delete process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION;
    } else {
      process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION = prev;
    }
  }

  console.log('Resave complete. processed:', processed, '(reconciliation was skipped; monthly summary still recalculates from attendance save).');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
