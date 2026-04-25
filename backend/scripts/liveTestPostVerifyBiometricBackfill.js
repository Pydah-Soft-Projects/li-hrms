/**
 * Live script: verify HRMS employee exists, then run the same post-verify biometric replay as production
 * (HTTP → biometric service → that service reads Mongo and POSTs to HRMS internal sync).
 *
 * Usage:
 *   cd backend
 *   node scripts/liveTestPostVerifyBiometricBackfill.js --emp-no=2146 --doj=2026-04-01 --verified-date=2026-04-24
 *
 * Optional — insert two test punches into biometric Mongo (requires direct URI for seed only):
 *   ALLOW_BIOMETRIC_TEST_SEED=true node scripts/liveTestPostVerifyBiometricBackfill.js --emp-no=2146 --doj=2026-04-01 --verified-date=2026-04-24 --seed
 *
 * Remove only rows created by this script:
 *   node scripts/liveTestPostVerifyBiometricBackfill.js --cleanup-seed
 *
 * Optional:
 *   --employee-name="Display Name" — passed to biometric replay body
 *   --dry-run — GET /api/logs on the biometric service (same window); no HRMS writes
 *
 * Env:
 *   MONGODB_URI — HRMS DB (employee existence check)
 *   BIOMETRIC_SERVICE_BASE_URL (or BIOMETRIC_SERVICE_URL) — required for replay and --dry-run
 *   HRMS_MICROSERVICE_SECRET_KEY — same secret as biometric service (replay + dry-run if secured later)
 *   MONGODB_BIOMETRIC_URI — only for --seed / --cleanup-seed (optional)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axios = require('axios');
const mongoose = require('mongoose');
const {
  runPostVerifyBiometricBackfill,
  resolveBiometricReplayServiceUrl,
  computeBackfillRange,
} = require('../attendance/services/postVerifyBiometricBackfillService');

const SEED_DEVICE_ID = 'HRMS_SCRIPT_TEST_POST_VERIFY';
const SEED_DEVICE_NAME = 'HRMS_SCRIPT_TEST_POST_VERIFY';

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    const eq = body.indexOf('=');
    if (eq === -1) {
      out[body.replace(/-/g, '_')] = true;
    } else {
      const k = body.slice(0, eq).replace(/-/g, '_');
      out[k] = body.slice(eq + 1);
    }
  }
  return out;
}

function parseYmd(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return null;
  const d = new Date(`${String(s).trim()}T12:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

function biometricBaseUrl() {
  const u = process.env.BIOMETRIC_SERVICE_BASE_URL || process.env.BIOMETRIC_SERVICE_URL || '';
  return String(u).trim().replace(/\/$/, '');
}

async function getBiometricModel() {
  const uri = process.env.MONGODB_BIOMETRIC_URI || process.env.MONGODB_ATLAS_BIOMETRIC_URI;
  if (!uri) throw new Error('Set MONGODB_BIOMETRIC_URI or MONGODB_ATLAS_BIOMETRIC_URI for seed/cleanup');
  const conn = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 20000 });
  await conn.asPromise();
  const schema = new mongoose.Schema(
    {
      employeeId: String,
      timestamp: Date,
      logType: String,
      rawType: Number,
      deviceId: String,
      deviceName: String,
    },
    { collection: 'attendancelogs', strict: false }
  );
  const Model = conn.models.ScriptTestAttendanceLog || conn.model('ScriptTestAttendanceLog', schema);
  return { conn, Model };
}

async function cleanupSeed() {
  const { conn, Model } = await getBiometricModel();
  try {
    const res = await Model.deleteMany({
      deviceId: SEED_DEVICE_ID,
      deviceName: SEED_DEVICE_NAME,
    });
    console.log(JSON.stringify({ ok: true, deletedCount: res.deletedCount }, null, 2));
  } finally {
    await conn.close();
  }
}

async function seedPunches(empNo, dojYmd) {
  if (String(process.env.ALLOW_BIOMETRIC_TEST_SEED).toLowerCase() !== 'true') {
    throw new Error('Refusing --seed: set ALLOW_BIOMETRIC_TEST_SEED=true in .env for this run');
  }
  const day = parseYmd(dojYmd);
  if (!day) throw new Error('Invalid --doj for seed (use YYYY-MM-DD)');

  const { conn, Model } = await getBiometricModel();
  const emp = String(empNo).trim();
  const inTs = new Date(day);
  inTs.setUTCHours(8, 1, 22, 0);
  const outTs = new Date(day);
  outTs.setUTCHours(17, 2, 33, 0);

  try {
    await Model.insertMany(
      [
        {
          employeeId: emp,
          timestamp: inTs,
          logType: 'CHECK-IN',
          rawType: 0,
          deviceId: SEED_DEVICE_ID,
          deviceName: SEED_DEVICE_NAME,
        },
        {
          employeeId: emp,
          timestamp: outTs,
          logType: 'CHECK-OUT',
          rawType: 1,
          deviceId: SEED_DEVICE_ID,
          deviceName: SEED_DEVICE_NAME,
        },
      ],
      { ordered: false }
    );
    console.log('Seeded 2 attendancelogs rows:', { employeeId: emp, inTs: inTs.toISOString(), outTs: outTs.toISOString() });
  } catch (e) {
    if (e.code === 11000) {
      console.warn('Seed insert hit duplicate index (timestamps already exist). Continuing.');
    } else {
      throw e;
    }
  } finally {
    await conn.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.cleanup_seed) {
    await cleanupSeed();
    process.exit(0);
    return;
  }

  const empNo = args.emp_no;
  const dojStr = args.doj;
  const verifiedDateStr = args.verified_date;
  const dryRun = !!args.dry_run;
  const seed = !!args.seed;

  if (!empNo || !dojStr || !verifiedDateStr) {
    console.error(
      'Usage: node scripts/liveTestPostVerifyBiometricBackfill.js --emp-no=EMP --doj=YYYY-MM-DD --verified-date=YYYY-MM-DD [--seed] [--dry-run] [--employee-name=Name]\n' +
        '       node scripts/liveTestPostVerifyBiometricBackfill.js --cleanup-seed'
    );
    process.exit(1);
    return;
  }

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI (or MONGO_URI) is required to verify the employee exists in HRMS.');
    process.exit(1);
  }

  const doj = parseYmd(dojStr);
  const verifiedDay = parseYmd(verifiedDateStr);
  if (!doj || !verifiedDay) {
    console.error('doj and verified-date must be YYYY-MM-DD');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 20000 });
  const Employee = require('../employees/model/Employee');
  const empUpper = String(empNo).trim().toUpperCase();
  const exists = await Employee.findOne({ emp_no: empUpper }).select('_id emp_no doj').lean();
  if (!exists) {
    console.error(`No Employee in HRMS with emp_no=${empUpper}. Internal sync would skip all punches.`);
    await mongoose.disconnect();
    process.exit(1);
    return;
  }
  console.log('HRMS employee OK:', { emp_no: exists.emp_no, _id: String(exists._id) });

  if (seed) {
    await seedPunches(empUpper, dojStr);
  }

  const base = biometricBaseUrl();
  if (!base) {
    console.error('Set BIOMETRIC_SERVICE_BASE_URL (or BIOMETRIC_SERVICE_URL) to your biometric microservice base URL.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (dryRun) {
    const range = computeBackfillRange(doj, verifiedDay);
    if (!range) {
      console.error('Invalid DOJ / verified-date range');
      await mongoose.disconnect();
      process.exit(1);
    }
    const params = new URLSearchParams({
      employeeId: empUpper,
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      limit: '5000',
    });
    const logsUrl = `${base}/api/logs?${params.toString()}`;
    try {
      const res = await axios.get(logsUrl, { timeout: 60000 });
      const data = res.data && res.data.data ? res.data.data : [];
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            biometricLogsUrl: logsUrl.split('?')[0] + '?…',
            range: { start: range.start.toISOString(), end: range.end.toISOString() },
            biometricRowCount: Array.isArray(data) ? data.length : 0,
            sample: Array.isArray(data) ? data.slice(0, 3) : [],
          },
          null,
          2
        )
      );
    } catch (err) {
      console.error('Dry-run GET /api/logs failed:', err.response?.data || err.message);
      await mongoose.disconnect();
      process.exit(1);
    }
    await mongoose.disconnect();
    process.exit(0);
    return;
  }

  if (!process.env.HRMS_MICROSERVICE_SECRET_KEY) {
    console.error('HRMS_MICROSERVICE_SECRET_KEY is required for live replay.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const biometricReplayUrl = resolveBiometricReplayServiceUrl();
  if (!biometricReplayUrl) {
    console.error('BIOMETRIC_SERVICE_BASE_URL must be set (post-verify replay no longer reads Mongo from the backend).');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('Replay path: delegate →', biometricReplayUrl);

  const employeeName = args.employee_name ? String(args.employee_name).trim() : undefined;
  const result = await runPostVerifyBiometricBackfill({
    empNo: empUpper,
    doj,
    verifiedAt: verifiedDay,
    ...(employeeName ? { employeeName } : {}),
  });

  console.log(JSON.stringify({ result }, null, 2));
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
