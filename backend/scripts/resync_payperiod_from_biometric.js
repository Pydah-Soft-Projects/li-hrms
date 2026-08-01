#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Pay-period attendance resync from biometric Mongo → HRMS internal sync
 * ============================================================
 *
 * Flow:
 *   1. Select a payroll period (interactive or --month YYYY-MM)
 *   2. Export AttendanceDaily + MonthlyAttendanceSummary (+ AttendanceRawLog) to JSON
 *      so you can recover if something goes wrong
 *   3. Delete those HRMS records for the period (raw logs must go too so re-ingest is clean)
 *   4. Read stored AttendanceLog rows from the biometric Mongo DB (no device pull)
 *   5. POST them to POST /api/internal/attendance/sync using each log's stored logType
 *      (device operation was already applied at biometric ingest → baked into logType)
 *
 * Prerequisites:
 *   - Backend running (internal sync endpoint)
 *   - MONGODB_URI (HRMS)
 *   - MONGODB_BIOMETRIC_URI or BIOMETRIC_MONGODB_URI (biometric AttendanceLog DB)
 *   - HRMS_MICROSERVICE_SECRET_KEY matching the running backend
 *
 * Usage:
 *   node scripts/resync_payperiod_from_biometric.js
 *   node scripts/resync_payperiod_from_biometric.js --month 2026-07
 *   node scripts/resync_payperiod_from_biometric.js --month 2026-07 --yes
 *   node scripts/resync_payperiod_from_biometric.js --month 2026-07 --dry-run
 *   node scripts/resync_payperiod_from_biometric.js --month 2026-07 --emp 1832,2291
 *   node scripts/resync_payperiod_from_biometric.js --month 2026-07 --backup-only
 *   node scripts/resync_payperiod_from_biometric.js --month 2026-07 --sync-only
 *   node scripts/resync_payperiod_from_biometric.js --month 2026-07 --skip-raw-delete
 *
 * Env overrides:
 *   BACKEND_URL / BACKEND_INTERNAL_URL  (default http://127.0.0.1:5000)
 *   SYNC_BATCH_SIZE (default 50)
 *   SYNC_RETRY (default 5)
 *   SYNC_DELAY (default 2000 ms between batches)
 *   BACKUP_DIR (default backend/data/attendance-resync-backups)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');
const axios = require('axios');

const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const dateCycleService = require('../leaves/services/dateCycleService');
const { extractISTComponents, createISTDate, endOfISTDay } = require('../shared/utils/dateUtils');

const VALID_LOG_TYPES = new Set([
  'CHECK-IN',
  'CHECK-OUT',
  'BREAK-IN',
  'BREAK-OUT',
  'OVERTIME-IN',
  'OVERTIME-OUT',
]);

const biometricAttendanceLogSchema = new mongoose.Schema(
  {
    employeeId: String,
    timestamp: Date,
    logType: String,
    rawType: Number,
    rawData: Object,
    deviceId: String,
    deviceName: String,
    syncedAt: Date,
  },
  { timestamps: true, strict: false, collection: 'attendancelogs' }
);

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function parseEmpCsv(s) {
  if (!s) return [];
  return String(s)
    .split(/[,;\s]+/)
    .map((x) => String(x || '').trim().toUpperCase())
    .filter(Boolean);
}

function parseMonth(monthStr) {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(monthStr || '').trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), key: `${m[1]}-${m[2]}` };
}

function parseArgs(argv) {
  const out = {
    month: null,
    empCsv: '',
    dryRun: false,
    yes: false,
    backupOnly: false,
    syncOnly: false,
    skipRawDelete: false,
    backupDir: process.env.BACKUP_DIR || null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--backup-only') out.backupOnly = true;
    else if (a === '--sync-only') out.syncOnly = true;
    else if (a === '--skip-raw-delete') out.skipRawDelete = true;
    else if (a.startsWith('--month=')) out.month = a.slice('--month='.length);
    else if (a === '--month' && argv[i + 1]) out.month = argv[++i];
    else if (a.startsWith('--emp=')) out.empCsv = a.slice('--emp='.length);
    else if (a === '--emp' && argv[i + 1]) out.empCsv = argv[++i];
    else if (a.startsWith('--backup-dir=')) out.backupDir = a.slice('--backup-dir='.length);
    else if (a === '--backup-dir' && argv[i + 1]) out.backupDir = argv[++i];
    else if (/^\d{4}-\d{2}$/.test(a) && !out.month) out.month = a;
  }

  return out;
}

