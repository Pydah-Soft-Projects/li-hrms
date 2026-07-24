/**
 * Helpers for per-device user membership on the golden DeviceUser record.
 * A user may exist on many devices; deviceIds = active, inactiveDeviceIds = removed from terminal.
 * lastDeviceId remains the most recent source SN.
 */

function normalizeDeviceId(sn) {
    const v = sn == null ? '' : String(sn).trim();
    return v || null;
}

/**
 * Mongo update fragment: set last device + mark active membership on that SN.
 * Also clears inactive flag for that SN (re-enrolled / seen again).
 * @param {string} serialNumber
 * @param {object} [extraSet]
 */
function membershipUpdate(serialNumber, extraSet = {}) {
    const sn = normalizeDeviceId(serialNumber);
    const update = {
        $set: {
            ...extraSet,
            lastSyncedAt: new Date()
        }
    };
    if (sn) {
        update.$set.lastDeviceId = sn;
        update.$addToSet = { deviceIds: sn };
        update.$pull = { inactiveDeviceIds: sn };
    }
    return update;
}

/**
 * Build a DeviceUser query for users related to a device.
 * @param {string} sn
 * @param {'active'|'inactive'|'all'} [status='active']
 * @param {object} [extra]
 */
function usersOnDeviceQuery(sn, status = 'active', extra = {}) {
    const id = normalizeDeviceId(sn);
    if (!id) return { ...extra };

    let membership;
    if (status === 'inactive') {
        membership = { inactiveDeviceIds: id };
    } else if (status === 'all') {
        membership = {
            $or: [
                { deviceIds: id },
                { lastDeviceId: id },
                { inactiveDeviceIds: id }
            ]
        };
    } else {
        // Active on device: in deviceIds, or legacy lastDeviceId-only (and not marked inactive)
        membership = {
            $or: [
                { deviceIds: id },
                {
                    $and: [
                        { lastDeviceId: id },
                        {
                            $or: [
                                { deviceIds: { $exists: false } },
                                { deviceIds: { $size: 0 } },
                                { deviceIds: null }
                            ]
                        },
                        { inactiveDeviceIds: { $nin: [id] } }
                    ]
                }
            ]
        };
    }

    return { ...extra, ...membership };
}

/**
 * Mark user inactive on a device in DB (does not delete the golden record).
 */
function deactivateMembershipUpdate(serialNumber) {
    const sn = normalizeDeviceId(serialNumber);
    if (!sn) return null;
    return {
        $pull: { deviceIds: sn },
        $addToSet: { inactiveDeviceIds: sn },
        $set: { lastDeactivatedAt: new Date() }
    };
}

/**
 * Backfill: ensure lastDeviceId is in deviceIds unless already inactive on that SN.
 */
async function backfillDeviceIdsFromLastDevice(DeviceUser) {
    const result = await DeviceUser.updateMany(
        { lastDeviceId: { $exists: true, $nin: [null, ''] } },
        [
            {
                $set: {
                    deviceIds: {
                        $setUnion: [
                            { $ifNull: ['$deviceIds', []] },
                            {
                                $cond: [
                                    {
                                        $in: [
                                            '$lastDeviceId',
                                            { $ifNull: ['$inactiveDeviceIds', []] }
                                        ]
                                    },
                                    [],
                                    ['$lastDeviceId']
                                ]
                            }
                        ]
                    }
                }
            }
        ]
    );
    return result;
}

module.exports = {
    normalizeDeviceId,
    membershipUpdate,
    usersOnDeviceQuery,
    deactivateMembershipUpdate,
    backfillDeviceIdsFromLastDevice
};
