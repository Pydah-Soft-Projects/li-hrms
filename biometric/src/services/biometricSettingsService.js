const BiometricSettings = require('../models/BiometricSettings');
const { normalizeOperationMode } = require('../utils/operationModeResolver');

const GLOBAL_KEY = 'global';
const CACHE_MS = 4000;

const DEFAULTS = {
    operationMode: 'OPERATION',
    autoCloneNewUsers: false,
    syncStoredDeviceUserToTerminal: true,
    deviceHeartbeatStaleMs: 180000,
    syncIntervalMinutes: 15,
    timezoneOffset: '+05:30',
    admsFreshBackupHardCapMs: 3600000,
    admsFreshBackupQuietPeriodMs: 12000,
    admsFreshBackupFirstBatchWaitMs: 180000,
    admsFreshBackupApiHardCapMs: 7200000
};

let cachedFlat = null;
let cacheAt = 0;

function envBool(name, fallback) {
    const v = process.env[name];
    if (v === undefined || v === '') return fallback;
    return String(v).toLowerCase() === 'true';
}

function envInt(name, fallback) {
    const n = parseInt(process.env[name], 10);
    return Number.isFinite(n) ? n : fallback;
}

function envStr(name, fallback) {
    const v = process.env[name];
    return v != null && String(v).trim() !== '' ? String(v).trim() : fallback;
}

function pickField(doc, field, envValue) {
    if (doc && doc[field] !== undefined && doc[field] !== null) {
        return { value: doc[field], source: 'database' };
    }
    if (envValue !== undefined && envValue !== null && envValue !== '') {
        return { value: envValue, source: 'env' };
    }
    return { value: DEFAULTS[field], source: 'default' };
}

function buildEffective(doc) {
    const fields = {
        operationMode: pickField(doc, 'operationMode', envStr('BIOMETRIC_OPERATION_MODE', null)),
        autoCloneNewUsers: pickField(doc, 'autoCloneNewUsers', process.env.AUTO_CLONE_NEW_USERS !== undefined
            ? envBool('AUTO_CLONE_NEW_USERS', DEFAULTS.autoCloneNewUsers)
            : undefined),
        syncStoredDeviceUserToTerminal: pickField(
            doc,
            'syncStoredDeviceUserToTerminal',
            process.env.SYNC_STORED_DEVICEUSER_TO_TERMINAL !== undefined
                ? envBool('SYNC_STORED_DEVICEUSER_TO_TERMINAL', DEFAULTS.syncStoredDeviceUserToTerminal)
                : undefined
        ),
        deviceHeartbeatStaleMs: pickField(
            doc,
            'deviceHeartbeatStaleMs',
            process.env.DEVICE_HEARTBEAT_STALE_MS ? envInt('DEVICE_HEARTBEAT_STALE_MS', null) : undefined
        ),
        syncIntervalMinutes: pickField(
            doc,
            'syncIntervalMinutes',
            process.env.SYNC_INTERVAL_MINUTES !== undefined
                ? envInt('SYNC_INTERVAL_MINUTES', DEFAULTS.syncIntervalMinutes)
                : undefined
        ),
        timezoneOffset: pickField(doc, 'timezoneOffset', envStr('TIMEZONE_OFFSET', null)),
        admsFreshBackupHardCapMs: pickField(
            doc,
            'admsFreshBackupHardCapMs',
            process.env.ADMS_FRESH_BACKUP_HARD_CAP_MS ? envInt('ADMS_FRESH_BACKUP_HARD_CAP_MS', null) : undefined
        ),
        admsFreshBackupQuietPeriodMs: pickField(
            doc,
            'admsFreshBackupQuietPeriodMs',
            process.env.ADMS_FRESH_BACKUP_QUIET_PERIOD_MS ? envInt('ADMS_FRESH_BACKUP_QUIET_PERIOD_MS', null) : undefined
        ),
        admsFreshBackupFirstBatchWaitMs: pickField(
            doc,
            'admsFreshBackupFirstBatchWaitMs',
            process.env.ADMS_FRESH_BACKUP_FIRST_BATCH_WAIT_MS ? envInt('ADMS_FRESH_BACKUP_FIRST_BATCH_WAIT_MS', null) : undefined
        ),
        admsFreshBackupApiHardCapMs: pickField(
            doc,
            'admsFreshBackupApiHardCapMs',
            process.env.ADMS_FRESH_BACKUP_API_HARD_CAP_MS ? envInt('ADMS_FRESH_BACKUP_API_HARD_CAP_MS', null) : undefined
        )
    };

    const values = {};
    const sources = {};
    for (const [key, meta] of Object.entries(fields)) {
        if (key === 'operationMode') {
            values[key] = normalizeOperationMode(meta.value);
        } else {
            values[key] = meta.value;
        }
        sources[key] = meta.source;
    }

    return { values, sources, updatedAt: doc?.updatedAt || null };
}