function resolveInternalSyncUrl() {
  const base = process.env.BACKEND_URL || process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:5000';
  return `${String(base).replace(/\/$/, '')}/api/internal/attendance/sync`;
}

function resolveBiometricUri() {
  return (
    process.env.MONGODB_BIOMETRIC_URI ||
    process.env.BIOMETRIC_MONGODB_URI ||
    process.env.MONGODB_ATLAS_BIOMETRIC_URI ||
    null
  );
}

function monthLabel(year, month) {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[month - 1]} ${year}`;
}

async function buildRecentPeriods(count = 12) {
  const now = new Date();
  const ist = extractISTComponents(now);
  const periods = [];
  let y = ist.year;
  let m = ist.month;

  for (let i = 0; i < count; i += 1) {
    const cycle = await dateCycleService.getPayrollCycleForMonth(y, m);
    const startStr = extractISTComponents(cycle.startDate).dateStr;
    const endStr = extractISTComponents(cycle.endDate).dateStr;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    periods.push({
      key,
      year: y,
      month: m,
      label: monthLabel(y, m),
      startStr,
      endStr,
      cycle,
    });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return periods;
}

async function resolvePeriodInteractive(rl, argsMonth) {
  if (argsMonth) {
    const parsed = parseMonth(argsMonth);
    if (!parsed) throw new Error(`Invalid --month "${argsMonth}". Use YYYY-MM.`);
    const cycle = await dateCycleService.getPayrollCycleForMonth(parsed.year, parsed.month);
    return {
      key: parsed.key,
      year: parsed.year,
      month: parsed.month,
      label: monthLabel(parsed.year, parsed.month),
      startStr: extractISTComponents(cycle.startDate).dateStr,
      endStr: extractISTComponents(cycle.endDate).dateStr,
      cycle,
    };
  }

  const periods = await buildRecentPeriods(12);
  const payroll = await dateCycleService.getPayrollCycleSettings();
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📅 Pay period selection');
  console.log(`   Payroll cycle settings: startDay=${payroll.startDay}, endDay=${payroll.endDay}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  periods.forEach((p, i) => {
    console.log(`   ${String(i + 1).padStart(2)}. ${p.key}  ${p.label}  (${p.startStr} → ${p.endStr})`);
  });
  console.log('   Or type a month as YYYY-MM');

  const answer = (await ask(rl, '\nSelect period number or YYYY-MM: ')).trim();
  if (!answer) throw new Error('No pay period selected.');

  if (/^\d{4}-\d{2}$/.test(answer)) {
    const parsed = parseMonth(answer);
    const cycle = await dateCycleService.getPayrollCycleForMonth(parsed.year, parsed.month);
    return {
      key: parsed.key,
      year: parsed.year,
      month: parsed.month,
      label: monthLabel(parsed.year, parsed.month),
      startStr: extractISTComponents(cycle.startDate).dateStr,
      endStr: extractISTComponents(cycle.endDate).dateStr,
      cycle,
    };
  }

  const idx = parseInt(answer, 10) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx >= periods.length) {
    throw new Error(`Invalid selection: "${answer}"`);
  }
  return periods[idx];
}

function dailyFilter(startStr, endStr, empNos) {
  const filter = { date: { $gte: startStr, $lte: endStr } };
  if (empNos.length) filter.employeeNumber = { $in: empNos };
  return filter;
}

function summaryFilter(monthKey, empNos) {
  const filter = { month: monthKey };
  if (empNos.length) filter.emp_no = { $in: empNos };
  return filter;
}

