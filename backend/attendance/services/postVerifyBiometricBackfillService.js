/**
 * After an employee application is verified, biometric punches from DOJ through the verified
 * calendar day may never have reached AttendanceRawLog because internal sync skips unknown emp_no.
 * This module replays those rows from the biometric MongoDB into POST /api/internal/attendance/sync.
 */

const axios = require('axios');
const { findBiometricLogsForEmployeeBackfill, resolveBiometricMongoUri } = require('./biometricReportService');

const BATCH_SIZE = 200;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const BATCH_GAP_MS = 500;

const VALID_LOG_TYPES = new Set([
  'CHECK-IN',
  'CHECK-OUT',
  'BREAK-OUT',
  'BREAK-IN',
  'OVERTIME-IN',
  'OVERTIME-OUT',
]);

function isBackfillEnabled() {
  const v = String(process.env.POST_VERIFY_BIOMETRIC_BACKFILL || 'true').toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

/**
 * Inclusive calendar window: start of DOJ day → end of verified day (server local timezone).
 */
function computeBackfillRange(doj, verifiedAt) {
  const start = doj instanceof Date ? new Date(doj) : new Date(doj);
  const endDay = verifiedAt instanceof Date ? new Date(verifiedAt) : new Date(verifiedAt);
  if (isNaN(start.getTime()) || isNaN(endDay.getTime())) return null;

  start.setHours(0, 0, 0, 0);
  endDay.setHours(23, 59, 59, 999);

  if (start > endDay) return null;
  return { start, end: endDay };
}

function resolveInternalSyncUrl() {
  const base =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.API_BASE ||
    process.env.BACKEND_URL;
  if (base) {
    const trimmed = String(base).replace(/\/$/, '');
    return `${trimmed}/api/internal/attendance/sync`;
  }
  const port = process.env.PORT || 5000;
  return `http://127.0.0.1:${port}/api/internal/attendance/sync`;
}

function mapLogToSyncPayload(log, empNoUpper) {
  const typeUpper = log.logType ? String(log.logType).toUpperCase() : '';
  if (!VALID_LOG_TYPES.has(typeUpper)) return null;

  const ts = log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp);
  if (isNaN(ts.getTime())) return null;

  let iso = ts.toISOString();
  if (typeof iso === 'string' && !iso.endsWith('Z')) {
    iso = `${iso}Z`;
  }

  return {
    employeeId: empNoUpper,
    timestamp: iso,
    logType: typeUpper,
    deviceId: log.deviceId || 'UNKNOWN',
    deviceName: log.deviceName || 'UNKNOWN',
    rawStatus: log.rawType != null ? log.rawType : null,
  };
}

async function postBatchToInternalSync(url, systemKey, payload) {
  let attempt = 0;
  let lastErr;
  while (attempt < RETRY_ATTEMPTS) {
    try {
      const res = await axios.post(url, payload, {
        headers: { 'x-system-key': systemKey },
        timeout: 180000,
      });
      return { ok: true, data: res.data };
    } catch (err) {
      lastErr = err;
      attempt += 1;
      if (attempt < RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  const msg = lastErr?.response?.data
    ? JSON.stringify(lastErr.response.data)
    : lastErr?.message || 'unknown error';
  return { ok: false, error: msg };
}

/**
 * Fetches biometric logs for the window and POSTs them to the internal attendance sync (same path as the biometric microservice).
 */
async function runPostVerifyBiometricBackfill({ empNo, doj, verifiedAt }) {
  if (!isBackfillEnabled()) {
    return { skipped: true, reason: 'disabled_by_env' };
  }
  if (!resolveBiometricMongoUri()) {
    console.warn('[PostVerifyBiometricBackfill] No biometric Mongo URI; skip replay', { empNo });
    return { skipped: true, reason: 'no_biometric_uri' };
  }

  const systemKey = process.env.HRMS_MICROSERVICE_SECRET_KEY;
  if (!systemKey) {
    console.warn('[PostVerifyBiometricBackfill] HRMS_MICROSERVICE_SECRET_KEY not set; skip replay', { empNo });
    return { skipped: true, reason: 'no_system_key' };
  }

  const range = computeBackfillRange(doj, verifiedAt);
  if (!range) {
    return { skipped: true, reason: 'invalid_date_range' };
  }

  const empNoUpper = String(empNo || '').trim().toUpperCase();
  if (!empNoUpper) return { skipped: true, reason: 'no_emp_no' };

  const rawLogs = await findBiometricLogsForEmployeeBackfill(empNo, range.start, range.end);
  if (!rawLogs.length) {
    console.log(
      `[PostVerifyBiometricBackfill] No biometric rows for ${empNoUpper} between ${range.start.toISOString()} and ${range.end.toISOString()}`
    );
    return { skipped: false, logsFound: 0, batches: 0 };
  }

  const payload = [];
  for (const log of rawLogs) {
    const row = mapLogToSyncPayload(log, empNoUpper);
    if (row) payload.push(row);
  }

  if (!payload.length) {
    console.log(`[PostVerifyBiometricBackfill] ${rawLogs.length} raw rows for ${empNoUpper} but none had valid logType`);
    return { skipped: false, logsFound: rawLogs.length, sent: 0, batches: 0 };
  }

  const url = resolveInternalSyncUrl();
  let batches = 0;
  let sent = 0;
  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const chunk = payload.slice(i, i + BATCH_SIZE);
    const result = await postBatchToInternalSync(url, systemKey, chunk);
    batches += 1;
    if (!result.ok) {
      console.error(
        `[PostVerifyBiometricBackfill] Batch failed for ${empNoUpper} (${i}-${i + chunk.length}):`,
        result.error
      );
      break;
    }
    sent += chunk.length;
    if (i + BATCH_SIZE < payload.length) {
      await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
    }
  }

  console.log(
    `[PostVerifyBiometricBackfill] ${empNoUpper}: replayed ${sent}/${payload.length} punches to internal sync (${batches} batch(es))`
  );
  return { skipped: false, logsFound: rawLogs.length, sent, batches };
}

function schedulePostVerifyBiometricBackfill({ empNo, doj, verifiedAt }) {
  setImmediate(() => {
    runPostVerifyBiometricBackfill({ empNo, doj, verifiedAt }).catch((err) => {
      console.error('[PostVerifyBiometricBackfill] Unhandled error:', err.message);
    });
  });
}

module.exports = {
  schedulePostVerifyBiometricBackfill,
  runPostVerifyBiometricBackfill,
  computeBackfillRange,
  mapLogToSyncPayload,
};
