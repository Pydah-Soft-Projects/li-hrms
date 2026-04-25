/**
 * After an employee application is verified, biometric punches from DOJ through the verified
 * calendar day may never have reached AttendanceRawLog because internal sync skips unknown emp_no.
 *
 * Replay is delegated to the biometric Node service only (it reads its own Mongo and POSTs to HRMS).
 * Set BIOMETRIC_SERVICE_BASE_URL (or BIOMETRIC_SERVICE_URL) and HRMS_MICROSERVICE_SECRET_KEY.
 */

const axios = require('axios');

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

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

/**
 * Base URL of the biometric microservice (no trailing slash).
 * Example: http://localhost:4000
 */
function resolveBiometricReplayServiceUrl() {
  const base =
    process.env.BIOMETRIC_SERVICE_BASE_URL ||
    process.env.BIOMETRIC_SERVICE_URL ||
    '';
  const trimmed = String(base).trim();
  if (!trimmed) return null;
  return `${trimmed.replace(/\/$/, '')}/api/internal/replay-window-to-hrms`;
}

async function runPostVerifyBiometricBackfillViaBiometricService({
  empNo,
  doj,
  verifiedAt,
  employeeName,
}) {
  const url = resolveBiometricReplayServiceUrl();
  const systemKey = process.env.HRMS_MICROSERVICE_SECRET_KEY;

  const empNoUpper = String(empNo || '').trim().toUpperCase();
  if (!empNoUpper) return { skipped: true, reason: 'no_emp_no' };

  const range = computeBackfillRange(doj, verifiedAt);
  if (!range) {
    return { skipped: true, reason: 'invalid_date_range' };
  }

  const dojIso = doj instanceof Date ? doj.toISOString() : new Date(doj).toISOString();
  const verifiedIso =
    verifiedAt instanceof Date ? verifiedAt.toISOString() : new Date(verifiedAt).toISOString();

  const body = {
    empNo: empNoUpper,
    doj: dojIso,
    verifiedAt: verifiedIso,
  };
  const nameTrim = employeeName != null ? String(employeeName).trim() : '';
  if (nameTrim) body.employeeName = nameTrim;

  let attempt = 0;
  let lastErr;
  while (attempt < RETRY_ATTEMPTS) {
    try {
      const res = await axios.post(url, body, {
        headers: { 'x-system-key': systemKey },
        timeout: 300000,
      });
      const d = res.data || {};
      return {
        skipped: !!d.skipped,
        reason: d.reason,
        via: 'biometric_service',
        logsFound: d.logsFound ?? 0,
        sent: d.sent ?? 0,
        batches: d.batches ?? 0,
        error: d.error,
        partial: d.partial,
      };
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
  console.error('[PostVerifyBiometricBackfill] Biometric service replay failed:', msg);
  return {
    skipped: false,
    via: 'biometric_service',
    error: msg,
    logsFound: 0,
    sent: 0,
    batches: 0,
  };
}

async function runPostVerifyBiometricBackfill({ empNo, doj, verifiedAt, employeeName }) {
  if (!isBackfillEnabled()) {
    return { skipped: true, reason: 'disabled_by_env' };
  }

  const systemKey = process.env.HRMS_MICROSERVICE_SECRET_KEY;
  if (!systemKey) {
    console.warn('[PostVerifyBiometricBackfill] HRMS_MICROSERVICE_SECRET_KEY not set; skip replay', { empNo });
    return { skipped: true, reason: 'no_system_key' };
  }

  const biometricReplayUrl = resolveBiometricReplayServiceUrl();
  if (!biometricReplayUrl) {
    console.warn(
      '[PostVerifyBiometricBackfill] BIOMETRIC_SERVICE_BASE_URL (or BIOMETRIC_SERVICE_URL) not set; skip replay. ' +
        'Post-verify punch replay runs only via the biometric microservice.'
    );
    return { skipped: true, reason: 'no_biometric_service_url' };
  }

  console.log(`[PostVerifyBiometricBackfill] Delegating replay to biometric service → ${biometricReplayUrl}`);
  return runPostVerifyBiometricBackfillViaBiometricService({
    empNo,
    doj,
    verifiedAt,
    employeeName,
  });
}

function schedulePostVerifyBiometricBackfill({ empNo, doj, verifiedAt, employeeName }) {
  setImmediate(() => {
    runPostVerifyBiometricBackfill({ empNo, doj, verifiedAt, employeeName }).catch((err) => {
      console.error('[PostVerifyBiometricBackfill] Unhandled error:', err.message);
    });
  });
}

module.exports = {
  schedulePostVerifyBiometricBackfill,
  runPostVerifyBiometricBackfill,
  computeBackfillRange,
  resolveBiometricReplayServiceUrl,
};