function rawFilter(startStr, endStr, empNos) {
  const filter = { date: { $gte: startStr, $lte: endStr } };
  if (empNos.length) filter.employeeNumber = { $in: empNos };
  return filter;
}

function biometricQuery(rangeStart, rangeEnd, empNos) {
  const query = {
    timestamp: { $gte: rangeStart, $lte: rangeEnd },
  };
  if (empNos.length) {
    // biometric may store PIN as string with/without leading zeros or as number
    const variants = new Set();
    for (const emp of empNos) {
      variants.add(emp);
      variants.add(emp.toLowerCase());
      if (/^\d+$/.test(emp)) {
        const n = Number(emp);
        if (Number.isSafeInteger(n)) {
          variants.add(n);
          variants.add(String(n));
        }
      }
    }
    query.employeeId = { $in: [...variants] };
  }
  return query;
}

function mapBiometricLogToSyncPayload(log) {
  const typeUpper = log.logType ? String(log.logType).toUpperCase() : '';
  if (!VALID_LOG_TYPES.has(typeUpper)) return null;

  const emp = String(log.employeeId || '').trim().toUpperCase();
  if (!emp) return null;

  const ts = log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp);
  if (Number.isNaN(ts.getTime())) return null;

  let iso = ts.toISOString();
  if (!iso.endsWith('Z')) iso = `${iso}Z`;

  return {
    employeeId: emp,
    timestamp: iso,
    logType: typeUpper,
    deviceId: log.deviceId || 'UNKNOWN',
    deviceName: log.deviceName || 'UNKNOWN',
    rawStatus: log.rawType != null ? log.rawType : null,
  };
}

