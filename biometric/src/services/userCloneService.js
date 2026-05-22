const Device = require('../models/Device');
const DeviceUser = require('../models/DeviceUser');
const DeviceCategory = require('../models/DeviceCategory');
const DeviceCommand = require('../models/DeviceCommand');
const logger = require('../utils/logger');

/**
 * Queue profile + biometrics for one user onto one device (ADMS command queue).
 */
async function queueUserCloneToDevice(user, device) {
    const sep = device.protocol?.separator || '\t';

    const userCmd = `DATA UPDATE USERINFO PIN=${user.userId}${sep}Name=${user.name || ''}${sep}Password=${user.password || ''}${sep}Group=1${sep}Card=${user.card || ''}${sep}Role=${user.role || 0}`;
    await DeviceCommand.create({
        deviceId: device.deviceId,
        command: userCmd,
        status: 'PENDING'
    });

    if (user.fingerprints?.length) {
        for (const fp of user.fingerprints) {
            const fpCmd = `DATA UPDATE FINGERTMP PIN=${user.userId}${sep}FID=${fp.fingerIndex}${sep}Size=${fp.templateData.length}${sep}Valid=1${sep}TMP=${fp.templateData}`;
            await DeviceCommand.create({
                deviceId: device.deviceId,
                command: fpCmd,
                status: 'PENDING'
            });
        }
    }

    if (user.photo?.content) {
        const photoCmd = `DATA UPDATE USERPIC PIN=${user.userId}${sep}FileName=${user.photo.fileName || (user.userId + '.jpg')}${sep}Size=${user.photo.content.length}${sep}Content=${user.photo.content}`;
        await DeviceCommand.create({
            deviceId: device.deviceId,
            command: photoCmd,
            status: 'PENDING'
        });
    }

    if (user.face?.templateData) {
        const faceCmd = `DATA UPDATE FACE PIN=${user.userId}\tFID=0\tSize=${user.face.length || user.face.templateData.length}\tValid=1\tTMP=${user.face.templateData}`;
        await DeviceCommand.create({
            deviceId: device.deviceId,
            command: faceCmd,
            status: 'PENDING'
        });
    }
}

/**
 * Resolve target devices for clone operations.
 */
async function resolveTargetDevices({
    sourceDeviceId,
    targetDeviceId,
    targetDeviceIds,
    categoryId,
    excludeSource = true
}) {
    const enabledFilter = { enabled: true };

    if (targetDeviceId) {
        const one = await Device.findOne({ deviceId: targetDeviceId, ...enabledFilter }).lean();
        return one ? [one] : [];
    }

    if (targetDeviceIds?.length) {
        const ids = [...new Set(targetDeviceIds.map(String))];
        const list = await Device.find({ deviceId: { $in: ids }, ...enabledFilter }).lean();
        return list;
    }

    if (categoryId) {
        const list = await Device.find({ categoryId, ...enabledFilter }).lean();
        if (excludeSource && sourceDeviceId) {
            return list.filter((d) => d.deviceId !== sourceDeviceId);
        }
        return list;
    }

    return [];
}

/**
 * Clone one golden-record user to multiple devices.
 */
async function cloneUserToDevices(userId, options = {}) {
    const user = await DeviceUser.findOne({ userId });
    if (!user) {
        const err = new Error('User not found');
        err.code = 'USER_NOT_FOUND';
        throw err;
    }

    const devices = await resolveTargetDevices({
        sourceDeviceId: options.sourceDeviceId,
        targetDeviceId: options.targetDeviceId,
        targetDeviceIds: options.targetDeviceIds,
        categoryId: options.categoryId,
        excludeSource: options.excludeSource !== false
    });

    if (devices.length === 0) {
        return { userId, devicesQueued: 0, deviceIds: [] };
    }

    for (const device of devices) {
        await queueUserCloneToDevice(user, device);
    }

    logger.info(`Clone: User ${userId} queued for ${devices.length} device(s): ${devices.map((d) => d.deviceId).join(', ')}`);

    return {
        userId,
        devicesQueued: devices.length,
        deviceIds: devices.map((d) => d.deviceId),
        fingerprintCount: user.fingerprints?.length || 0
    };
}

/**
 * Category-scoped auto-clone when a user is enrolled on a source device.
 */
async function autoCloneUserWithinCategory(userId, sourceDeviceId) {
    const { getValues } = require('./biometricSettingsService');
    const settings = await getValues();
    if (!settings.autoCloneNewUsers) {
        return { skipped: true, reason: 'auto-clone new users is disabled' };
    }

    const sourceDevice = await Device.findOne({ deviceId: sourceDeviceId }).lean();
    if (!sourceDevice?.categoryId) {
        return { skipped: true, reason: 'source device has no machine category' };
    }

    const category = await DeviceCategory.findOne({ categoryId: sourceDevice.categoryId }).lean();
    if (!category?.autoCloneEnabled) {
        return { skipped: true, reason: 'category auto-clone disabled' };
    }

    const result = await cloneUserToDevices(userId, {
        sourceDeviceId,
        categoryId: sourceDevice.categoryId,
        excludeSource: true
    });

    return { skipped: false, ...result };
}

module.exports = {
    queueUserCloneToDevice,
    resolveTargetDevices,
    cloneUserToDevices,
    autoCloneUserWithinCategory
};
