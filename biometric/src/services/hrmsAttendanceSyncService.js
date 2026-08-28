/**
 * HRMS attendance outbox helpers.
 * Live ADMS posts once (non-blocking). Connection-lost / timeout punches stay pending
 * and are drained by the catch-up worker when the backend is reachable again.
 */

const axios = require('axios');
const AttendanceLog = require('../models/AttendanceLog');
const logger = require('../utils/logger');

const VALID_LOG_TYPES = new Set([
    'CHECK-IN',
    'CHECK-OUT',
    'BREAK-IN',
    'BREAK-OUT',
    'OVERTIME-IN',
    'OVERTIME-OUT',
]);

const CONNECTION_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'EPIPE',
    'ERR_NETWORK',
    'ENETDOWN',
]);

const OPEN_STATUSES = ['pending', 'syncing', 'failed'];

function envInt(name, fallback, min, max) {
    const raw = process.env[name];
    if (raw == null || String(raw).trim() === '') return fallback;
    const n = parseInt(String(raw), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

function getCatchUpConfig() {
    const enabledRaw = process.env.HRMS_CATCHUP_ENABLED;
    const enabled = enabledRaw == null || String(enabledRaw).trim() === ''
        ? true
        : !['0', 'false', 'no', 'off'].includes(String(enabledRaw).trim().toLowerCase());

    return {
        enabled,
        intervalMs: envInt('HRMS_CATCHUP_INTERVAL_MS', 30000, 5000, 300000),
        batchSize: envInt('HRMS_CATCHUP_BATCH_SIZE', 200, 10, 500),
        lookbackHours: envInt('HRMS_CATCHUP_LOOKBACK_HOURS', 48, 1, 168),
        maxAttempts: envInt('HRMS_CATCHUP_MAX_ATTEMPTS', 8, 1, 50),
        batchGapMs: envInt('HRMS_CATCHUP_BATCH_GAP_MS', 500, 0, 10000),
        maxBatchesPerTick: envInt('HRMS_CATCHUP_MAX_BATCHES_PER_TICK', 5, 1, 50),
        pendingAlertThreshold: envInt('HRMS_CATCHUP_PENDING_ALERT_THRESHOLD', 100, 1, 100000),
        staleSyncingMs: envInt('HRMS_CATCHUP_STALE_SYNCING_MS', 5 * 60 * 1000, 30000, 30 * 60 * 1000),
        liveTimeoutMs: envInt('HRMS_LIVE_SYNC_TIMEOUT_MS', 5000, 1000, 30000),
        catchUpTimeoutMs: envInt('HRMS_CATCHUP_TIMEOUT_MS', 180000, 5000, 300000),
        healthTimeoutMs: envInt('HRMS_HEALTH_TIMEOUT_MS', 3000, 500, 15000),
    };
}

function resolveBackendBaseUrl() {
    const base = process.env.BACKEND_URL || process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:5000';
    return String(base).replace(/\/$/, '');
}

function resolveInternalSyncUrl() {
    return `${resolveBackendBaseUrl()}/api/internal/attendance/sync`;
}

function resolveHealthUrl() {
    return `${resolveBackendBaseUrl()}/health`;
}

function getSystemKey() {
    return process.env.HRMS_MICROSERVICE_SECRET_KEY || 'hrms-secret-key-2026-abc123xyz789';
}

function isTimeoutError(err) {
    if (!err) return false;
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') return true;
    return /timeout/i.test(err.message || '');
}

function isConnectionError(err) {
    if (!err) return false;
    if (CONNECTION_CODES.has(err.code)) return true;
    if (isTimeoutError(err)) return false;
    if (err.response) return false;
    return /ECONNREFUSED|ENOTFOUND|ECONNRESET|socket hang up|Network Error|connect ETIMEDOUT/i.test(
        err.message || ''
    ) || !err.response;
}

function describeAxiosError(err) {
    if (!err) return 'unknown error';
    if (err.code === 'ECONNREFUSED') {
        return `Connection refused at ${resolveInternalSyncUrl()}`;
    }
    if (err.response?.data) {
        try {
            return `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`;
        } catch (_) {
            return `HTTP ${err.response.status}: ${err.message}`;
        }
    }
    return err.message || String(err);
}

function classifySyncError(err) {
    const status = err?.response?.status;
    if (status && status >= 400 && status < 500) return 'client';
    if (status && status >= 500) return 'server';
    if (isConnectionError(err)) return 'connection';
    if (isTimeoutError(err)) return 'timeout';
    return 'unknown';
}

function mapLogToSyncPayload(log) {
    const typeUpper = log.logType ? String(log.logType).toUpperCase() : '';
    if (!VALID_LOG_TYPES.has(typeUpper)) return null;

    const ts = log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp);
    if (isNaN(ts.getTime())) return null;

    let iso = ts.toISOString();
    if (typeof iso === 'string' && !iso.endsWith('Z')) {
        iso = `${iso}Z`;
    }

    const employeeId = String(log.employeeId != null ? log.employeeId : log.userId || '').trim();
    if (!employeeId) return null;

    return {
        employeeId,
        timestamp: iso,
        logType: typeUpper,
        deviceId: log.deviceId || 'UNKNOWN',
        deviceName: log.deviceName || 'UNKNOWN',
        rawStatus: log.rawStatus != null ? log.rawStatus : (log.rawType != null ? log.rawType : null),
    };
}

function identityFromPayload(row) {
    return {
        employeeId: String(row.employeeId),
        timestamp: new Date(row.timestamp),
    };
}

async function markSyncedByIdentities(rows) {
    const identities = (rows || [])
        .map(identityFromPayload)
        .filter((row) => row.employeeId && !isNaN(row.timestamp.getTime()));
    if (!identities.length) return 0;

    let matched = 0;
    const chunkSize = 200;
    for (let i = 0; i < identities.length; i += chunkSize) {
        const chunk = identities.slice(i, i + chunkSize);
        const result = await AttendanceLog.updateMany(
            {
                $or: chunk.map((row) => ({ employeeId: row.employeeId, timestamp: row.timestamp })),
                hrmsSyncStatus: { $in: OPEN_STATUSES },
            },
            {
                $set: {
                    hrmsSyncStatus: 'synced',
                    hrmsSyncedAt: new Date(),
                    hrmsLastError: null,
                    hrmsNextRetryAt: null,
                },
            }
        );
        matched += result.modifiedCount || 0;
    }
    return matched;
}

async function markByIds(ids, fields) {
    if (!ids.length) return 0;
    const result = await AttendanceLog.updateMany(
        { _id: { $in: ids } },
        { $set: fields }
    );
    return result.modifiedCount || 0;
}

async function postPayloadToHrms(payload, timeoutMs) {
    const systemKey = getSystemKey();
    if (!systemKey) {
        return { ok: false, kind: 'config', error: 'HRMS_MICROSERVICE_SECRET_KEY not configured' };
    }
    if (!payload.length) {
        return { ok: true, data: { processed: 0 } };
    }

    try {
        const res = await axios.post(resolveInternalSyncUrl(), payload, {
            headers: { 'x-system-key': systemKey },
            timeout: timeoutMs,
        });
        return { ok: true, data: res.data };
    } catch (err) {
        return {
            ok: false,
            kind: classifySyncError(err),
            error: describeAxiosError(err),
            status: err.response?.status || null,
        };
    }
}

/**
 * One-shot live POST. Never retries connection-lost in this path.
 * Success → pending/failed rows in this payload become synced.
 * Failure → leave pending for catch-up.
 */
async function dispatchLiveSync(syncPayload) {
    const payload = (syncPayload || []).filter((row) => row && row.employeeId && row.timestamp && row.logType);
    if (!payload.length) return { skipped: true, reason: 'empty' };

    const cfg = getCatchUpConfig();
    const result = await postPayloadToHrms(payload, cfg.liveTimeoutMs);
    if (result.ok) {
        const marked = await markSyncedByIdentities(payload);
        logger.info(
            `ADMS Real-Time Sync Success: Backend accepted ${result.data?.processed ?? payload.length} logs; marked ${marked} local row(s) synced.`
        );
        return { ok: true, marked };
    }

    const reason = result.kind === 'connection'
        ? `connection error (${result.error}); left pending for catch-up`
        : result.kind === 'timeout'
            ? `timeout; left pending for catch-up`
            : result.error;
    logger.error(`ADMS Real-Time Sync Failed: ${reason}`);
    return { ok: false, kind: result.kind, error: result.error };
}

async function isHrmsReachable() {
    try {
        const res = await axios.get(resolveHealthUrl(), {
            timeout: getCatchUpConfig().healthTimeoutMs,
            validateStatus: () => true,
        });
        return res.status >= 200 && res.status < 500;
    } catch (err) {
        return false;
    }
}

function lookbackDate(cfg = getCatchUpConfig()) {
    return new Date(Date.now() - cfg.lookbackHours * 60 * 60 * 1000);
}

async function reclaimStaleSyncing(cfg = getCatchUpConfig()) {
    const cutoff = new Date(Date.now() - cfg.staleSyncingMs);
    const result = await AttendanceLog.updateMany(
        { hrmsSyncStatus: 'syncing', updatedAt: { $lt: cutoff } },
        {
            $set: {
                hrmsSyncStatus: 'pending',
                hrmsLastError: 'reclaimed_stale_syncing',
            },
        }
    );
    return result.modifiedCount || 0;
}

async function expirePendingOutsideLookback(cfg = getCatchUpConfig()) {
    const cutoff = lookbackDate(cfg);
    const result = await AttendanceLog.updateMany(
        {
            hrmsSyncStatus: { $in: ['pending', 'syncing'] },
            createdAt: { $lt: cutoff },
        },
        {
            $set: {
                hrmsSyncStatus: 'failed',
                hrmsLastError: 'expired_outside_catchup_lookback',
                hrmsNextRetryAt: null,
            },
        }
    );
    return result.modifiedCount || 0;
}

function pendingQuery(cfg = getCatchUpConfig(), now = new Date()) {
    return {
        hrmsSyncStatus: 'pending',
        createdAt: { $gte: lookbackDate(cfg) },
        $or: [
            { hrmsNextRetryAt: { $exists: false } },
            { hrmsNextRetryAt: null },
            { hrmsNextRetryAt: { $lte: now } },
        ],
    };
}

async function claimPendingBatch(cfg = getCatchUpConfig()) {
    const now = new Date();
    const docs = await AttendanceLog.find(pendingQuery(cfg, now))
        .sort({ createdAt: 1, timestamp: 1 })
        .limit(cfg.batchSize)
        .select('_id')
        .lean();

    const ids = docs.map((d) => d._id);
    if (!ids.length) return [];

    await AttendanceLog.updateMany(
        { _id: { $in: ids }, hrmsSyncStatus: 'pending' },
        { $set: { hrmsSyncStatus: 'syncing' } }
    );

    return AttendanceLog.find({ _id: { $in: ids }, hrmsSyncStatus: 'syncing' })
        .sort({ createdAt: 1, timestamp: 1 })
        .lean();
}

function retryBackoffMs(attempts) {
    const capped = Math.min(Math.max(attempts, 1), 8);
    return Math.min(30000 * (2 ** (capped - 1)), 10 * 60 * 1000);
}

async function failOrDeferIds(logs, errorMessage, kind, cfg = getCatchUpConfig()) {
    const now = new Date();
    const maxAttempts = cfg.maxAttempts;
    let failed = 0;
    let deferred = 0;

    for (const log of logs) {
        const fields = {
            hrmsLastError: errorMessage,
        };
        if (kind === 'connection') {
            fields.hrmsSyncStatus = 'pending';
            fields.hrmsNextRetryAt = null;
            deferred += 1;
        } else {
            const attempts = (log.hrmsSyncAttempts || 0) + 1;
            fields.hrmsSyncAttempts = attempts;
            if (kind === 'client' || attempts >= maxAttempts) {
                fields.hrmsSyncStatus = 'failed';
                fields.hrmsNextRetryAt = null;
                failed += 1;
            } else {
                fields.hrmsSyncStatus = 'pending';
                fields.hrmsNextRetryAt = new Date(now.getTime() + retryBackoffMs(attempts));
                deferred += 1;
            }
        }
        await AttendanceLog.updateOne({ _id: log._id }, { $set: fields });
    }

    return { failed, deferred };
}

async function releaseToPending(logs, errorMessage) {
    const ids = logs.map((l) => l._id);
    return markByIds(ids, {
        hrmsSyncStatus: 'pending',
        hrmsLastError: errorMessage,
        hrmsNextRetryAt: null,
    });
}

async function markLogsSynced(logs) {
    const ids = logs.map((l) => l._id);
    return markByIds(ids, {
        hrmsSyncStatus: 'synced',
        hrmsSyncedAt: new Date(),
        hrmsLastError: null,
        hrmsNextRetryAt: null,
    });
}

async function postLogsToHrms(logs, timeoutMs) {
    const payload = [];
    const skipped = [];
    for (const log of logs) {
        const row = mapLogToSyncPayload(log);
        if (row) payload.push({ log, row });
        else skipped.push(log);
    }

    if (skipped.length) {
        await markByIds(skipped.map((l) => l._id), {
            hrmsSyncStatus: 'failed',
            hrmsLastError: 'invalid_local_payload',
            hrmsNextRetryAt: null,
        });
    }

    if (!payload.length) {
        return { ok: true, sent: 0, skipped: skipped.length };
    }

    const result = await postPayloadToHrms(payload.map((p) => p.row), timeoutMs);
    if (result.ok) {
        await markLogsSynced(payload.map((p) => p.log));
        return { ok: true, sent: payload.length, skipped: skipped.length, data: result.data };
    }
    return {
        ok: false,
        kind: result.kind,
        error: result.error,
        sent: 0,
        skipped: skipped.length,
        logs: payload.map((p) => p.log),
    };
}

async function postLogsIndividually(logs, timeoutMs, cfg) {
    let sent = 0;
    let failed = 0;
    let connectionStop = null;

    for (const log of logs) {
        const one = await postLogsToHrms([log], timeoutMs);
        if (one.ok) {
            sent += one.sent;
            continue;
        }
        if (one.kind === 'connection' || one.kind === 'server') {
            connectionStop = one.error;
            await releaseToPending(one.logs || [log], one.error);
            break;
        }
        const outcome = await failOrDeferIds(one.logs || [log], one.error, one.kind, cfg);
        failed += outcome.failed;
    }

    return { sent, failed, connectionStop };
}

/**
 * Drain one claimed batch. Connection errors stop the tick so we wait for HRMS.
 */
async function drainClaimedBatch(logs, cfg = getCatchUpConfig()) {
    const posted = await postLogsToHrms(logs, cfg.catchUpTimeoutMs);
    if (posted.ok) {
        return { ...posted, stop: false };
    }

    if (posted.kind === 'connection' || posted.kind === 'server') {
        await releaseToPending(posted.logs || logs, posted.error);
        return { ok: false, kind: posted.kind, error: posted.error, sent: 0, stop: true };
    }

    if (posted.kind === 'client' && (posted.logs || logs).length > 1) {
        logger.warn(
            `HRMS catch-up batch rejected (${posted.error}); retrying ${ (posted.logs || logs).length } log(s) individually`
        );
        const isolated = await postLogsIndividually(posted.logs || logs, cfg.catchUpTimeoutMs, cfg);
        return {
            ok: !isolated.connectionStop,
            kind: isolated.connectionStop ? 'connection' : 'client',
            error: isolated.connectionStop || posted.error,
            sent: isolated.sent,
            failed: isolated.failed,
            stop: Boolean(isolated.connectionStop),
        };
    }

    const outcome = await failOrDeferIds(posted.logs || logs, posted.error, posted.kind, cfg);
    return {
        ok: false,
        kind: posted.kind,
        error: posted.error,
        sent: 0,
        failed: outcome.failed,
        deferred: outcome.deferred,
        stop: posted.kind === 'timeout' || posted.kind === 'server' || posted.kind === 'unknown',
    };
}

async function getOutboxCounts() {
    const cfg = getCatchUpConfig();
    const cutoff = lookbackDate(cfg);
    const [pending, pendingInWindow, syncing, failedInWindow] = await Promise.all([
        AttendanceLog.countDocuments({ hrmsSyncStatus: 'pending' }),
        AttendanceLog.countDocuments(pendingQuery(cfg)),
        AttendanceLog.countDocuments({ hrmsSyncStatus: 'syncing' }),
        AttendanceLog.countDocuments({
            hrmsSyncStatus: 'failed',
            createdAt: { $gte: cutoff },
        }),
    ]);
    return {
        pending,
        pendingInWindow,
        syncing,
        failedInWindow,
        lookbackHours: cfg.lookbackHours,
    };
}

module.exports = {
    getCatchUpConfig,
    resolveInternalSyncUrl,
    resolveBackendBaseUrl,
    mapLogToSyncPayload,
    dispatchLiveSync,
    isHrmsReachable,
    isConnectionError,
    classifySyncError,
    reclaimStaleSyncing,
    expirePendingOutsideLookback,
    claimPendingBatch,
    drainClaimedBatch,
    getOutboxCounts,
    pendingQuery,
};