async function writeBackupFile(backupPath, payload) {
  const dir = path.dirname(backupPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function postBatch(url, systemKey, payload, retries) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await axios.post(url, payload, {
        headers: { 'x-system-key': systemKey },
        timeout: parseInt(process.env.SYNC_TIMEOUT || '600000', 10),
      });
      return { ok: true, data: res.data };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  const msg = lastErr?.response?.data
    ? JSON.stringify(lastErr.response.data)
    : lastErr?.message || 'unknown error';
  return { ok: false, error: msg };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const empNos = parseEmpCsv(args.empCsv);
  const hrmsUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const biometricUri = resolveBiometricUri();
  const syncUrl = resolveInternalSyncUrl();
  const systemKey = process.env.HRMS_MICROSERVICE_SECRET_KEY || 'hrms-secret-key-2026-abc123xyz789';
  const batchSize = parseInt(process.env.SYNC_BATCH_SIZE || '50', 10);
  const retries = parseInt(process.env.SYNC_RETRY || '5', 10);
  const delayMs = parseInt(process.env.SYNC_DELAY || '2000', 10);
  const backupDir =
    args.backupDir ||
    path.resolve(__dirname, '../data/attendance-resync-backups');

  if (!hrmsUri) {
    console.error('Missing MONGODB_URI / MONGO_URI');
    process.exit(1);
  }
  if (args.backupOnly && args.syncOnly) {
    console.error('Use only one of --backup-only or --sync-only');
    process.exit(1);
  }
  // Biometric DB required unless this run is backup-only (no sync).
  if (!args.backupOnly && !biometricUri) {
    console.error(
      'Missing MONGODB_BIOMETRIC_URI / BIOMETRIC_MONGODB_URI (needed to read stored biometric logs).'
    );
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let biometricConn = null;

  try {
    console.log('\n═══ Pay-period attendance resync (biometric Mongo → internal sync) ═══\n');
    await mongoose.connect(hrmsUri);
    console.log('✅ HRMS Mongo connected');

    const period = await resolvePeriodInteractive(rl, args.month);
    const rangeStart = createISTDate(period.startStr, '00:00');
    const rangeEnd = endOfISTDay(period.endStr);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Pay period : ${period.key} (${period.label})`);
    console.log(`Date range : ${period.startStr} → ${period.endStr} (IST)`);
    console.log(`Employees  : ${empNos.length ? empNos.join(', ') : 'ALL'}`);
    console.log(`Mode       : ${args.dryRun ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`Sync URL   : ${syncUrl}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const dFilter = dailyFilter(period.startStr, period.endStr, empNos);
    const sFilter = summaryFilter(period.key, empNos);
    const rFilter = rawFilter(period.startStr, period.endStr, empNos);

    const [dailyCount, summaryCount, rawCount] = await Promise.all([
      AttendanceDaily.countDocuments(dFilter),
      MonthlyAttendanceSummary.countDocuments(sFilter),
      AttendanceRawLog.countDocuments(rFilter),
    ]);

    console.log('\nHRMS records in scope:');
    console.log(`  AttendanceDaily            : ${dailyCount}`);
    console.log(`  MonthlyAttendanceSummary   : ${summaryCount}`);
    console.log(`  AttendanceRawLog           : ${rawCount}`);
    if (!args.skipRawDelete) {
      console.log(
        '\n  Note: Raw logs are also exported + deleted so biometric re-ingest can rebuild cleanly.'
      );
      console.log('        Use --skip-raw-delete to keep existing AttendanceRawLog rows.');
    }

    if (args.dryRun) {
      console.log('\nDry run only — no backup write, delete, or sync.');
      if (!args.backupOnly) {
        biometricConn = mongoose.createConnection(biometricUri, { maxPoolSize: 5 });
        await biometricConn.asPromise();
        const AttendanceLog = biometricConn.model('BiometricAttendanceLog', biometricAttendanceLogSchema);
        const bioCount = await AttendanceLog.countDocuments(
          biometricQuery(rangeStart, rangeEnd, empNos)
        );
        console.log(`  Biometric AttendanceLog    : ${bioCount} (would be sent to internal sync)`);
      }
      return;
    }

    if (!args.yes && !args.syncOnly) {
      const confirm = (
        await ask(
          rl,
          `\nType YES to export JSON then delete dailies/summaries${args.skipRawDelete ? '' : '/raw logs'} for ${period.key}: `
        )
      ).trim();
      if (confirm !== 'YES') {
        console.log('Aborted.');
        return;
      }
    }

    let backupPath = null;

    if (!args.syncOnly) {
      console.log('\n📦 Exporting recovery JSON...');
      const [dailies, summaries, rawLogs] = await Promise.all([
        AttendanceDaily.find(dFilter).lean(),
        MonthlyAttendanceSummary.find(sFilter).lean(),
        AttendanceRawLog.find(rFilter).lean(),
      ]);

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const empTag = empNos.length ? `_emp-${empNos.slice(0, 3).join('-')}` : '_all';
      backupPath = path.join(
        backupDir,
        `payperiod-${period.key}${empTag}_${stamp}.json`
      );

      await writeBackupFile(backupPath, {
        meta: {
          exportedAt: new Date().toISOString(),
          payPeriod: {
            month: period.key,
            label: period.label,
            startDate: period.startStr,
            endDate: period.endStr,
            year: period.year,
            monthNumber: period.month,
          },
          employeeFilter: empNos.length ? empNos : null,
          counts: {
            attendanceDailies: dailies.length,
            monthlySummaries: summaries.length,
            attendanceRawLogs: rawLogs.length,
          },
          note:
            'Recovery backup before pay-period resync. Restore manually if needed. Biometric re-sync uses stored AttendanceLog.logType (device operation already applied at ingest).',
        },
        attendanceDailies: dailies,
        monthlySummaries: summaries,
        attendanceRawLogs: rawLogs,
      });

      console.log(`✅ Backup written: ${backupPath}`);
      console.log(
        `   dailies=${dailies.length}, summaries=${summaries.length}, rawLogs=${rawLogs.length}`
      );

      if (args.backupOnly) {
        console.log('\n--backup-only set; skipping delete and sync.');
        return;
      }

      console.log('\n🗑  Deleting HRMS attendance data for period...');
      const deleteOps = [
        AttendanceDaily.deleteMany(dFilter),
        MonthlyAttendanceSummary.deleteMany(sFilter),
      ];
      if (!args.skipRawDelete) {
        deleteOps.push(AttendanceRawLog.deleteMany(rFilter));
      }
      const results = await Promise.all(deleteOps);
      console.log(`  Deleted AttendanceDaily          : ${results[0].deletedCount || 0}`);
      console.log(`  Deleted MonthlyAttendanceSummary : ${results[1].deletedCount || 0}`);
      if (!args.skipRawDelete) {
        console.log(`  Deleted AttendanceRawLog         : ${results[2].deletedCount || 0}`);
      }
    }

    if (args.backupOnly) return;

    if (!args.yes && args.syncOnly) {
      const confirmSync = (
        await ask(rl, `\nType YES to sync biometric Mongo logs for ${period.key} → internal sync: `)
      ).trim();
      if (confirmSync !== 'YES') {
        console.log('Aborted.');
        return;
      }
    } else if (!args.yes) {
      const confirmSync = (await ask(rl, '\nType YES to continue with biometric → internal sync: ')).trim();
      if (confirmSync !== 'YES') {
        console.log('Delete/backup done. Sync skipped.');
        if (backupPath) console.log(`Recovery JSON: ${backupPath}`);
        return;
      }
    }

    console.log('\n🔌 Connecting to biometric Mongo...');
    biometricConn = mongoose.createConnection(biometricUri, { maxPoolSize: 5 });
    await biometricConn.asPromise();
    console.log('✅ Biometric Mongo connected');

    const AttendanceLog = biometricConn.model('BiometricAttendanceLog', biometricAttendanceLogSchema);
    const query = biometricQuery(rangeStart, rangeEnd, empNos);
    const totalLogs = await AttendanceLog.countDocuments(query);
    console.log(`\n📤 Syncing ${totalLogs} biometric log(s) → ${syncUrl}`);
    console.log('   Using stored logType (device operation already resolved at ingest).');

    if (totalLogs === 0) {
      console.log('   No biometric logs in range — nothing to send.');
      if (backupPath) console.log(`\nRecovery JSON: ${backupPath}`);
      return;
    }

    let processed = 0;
    let successBatches = 0;
    let failedBatches = 0;
    let skippedInvalid = 0;
    const totalBatches = Math.ceil(totalLogs / batchSize);

    for (let skip = 0; skip < totalLogs; skip += batchSize) {
      const batchNum = Math.floor(skip / batchSize) + 1;
      const logs = await AttendanceLog.find(query)
        .sort({ timestamp: 1 })
        .skip(skip)
        .limit(batchSize)
        .lean();

      const payload = [];
      for (const log of logs) {
        const mapped = mapBiometricLogToSyncPayload(log);
        if (!mapped) {
          skippedInvalid += 1;
          continue;
        }
        payload.push(mapped);
      }

      if (payload.length === 0) {
        console.log(`\n   ⚠️  Batch ${batchNum}/${totalBatches}: all rows invalid/skipped`);
        continue;
      }

      const result = await postBatch(syncUrl, systemKey, payload, retries);
      if (result.ok) {
        processed += payload.length;
        successBatches += 1;
        const accepted =
          result.data?.processedCount ?? result.data?.processed ?? '?';
        process.stdout.write(
          `\r   Batch ${batchNum}/${totalBatches} — sent ${processed}/${totalLogs} | backend accepted: ${accepted}   `
        );
      } else {
        failedBatches += 1;
        console.error(`\n   ❌ Batch ${batchNum} failed: ${result.error}`);
      }

      if (skip + batchSize < totalLogs) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    console.log('\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Done. successBatches=${successBatches}, failedBatches=${failedBatches}, skippedInvalid=${skippedInvalid}`);
    console.log('Monthly summaries rebuild via AttendanceDaily post-save hooks as days are processed.');
    if (backupPath) console.log(`Recovery JSON: ${backupPath}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } finally {
    rl.close();
    if (biometricConn && biometricConn.readyState !== 0) {
      await biometricConn.close().catch(() => {});
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Script failed:', err.message || err);
  process.exit(1);
});
