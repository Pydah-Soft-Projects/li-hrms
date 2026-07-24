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

    // Record intended membership immediately (device will confirm on next USERINFO push)
    const targetIds = devices.map((d) => d.deviceId);
    await DeviceUser.updateOne(
        { userId },
        {
            $addToSet: { deviceIds: { $each: targetIds } },
            $pull: { inactiveDeviceIds: { $in: targetIds } }
        }
    );

    logger.info(`Clone: User ${userId} queued for ${devices.length} device(s): ${targetIds.join(', ')}`);

    return {
        userId,
        devicesQueued: devices.length,
        deviceIds: targetIds,
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

/**
 * Queue DATA DELETE USERINFO for one user on one device.
 */
async function queueUserDeleteOnDevice(userId, device) {
    const cmd = `DATA DELETE USERINFO PIN=${userId}`;
    await DeviceCommand.create({
        deviceId: device.deviceId,
        command: cmd,
        status: 'PENDING'
    });
}

/**
 * Delete user(s) from a device terminal and mark inactive in DB (keep golden record).
 * @param {string[]} userIds
 * @param {string} deviceId
 */
async function deactivateUsersOnDevice(userIds, deviceId) {
    const { deactivateMembershipUpdate, normalizeDeviceId } = require('../utils/deviceMembership');
    const sn = normalizeDeviceId(deviceId);
    if (!sn) {
        const err = new Error('deviceId is required');
        err.code = 'BAD_REQUEST';
        throw err;
    }

    const device = await Device.findOne({ deviceId: sn }).lean();
    if (!device) {
        const err = new Error('Device not found');
        err.code = 'DEVICE_NOT_FOUND';
        throw err;
    }

    const ids = [...new Set((userIds || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) {
        const err = new Error('userIds required');
        err.code = 'BAD_REQUEST';
        throw err;
    }

    const memUpdate = deactivateMembershipUpdate(sn);
    const results = [];
    const errors = [];

    for (const userId of ids) {
        try {
            const user = await DeviceUser.findOne({ userId });
            if (!user) {
                errors.push({ userId, error: 'User not found in database' });
                continue;
            }

            await queueUserDeleteOnDevice(userId, device);
            await DeviceUser.updateOne({ userId }, memUpdate);

            results.push({
                userId,
                deviceId: sn,
                commandQueued: true,
                status: 'inactive'
            });
            logger.info(`Delete: User ${userId} queued for removal on ${sn}; marked inactive in DB`);
        } catch (err) {
            errors.push({ userId, error: err.message });
        }
    }

    return {
        deviceId: sn,
        deviceName: device.name,
        deleted: results.length,
        results,
        errors
    };
}

/**
 * Re-activate user(s) on a device: push profile+biometrics to terminal and mark active in DB.
 * @param {string[]} userIds
 * @param {string} deviceId
 */
async function activateUsersOnDevice(userIds, deviceId) {
    const { normalizeDeviceId } = require('../utils/deviceMembership');
    const sn = normalizeDeviceId(deviceId);
    if (!sn) {
        const err = new Error('deviceId is required');
        err.code = 'BAD_REQUEST';
        throw err;
    }

    const device = await Device.findOne({ deviceId: sn }).lean();
    if (!device) {
        const err = new Error('Device not found');
        err.code = 'DEVICE_NOT_FOUND';
        throw err;
    }

    const ids = [...new Set((userIds || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) {
        const err = new Error('userIds required');
        err.code = 'BAD_REQUEST';
        throw err;
    }

    const results = [];
    const errors = [];

    for (const userId of ids) {
        try {
            const user = await DeviceUser.findOne({ userId });
            if (!user) {
                errors.push({ userId, error: 'User not found in database' });
                continue;
            }

            await queueUserCloneToDevice(user, device);
            await DeviceUser.updateOne(
                { userId },
                {
                    $addToSet: { deviceIds: sn },
                    $pull: { inactiveDeviceIds: sn },
                    $set: { lastSyncedAt: new Date(), lastDeviceId: sn }
                }
            );

            results.push({
                userId,
                deviceId: sn,
                commandQueued: true,
                status: 'active',
                fingerprintCount: user.fingerprints?.length || 0
            });
            logger.info(`Activate: User ${userId} queued for write on ${sn}; marked active in DB`);
        } catch (err) {
            errors.push({ userId, error: err.message });
        }
    }

    return {
        deviceId: sn,
        deviceName: device.name,
        activated: results.length,
        results,
        errors
    };
}

/**
 * Deactivate one user on every device they are currently active on.
 * Keeps golden DeviceUser; marks inactiveDeviceIds.
 */
async function deactivateUserOnAllActiveDevices(userId) {
    const pin = String(userId || '').trim();
    if (!pin) {
        const err = new Error('userId is required');
        err.code = 'BAD_REQUEST';
        throw err;
    }

    const user = await DeviceUser.findOne({ userId: pin });
    if (!user) {
        return {
            userId: pin,
            skipped: true,
            reason: 'user_not_found',
            deviceIds: [],
            deleted: 0,
            results: [],
            errors: []
        };
    }

    const activeIds = Array.isArray(user.deviceIds) && user.deviceIds.length
        ? [...new Set(user.deviceIds.map(String))]
        : (user.lastDeviceId && !(user.inactiveDeviceIds || []).includes(user.lastDeviceId)
            ? [String(user.lastDeviceId)]
            : []);

    if (!activeIds.length) {
        return {
            userId: pin,
            skipped: true,
            reason: 'no_active_devices',
            deviceIds: [],
            deleted: 0,
            results: [],
            errors: []
        };
    }

    const results = [];
    const errors = [];
    for (const deviceId of activeIds) {
        try {
            const r = await deactivateUsersOnDevice([pin], deviceId);
            results.push(...(r.results || []));
            errors.push(...(r.errors || []));
        } catch (err) {
            errors.push({ userId: pin, deviceId, error: err.message });
        }
    }

    return {
        userId: pin,
        skipped: false,
        deviceIds: activeIds,
        deleted: results.length,
        results,
        errors
    };
}

/**
 * Activate one user on given devices, or on inactiveDeviceIds if deviceIds omitted.
 */
async function activateUserOnDevices(userId, deviceIds) {
    const pin = String(userId || '').trim();
    if (!pin) {
        const err = new Error('userId is required');
        err.code = 'BAD_REQUEST';
        throw err;
    }

    const user = await DeviceUser.findOne({ userId: pin });
    if (!user) {
        return {
            userId: pin,
            skipped: true,
            reason: 'user_not_found',
            deviceIds: [],
            activated: 0,
            results: [],
            errors: []
        };
    }

    let targets = Array.isArray(deviceIds)
        ? [...new Set(deviceIds.map(String).filter(Boolean))]
        : [];
    if (!targets.length) {
        targets = Array.isArray(user.inactiveDeviceIds)
            ? [...new Set(user.inactiveDeviceIds.map(String))]
            : [];
    }

    if (!targets.length) {
        return {
            userId: pin,
            skipped: true,
            reason: 'no_target_devices',
            deviceIds: [],
            activated: 0,
            results: [],
            errors: []
        };
    }

    const results = [];
    const errors = [];
    for (const deviceId of targets) {
        try {
            const r = await activateUsersOnDevice([pin], deviceId);
            results.push(...(r.results || []));
            errors.push(...(r.errors || []));
        } catch (err) {
            errors.push({ userId: pin, deviceId, error: err.message });
        }
    }

    return {
        userId: pin,
        skipped: false,
        deviceIds: targets,
        activated: results.length,
        results,
        errors
    };
}

module.exports = {
    queueUserCloneToDevice,
    resolveTargetDevices,
    cloneUserToDevices,
    autoCloneUserWithinCategory,
    queueUserDeleteOnDevice,
    deactivateUsersOnDevice,
    activateUsersOnDevice,
    deactivateUserOnAllActiveDevices,
    activateUserOnDevices
};
