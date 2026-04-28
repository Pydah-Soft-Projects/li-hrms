const BiometricSettings = require('../models/BiometricSettings');

const DEVICE_OPERATION_GROUPS = new Set([
    'CHECK-IN',
    'CHECK-OUT',
    'BREAK-IN',
    'BREAK-OUT',
    'OVERTIME-IN',
    'OVERTIME-OUT'
]);

const LOG_TYPE_MAP = {
    0: 'CHECK-IN',
    1: 'CHECK-OUT',
    2: 'BREAK-OUT',
    3: 'BREAK-IN',
    4: 'OVERTIME-IN',
    5: 'OVERTIME-OUT',
    255: 'CHECK-IN'
};

function normalizeOperationMode(mode) {
    const raw = String(mode || '').trim().toUpperCase();
    return raw === 'DEVICE' ? 'DEVICE' : 'OPERATION';
}

function normalizeOperationGroup(group) {
    const raw = String(group || '').trim().toUpperCase();
    if (!DEVICE_OPERATION_GROUPS.has(raw)) return null;
    return raw;
}

async function getEffectiveOperationMode() {
    const envMode = normalizeOperationMode(process.env.BIOMETRIC_OPERATION_MODE);
    const settings = await BiometricSettings.findOne({ key: 'global' }).lean();
    const dbMode = settings?.operationMode ? normalizeOperationMode(settings.operationMode) : null;
    return dbMode || envMode || 'OPERATION';
}

function resolveLogType({ rawStatusCode, deviceOperationGroup, operationMode }) {
    const rawLogType = LOG_TYPE_MAP[rawStatusCode] || 'CHECK-IN';
    const mode = normalizeOperationMode(operationMode);
    const normalizedGroup = normalizeOperationGroup(deviceOperationGroup);

    if (mode === 'DEVICE' && normalizedGroup) {
        return {
            resolvedLogType: normalizedGroup,
            rawLogType
        };
    }

    return {
        resolvedLogType: rawLogType,
        rawLogType
    };
}

module.exports = {
    DEVICE_OPERATION_GROUPS: [...DEVICE_OPERATION_GROUPS],
    normalizeOperationMode,
    normalizeOperationGroup,
    getEffectiveOperationMode,
    resolveLogType
};
