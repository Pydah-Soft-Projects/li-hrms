/**
 * Mongo-only replay: read punches already stored in this service's AttendanceLog collection
 * for [DOJ start .. verified day end] and POST them to HRMS internal sync. No device calls.
 */

const axios = require('axios');
const AttendanceLog = require('../models/AttendanceLog');
const logger = require('../utils/logger');

const BATCH_SIZE = 200;

/** Match device PIN stored as string or number in Mongo (same logic as HRMS biometricReportService). */
function employeeIdQueryVariants(empNo) {
  const emp = String(empNo || '').trim();
  if (!emp) return [];
  const variants = new Set([emp, emp.toUpperCase(), emp.toLowerCase()]);
  if (/^\d+$/.test(emp)) {
    const n = Number(emp);
    if (!Number.isNaN(n) && Number.isSafeInteger(n)) {
      variants.add(n);
    }
    const normalizedDigits = String(Number(emp));
    if (normalizedDigits !== emp) {
      variants.add(normalizedDigits);
      variants.add(normalizedDigits.toUpperCase());
      variants.add(normalizedDigits.toLowerCase());
      const nn = Number(normalizedDigits);
      if (!Number.isNaN(nn)) variants.add(nn);
    }
  }
  return [...variants];
}
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

/**
 * Inclusive calendar window: start of DOJ day → end of verified day (server local timezone).
 * Matches backend postVerifyBiometricBackfillService.computeBackfillRange.
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
  const base = process.env.BACKEND_URL || process.env.BACKEND_INTERNAL_URL;
  if (base) {
    const trimmed = String(base).replace(/\/$/, '');
    return `${trimmed}/api/internal/attendance/sync`;
  }
  return 'http://127.0.0.1:5000/api/internal/attendance/sync';
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

async function findLogsForEmployeeInRange(empNo, rangeStart, rangeEnd) {
  const emp = String(empNo || '').trim();
  if (!emp || !rangeStart || !rangeEnd) return [];
  const start = rangeStart instanceof Date ? rangeStart : new Date(rangeStart);
  const end = rangeEnd instanceof Date ? rangeEnd : new Date(rangeEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const variants = employeeIdQueryVariants(emp);
  return AttendanceLog.find({
    employeeId: { $in: variants },
    timestamp: { $gte: start, $lte: end },
  })
    .sort({ timestamp: 1 })
    .lean();
}

function parseIncomingDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * @param {object} params
 * @param {string} params.empNo
 * @param {Date|string} params.doj
 * @param {Date|string} params.verifiedAt
 * @param {string} [params.employeeName] — audit log only
 */
async function runMongoWindowReplayToHrms({ empNo, doj, verifiedAt, employeeName }) {
  const systemKey = process.env.HRMS_MICROSERVICE_SECRET_KEY;
  if (!systemKey) {
    logger.warn('[MongoReplayToHrms] HRMS_MICROSERVICE_SECRET_KEY not set; skip');
    return { skipped: true, reason: 'no_system_key' };
  }

  const dojDate = parseIncomingDate(doj);
  const verifiedDate = parseIncomingDate(verifiedAt);
  const range = computeBackfillRange(dojDate, verifiedDate);
  if (!range) {
    return { skipped: true, reason: 'invalid_date_range' };
  }

  const empNoUpper = String(empNo || '').trim().toUpperCase();
  if (!empNoUpper) {
    return { skipped: true, reason: 'no_emp_no' };
  }

  const label = employeeName ? `${empNoUpper} (${employeeName})` : empNoUpper;
  const rawLogs = await findLogsForEmployeeInRange(empNo, range.start, range.end);

  if (!rawLogs.length) {
    logger.info(
      `[MongoReplayToHrms] No rows for ${label} between ${range.start.toISOString()} and ${range.end.toISOString()}`
    );
    return { skipped: false, logsFound: 0, sent: 0, batches: 0 };
  }

  const payload = [];
  for (const log of rawLogs) {
    const row = mapLogToSyncPayload(log, empNoUpper);
    if (row) payload.push(row);
  }

  if (!payload.length) {
    logger.info(`[MongoReplayToHrms] ${rawLogs.length} raw rows for ${label} but none had valid logType`);
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
      logger.error(`[MongoReplayToHrms] Batch failed for ${label} (${i}-${i + chunk.length}): ${result.error}`);
      return {
        skipped: false,
        logsFound: rawLogs.length,
        sent,
        batches,
        error: result.error,
        partial: true,
      };
    }
    sent += chunk.length;
    if (i + BATCH_SIZE < payload.length) {
      await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
    }
  }

  logger.info(`[MongoReplayToHrms] ${label}: replayed ${sent}/${payload.length} punches (${batches} batch(es)) → HRMS`);
  return { skipped: false, logsFound: rawLogs.length, sent, batches };
}

module.exports = {
  runMongoWindowReplayToHrms,
  computeBackfillRange,
};