function invalidateCache() {
    cachedFlat = null;
    cacheAt = 0;
}

/**
 * Effective settings (DB → env → default). Cached briefly for hot paths.
 */
async function getEffectiveSettings(force = false) {
    if (!force && cachedFlat && Date.now() - cacheAt < CACHE_MS) {
        return cachedFlat;
    }
    const doc = await BiometricSettings.findOne({ key: GLOBAL_KEY }).lean();
    const built = buildEffective(doc);
    cachedFlat = built;
    cacheAt = Date.now();
    return built;
}

async function getValues() {
    const { values } = await getEffectiveSettings();
    return values;
}

function getTimezoneOffsetSync() {
    if (cachedFlat?.values?.timezoneOffset) return cachedFlat.values.timezoneOffset;
    return envStr('TIMEZONE_OFFSET', DEFAULTS.timezoneOffset);
}

const UPDATABLE_FIELDS = [
    'operationMode',
    'autoCloneNewUsers',
    'syncStoredDeviceUserToTerminal',
    'deviceHeartbeatStaleMs',
    'syncIntervalMinutes',
    'timezoneOffset',
    'admsFreshBackupHardCapMs',
    'admsFreshBackupQuietPeriodMs',
    'admsFreshBackupFirstBatchWaitMs',
    'admsFreshBackupApiHardCapMs'
];

async function updateSettings(patch) {
    const $set = {};
    for (const field of UPDATABLE_FIELDS) {
        if (patch[field] === undefined) continue;
        $set[field] = patch[field];
    }
    if (Object.keys($set).length === 0) {
        throw new Error('No valid settings fields provided');
    }
    if ($set.operationMode !== undefined) {
        $set.operationMode = normalizeOperationMode($set.operationMode);
    }
    if ($set.autoCloneNewUsers !== undefined) {
        $set.autoCloneNewUsers = Boolean($set.autoCloneNewUsers);
    }
    if ($set.syncStoredDeviceUserToTerminal !== undefined) {
        $set.syncStoredDeviceUserToTerminal = Boolean($set.syncStoredDeviceUserToTerminal);
    }
    const numericFields = [
        'deviceHeartbeatStaleMs',
        'syncIntervalMinutes',
        'admsFreshBackupHardCapMs',
        'admsFreshBackupQuietPeriodMs',
        'admsFreshBackupFirstBatchWaitMs',
        'admsFreshBackupApiHardCapMs'
    ];
    for (const field of numericFields) {
        if ($set[field] === undefined) continue;
        const n = parseInt($set[field], 10);
        if (!Number.isFinite(n) || n < 0) {
            throw new Error(`${field} must be a non-negative number`);
        }
        $set[field] = n;
    }
    if ($set.syncIntervalMinutes !== undefined && $set.syncIntervalMinutes > 0 && $set.syncIntervalMinutes < 1) {
        throw new Error('syncIntervalMinutes must be 0 (off) or at least 1');
    }
    if ($set.timezoneOffset !== undefined) {
        const tz = String($set.timezoneOffset).trim();
        if (!/^[+-]\d{2}:\d{2}$/.test(tz)) {
            throw new Error('timezoneOffset must be like +05:30 or -04:00');
        }
        $set.timezoneOffset = tz;
    }

    const updated = await BiometricSettings.findOneAndUpdate(
        { key: GLOBAL_KEY },
        { $set },
        { new: true, upsert: true }
    ).lean();

    invalidateCache();
    return buildEffective(updated);
}

function getEnvReadOnly() {
    const mask = (v) => {
        if (!v) return null;
        if (v.length <= 8) return '••••••••';
        return v.slice(0, 4) + '…' + v.slice(-4);
    };
    return {
        port: process.env.PORT || '4001',
        mongodbConfigured: Boolean(process.env.MONGODB_URI),
        backendUrl: process.env.BACKEND_URL || process.env.BACKEND_INTERNAL_URL || null,
        hrmsMongoConfigured: Boolean(process.env.HRMS_MONGODB_URI),
        microserviceKeyConfigured: Boolean(process.env.HRMS_MICROSERVICE_SECRET_KEY),
        microserviceKeyPreview: mask(process.env.HRMS_MICROSERVICE_SECRET_KEY),
        attlogBackupDir: process.env.DEVICE_ATTLOG_BACKUP_DIR || '(default under biometric/data)',
        s3BackupEnabled: envBool('ATTLOG_BACKUP_S3_ENABLED', false)
    };
}

module.exports = {
    DEFAULTS,
    UPDATABLE_FIELDS,
    getEffectiveSettings,
    getValues,
    getTimezoneOffsetSync,
    updateSettings,
    invalidateCache,
    getEnvReadOnly
};
