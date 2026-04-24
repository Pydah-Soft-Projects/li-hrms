/**
 * Backfill / reconcile auto-OD: scan AttendanceDaily (HOLIDAY / WEEK_OFF with work hours)
 * and create or update OD rows per holwoOdPunchResolver + autoODService rules.
 *
 * Prereq: MONGODB_URI in backend/.env
 *
 * Usage (from backend/):
 *   node scripts/backfillAutoODFromAttendance.js --from 2026-01-01 --to 2026-04-30
 *   node scripts/backfillAutoODFromAttendance.js --from 2026-01-01 --to 2026-04-30 --dry-run
 *   node scripts/backfillAutoODFromAttendance.js --from 2026-01-01 --to 2026-04-30 --force
 *   node scripts/backfillAutoODFromAttendance.js --from 2026-01-01 --to 2026-04-30 --emp-no EMP123
 *   node scripts/backfillAutoODFromAttendance.js --from 2026-01-01 --to 2026-04-30 --json out/report.json
 *
 * Flags:
 *   --dry-run     No writes: report what would be created/updated (and ineligible rows).
 *   --force       Process even if Settings `auto_od_creation_enabled` is false (applies to live run only).
 *   --emp-no      Limit to one employee (case-insensitive number match in AttendanceDaily).
 *   --json <path> Write full report JSON in addition to console summary.
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const OD = require('../leaves/model/OD');
const Employee = require('../employees/model/Employee');
const Settings = require('../settings/model/Settings');
const { getAllDatesInRange } = require('../shared/utils/dateUtils');
const { getAutoOdEligibilityFromRecord } = require('../leaves/utils/holwoOdPunchResolver');
const { processAutoODForEmployee } = require('../leaves/services/autoODService');

function parseArgs(argv) {
  const o = { from: null, to: null, dryRun: false, force: false, empNo: null, json: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--from') o.from = argv[++i];
    else if (a === '--to') o.to = argv[++i];
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--force') o.force = true;
    else if (a === '--emp-no') o.empNo = String(argv[++i] || '').trim();
    else if (a === '--json') o.json = argv[++i] || null;
  }
  return o;
}

function istDayWindow(dateStr) {
  return {
    dayStart: new Date(`${dateStr}T00:00:00+05:30`),
    dayEnd: new Date(`${dateStr}T23:59:59+05:30`),
  };
}

async function previewOne(record, dateStr) {
  const empLabel = record.employeeNumber;
  if (!['HOLIDAY', 'WEEK_OFF'].includes(record.status) || !(record.totalWorkingHours > 0)) {
    return { kind: 'skip', reason: 'not_hol_wo_or_no_hours', dateStr, employeeNumber: empLabel, status: record.status, totalWorkingHours: record.totalWorkingHours };
  }
  const plain = typeof record.toObject === 'function' ? record.toObject({ flattenMaps: true }) : record;
  const el = getAutoOdEligibilityFromRecord(plain);
  if (!el.eligible) {
    return { kind: 'skip', reason: 'not_eligible', dateStr, employeeNumber: empLabel, eligibilityReason: el.reason || 'not_eligible' };
  }
  const { dayStart, dayEnd } = istDayWindow(dateStr);
  const existing = await OD.findOne({
    emp_no: record.employeeNumber,
    fromDate: { $gte: dayStart, $lte: dayEnd },
    isActive: true,
    status: { $nin: ['cancelled', 'rejected'] },
  }).lean();
  const shape = {
    odType_extended: el.odType_extended,
    isHalfDay: el.isHalfDay,
    durationHours: record.totalWorkingHours,
    punchContext: el.punchContextDetail,
  };
  if (existing) {
    return {
      kind: 'would_update',
      dateStr,
      employeeNumber: empLabel,
      odId: String(existing._id),
      currentStatus: existing.status,
      nextShape: shape,
    };
  }
  const employee = await Employee.findOne({ emp_no: record.employeeNumber }).lean();
  if (!employee) {
    return { kind: 'skip', reason: 'employee_not_found', dateStr, employeeNumber: empLabel };
  }
  return { kind: 'would_create', dateStr, employeeNumber: empLabel, nextShape: shape };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.from || !args.to) {
    console.error('Usage: node scripts/backfillAutoODFromAttendance.js --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run] [--force] [--emp-no X] [--json path]');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  const dates = getAllDatesInRange(args.from, args.to);
  if (dates.length === 0) {
    console.error('Invalid or empty date range');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const setting = await Settings.findOne({ key: 'auto_od_creation_enabled' }).lean();
  const autoOn = setting?.value === true;
  console.log('---');
  console.log('Range (IST YMD, inclusive):', args.from, '→', args.to, `(${dates.length} day(s))`);
  console.log('Mode:', args.dryRun ? 'DRY-RUN (no writes)' : 'LIVE');
  console.log('auto_od_creation_enabled:', autoOn, args.force && !args.dryRun ? '(bypassing with --force for writes)' : '');
  if (args.empNo) console.log('Filter emp:', args.empNo);
  console.log('---\n');

  const query = {
    date: { $gte: args.from, $lte: args.to },
    status: { $in: ['HOLIDAY', 'WEEK_OFF'] },
    totalWorkingHours: { $gt: 0 },
  };
  if (args.empNo) {
    const u = String(args.empNo).toUpperCase();
    query.employeeNumber = { $in: [args.empNo, u, String(args.empNo).trim()] };
  }

  const records = await AttendanceDaily.find(query).sort({ date: 1, employeeNumber: 1 });
  const report = {
    generatedAt: new Date().toISOString(),
    range: { from: args.from, to: args.to },
    autoOdSettingOn: autoOn,
    dryRun: args.dryRun,
    force: args.force,
    totalAttendanceRows: records.length,
    created: [],
    updated: [],
    skipped: [],
    errors: [],
    wouldCreate: [],
    wouldUpdate: [],
  };

  if (args.dryRun) {
    for (const rec of records) {
      const dateStr = rec.date;
      if (!dateStr) continue;
      const p = await previewOne(rec, String(dateStr).slice(0, 10));
      if (p.kind === 'would_create') {
        report.wouldCreate.push(p);
      } else if (p.kind === 'would_update') {
        report.wouldUpdate.push(p);
      } else {
        report.skipped.push(p);
      }
    }
  } else {
    if (!autoOn && !args.force) {
      console.log('Refusing to write: auto_od_creation_enabled is false. Re-run with --force or turn the setting on.');
      report.errors.push({ message: 'auto_od disabled and no --force' });
      if (args.json) {
        fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
        fs.writeFileSync(path.resolve(args.json), JSON.stringify(report, null, 2), 'utf8');
      }
      await mongoose.disconnect();
      process.exit(1);
    }

    const opt = { force: !!args.force };
    for (const rec of records) {
      const dateStr = rec.date;
      if (!dateStr) continue;
      const ymd = String(dateStr).slice(0, 10);
      let r;
      try {
        r = await processAutoODForEmployee(rec.employeeNumber, ymd, rec, opt);
      } catch (e) {
        report.errors.push({ employeeNumber: rec.employeeNumber, date: ymd, error: e?.message || String(e) });
        continue;
      }
      if (!r) {
        report.skipped.push({ employeeNumber: rec.employeeNumber, date: ymd, reason: 'no_result' });
        continue;
      }
      if (r.success && r.action === 'created') {
        report.created.push({
          employeeNumber: r.employeeNumber,
          date: r.dateStr,
          odId: r.odId ? String(r.odId) : null,
          detail: r.detail,
        });
      } else if (r.success && r.action === 'updated') {
        report.updated.push({
          employeeNumber: r.employeeNumber,
          date: r.dateStr,
          odId: r.odId ? String(r.odId) : null,
          detail: r.detail,
        });
      } else {
        report.skipped.push({
          employeeNumber: r.employeeNumber,
          date: r.dateStr,
          skipCode: r.skipCode,
          eligibilityReason: r.eligibilityReason,
        });
      }
    }
  }

  // Console report
  const section = (title, arr, fn) => {
    console.log(`\n## ${title} (${arr.length})`);
    for (const row of arr) console.log(typeof fn === 'function' ? fn(row) : JSON.stringify(row));
    if (arr.length === 0) console.log('(none)');
  };

  if (args.dryRun) {
    section('Would create OD', report.wouldCreate, (x) => {
      const s = x.nextShape || {};
      return `${x.dateStr}  ${x.employeeNumber}  ${s.odType_extended || ''}  ${s.durationHours != null ? s.durationHours + 'h' : ''}  (${s.punchContext || 'eligible'})`;
    });
    section('Would update existing OD', report.wouldUpdate, (x) => {
      const s = x.nextShape || {};
      return `${x.dateStr}  ${x.employeeNumber}  odId=${x.odId}  current=${x.currentStatus || ''}  →  ${s.odType_extended || ''}  ${s.durationHours != null ? s.durationHours + 'h' : ''}`;
    });
    section('Skipped / ineligible', report.skipped, (x) => `${x.dateStr || x.date}  ${x.employeeNumber || x.emp}  ${x.reason || x.eligibilityReason || x.skipCode || ''}`);
  } else {
    section('Created', report.created, (x) => `${x.date}  ${x.employeeNumber}  ${x.odId}  ${(x.detail && x.detail.odType_extended) || ''}  ${(x.detail && x.detail.durationHours) || ''}h`);
    section('Updated', report.updated, (x) => `${x.date}  ${x.employeeNumber}  ${x.odId}  ${(x.detail && x.detail.odType_extended) || ''}`);
    section('Skipped (no create/update per rules / setting / eligibility)', report.skipped, (x) => JSON.stringify(x));
  }

  if (report.errors.length) {
    section('Errors', report.errors, (x) => JSON.stringify(x));
  }

  console.log('\n---\nTotal AttendanceDaily rows in filter:', report.totalAttendanceRows);
  if (args.json) {
    const p = path.resolve(args.json);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(report, null, 2), 'utf8');
    console.log('Wrote JSON report:', p);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
