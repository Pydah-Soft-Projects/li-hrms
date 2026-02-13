const ZKLib = require('node-zklib');
const AttendanceLog = require('../models/AttendanceLog');
const Device = require('../models/Device');
const logger = require('../utils/logger');
const DeviceUser = require('../models/DeviceUser');

// Map device status codes to log types
// Note: These mappings may vary by device model - adjust as needed
// Different eSSL/ZKTeco models use different status codes
const LOG_TYPE_MAP = {
    0: 'CHECK-IN',
    1: 'CHECK-OUT',
    2: 'BREAK-OUT',
    3: 'BREAK-IN',
    4: 'OVERTIME-IN',
    5: 'OVERTIME-OUT',
    // Fallback/Legacy codes
    255: 'CHECK-IN'
};

/**
 * ZK Protocol Constants (for Polyfill)
 */
const CMD = {
    CMD_SET_USER: 8,
    CMD_SET_USER_TEMP: 9, // Often 9 or 88 depending on device, trying 9 first
};

class DeviceService {
    constructor(deviceConfig = null) {
        this.deviceConfig = deviceConfig;
    }

    /**
     * Load devices from database
     */
    async loadDevicesFromDB() {
        try {
            const devices = await Device.find({ enabled: true }).lean();
            return devices;
        } catch (error) {
            logger.error('Error loading devices from database:', error);
            return [];
        }
    }

    /**
     * Connect to a single device and fetch logs
     */
    async fetchLogsFromDevice(device) {
        let zkInstance = null;

        try {
            logger.info(`Connecting to device: ${device.name} (${device.ip}:${device.port})`);

            // Create ZKLib instance
            zkInstance = new ZKLib(device.ip, device.port, 10000, 4000);

            try {
                // Create socket connection
                await zkInstance.createSocket();
                logger.info(`Connected to ${device.name}`);

                // Get attendance logs
                const attendances = await zkInstance.getAttendances();
                logger.info(`Fetched ${attendances.data.length} logs from ${device.name}`);

                // ==========================================
                // CONSOLE LOG: Complete Raw Data from Device
                // ==========================================
                console.log('\n');
                console.log('═'.repeat(80));
                console.log(`TCP SYNC COMPLETED - Device: ${device.name} (${device.ip}:${device.port})`);
                console.log('═'.repeat(80));
                console.log(`Total Records Fetched: ${attendances.data.length}`);
                console.log('─'.repeat(80));
                console.log('COMPLETE RAW DATA FROM DEVICE:');
                console.log(JSON.stringify(attendances.data, null, 2));
                console.log('═'.repeat(80));
                console.log('\n');

                // Get the last log timestamp for this device to perform incremental sync
                const deviceDoc = await Device.findOne({ deviceId: device.deviceId });
                const lastLogTimestamp = deviceDoc ? deviceDoc.lastLogTimestamp : null;
                if (lastLogTimestamp) {
                    logger.info(`Performing incremental sync for ${device.name}. Last log: ${lastLogTimestamp.toISOString()}`);
                }

                // Sort records newest first to allow early exit
                const sortedRecords = attendances.data.sort((a, b) => {
                    const timeA = new Date(a.recordTime || a.timestamp || a.time);
                    const timeB = new Date(b.recordTime || b.timestamp || b.time);
                    return timeB - timeA;
                });

                // Process and store logs
                const savedLogs = [];
                let unknownCodeCount = 0;
                const MAX_UNKNOWN_WARNINGS = 5;
                let newestLogTimestamp = lastLogTimestamp;

                if (sortedRecords.length > 0 && !lastLogTimestamp) {
                    const firstRecord = sortedRecords[0];
                    logger.info('================ RAW DEVICE DATA SAMPLE ================');
                    logger.info(`Device: ${device.name}`);
                    logger.info(`Keys: ${Object.keys(firstRecord).join(', ')}`);
                    logger.info(`Data: ${JSON.stringify(firstRecord)}`);
                    logger.info('========================================================');
                }

                const bulkOps = [];
                const logsToSave = [];

                for (const record of sortedRecords) {
                    try {
                        const currentTimestamp = new Date(record.recordTime || record.timestamp || record.time);

                        // Incremental Sync Skip
                        if (lastLogTimestamp && currentTimestamp <= lastLogTimestamp) {
                            break;
                        }

                        // Track newest
                        if (!newestLogTimestamp || currentTimestamp > newestLogTimestamp) {
                            newestLogTimestamp = currentTimestamp;
                        }

                        // Determine Mapping
                        const statusCode = record.inOutMode !== undefined ? record.inOutMode :
                            (record.attState !== undefined ? record.attState :
                                (record.status !== undefined ? record.status : record.state));

                        const logType = this.mapLogType(statusCode);

                        if (logType === 'CHECK-IN' && statusCode === undefined && unknownCodeCount < MAX_UNKNOWN_WARNINGS) {
                            // logger.warn(...) - reduced noise
                            unknownCodeCount++;
                        }

                        const empId = record.deviceUserId || record.userId || record.uid || record.id;

                        // PUSH TO BULK OPS (Insert Only if not exists)
                        // We use insertOne. If it exists, it will throw duplicate key error which we ignore via ordered: false
                        bulkOps.push({
                            insertOne: {
                                document: {
                                    employeeId: empId,
                                    timestamp: currentTimestamp,
                                    logType: logType,
                                    rawType: statusCode,
                                    rawData: record,
                                    deviceId: device.deviceId,
                                    deviceName: device.name,
                                    syncedAt: new Date()
                                }
                            }
                        });

                    } catch (err) {
                        logger.error(`Error processing record:`, err.message);
                    }
                }

                // Execute Bulk Write
                if (bulkOps.length > 0) {
                    try {
                        // ordered: false lets non-duplicates succeed even if some fail
                        const result = await AttendanceLog.bulkWrite(bulkOps, { ordered: false });
                        logger.info(`Synced ${device.name}: Inserted ${result.insertedCount} new logs.`);
                        savedLogs.length = result.insertedCount;

                        // ==========================================
                        // CONSOLE LOG: Processed Records Details
                        // ==========================================
                        console.log('\n');
                        console.log('═'.repeat(80));
                        console.log(`PROCESSED ATTENDANCE LOGS - Device: ${device.name}`);
                        console.log('═'.repeat(80));
                        console.log(`Total Processed: ${bulkOps.length}`);
                        console.log(`New Logs Inserted: ${result.insertedCount}`);
                        console.log('─'.repeat(80));
                        console.log('PROCESSED RECORDS DETAILS:');
                        bulkOps.forEach((op, index) => {
                            const doc = op.insertOne.document;
                            console.log(`\n[${index + 1}] Employee: ${doc.employeeId} | Time: ${doc.timestamp.toISOString()} | Type: ${doc.logType}`);
                            console.log(`    Raw Type: ${doc.rawType} | Device: ${doc.deviceName} (${doc.deviceId})`);
                            console.log(`    Raw Data: ${JSON.stringify(doc.rawData)}`);
                        });
                        console.log('\n' + '═'.repeat(80));
                        console.log('\n');
                    } catch (bulkError) {
                        if (bulkError.writeErrors) {
                            const inserted = bulkError.result.insertedCount;
                            logger.info(`Synced ${device.name}: Inserted ${inserted} new logs (collisions ignored).`);
                            savedLogs.length = inserted;
                        } else {
                            throw bulkError; // Real error
                        }
                    }
                }

                logger.info(`Synced ${savedLogs.length} new logs from ${device.name}`);

                // ==========================================
                // CONSOLE LOG: Sync Summary
                // ==========================================
                console.log('\n');
                console.log('═'.repeat(80));
                console.log(`TCP SYNC SUMMARY - Device: ${device.name}`);
                console.log('═'.repeat(80));
                console.log(`Device ID: ${device.deviceId}`);
                console.log(`Device IP: ${device.ip}:${device.port}`);
                console.log(`Total Records Fetched: ${attendances.data.length}`);
                console.log(`New Logs Saved: ${savedLogs.length}`);
                console.log(`Last Log Timestamp: ${newestLogTimestamp ? newestLogTimestamp.toISOString() : 'N/A'}`);
                console.log(`Sync Completed At: ${new Date().toISOString()}`);
                console.log('═'.repeat(80));
                console.log('\n');

                // Update device sync status and track the latest log timestamp
                await Device.findOneAndUpdate(
                    { deviceId: device.deviceId },
                    {
                        lastSyncAt: new Date(),
                        lastSyncStatus: 'success',
                        lastLogTimestamp: newestLogTimestamp
                    }
                ).catch(err => { });

                // Disconnect
                await zkInstance.disconnect();

                return {
                    success: true,
                    device: device.name,
                    totalFetched: attendances.data.length,
                    newLogs: savedLogs.length
                };

            } catch (innerError) {
                logger.error(`Error during sync for ${device.name}:`, innerError.message);
                throw innerError;
            }

        } catch (error) {
            logger.error(`Failed to fetch logs from ${device.name}:`, error.message);

            // Update device sync status as failed
            await Device.findOneAndUpdate(
                { deviceId: device.deviceId },
                {
                    lastSyncAt: new Date(),
                    lastSyncStatus: 'failed'
                }
            ).catch(err => { });

            // Try to disconnect if connection was established
            if (zkInstance) {
                try {
                    await zkInstance.disconnect();
                } catch (disconnectError) {
                    // Ignore disconnect errors
                }
            }

            return {
                success: false,
                device: device.name,
                error: error.message
            };
        }
    }

    /**
     * Fetch raw logs from device without saving to DB (for debugging)
     */
    async fetchRawLogsDirectly(deviceId) {
        try {
            const device = await Device.findOne({ deviceId });
            if (!device) throw new Error('Device not found');

            logger.info(`API: Direct raw fetch for ${device.name}`);
            const zkInstance = new ZKLib(device.ip, device.port, 10000, 4000);

            await zkInstance.createSocket();
            const attendances = await zkInstance.getAttendances();
            await zkInstance.disconnect();

            return {
                success: true,
                device: device.name,
                count: attendances.data.length,
                rawData: attendances.data.slice(0, 25) // Only return first 25 to avoid heavy response
            };
        } catch (error) {
            logger.error(`Direct raw fetch failed:`, error.message);
            throw error;
        }
    }

    /**
     * Map device status code to log type
     */
    mapLogType(statusCode) {
        const logType = LOG_TYPE_MAP[statusCode];

        if (!logType) {
            // Log unknown status codes so we can add them to the mapping
            logger.warn(`Unknown status code: ${statusCode} - defaulting to CHECK-IN`);
            return 'CHECK-IN'; // Default to CHECK-IN for unknown codes
        }

        return logType;
    }

    /**
   * Fetch logs from all enabled devices
   */
    async fetchLogsFromAllDevices() {
        // Load devices from database if not provided in constructor
        let enabledDevices;
        if (this.deviceConfig) {
            enabledDevices = this.deviceConfig.filter(d => d.enabled);
        } else {
            enabledDevices = await this.loadDevicesFromDB();
        }

        logger.info(`Starting sync for ${enabledDevices.length} devices`);

        const results = [];

        // Fetch from each device sequentially to avoid overwhelming network
        for (const device of enabledDevices) {
            const result = await this.fetchLogsFromDevice(device);
            results.push(result);
        }

        const successCount = results.filter(r => r.success).length;
        const totalNewLogs = results.reduce((sum, r) => sum + (r.newLogs || 0), 0);

        logger.info(`Sync complete: ${successCount}/${enabledDevices.length} devices successful, ${totalNewLogs} new logs`);

        return {
            totalDevices: enabledDevices.length,
            successfulDevices: successCount,
            totalNewLogs: totalNewLogs,
            results: results
        };
    }

    /**
     * Check connectivity status of all devices
     */
    async checkDeviceStatus() {
        // Load devices from database if not provided in constructor
        let allDevices;
        if (this.deviceConfig) {
            allDevices = this.deviceConfig;
        } else {
            allDevices = await Device.find().lean();
        }

        const statuses = [];

        for (const device of allDevices) {
            if (!device.enabled) {
                statuses.push({
                    deviceId: device.deviceId,
                    name: device.name,
                    status: 'disabled',
                    lastSyncAt: device.lastSyncAt,
                    lastSyncStatus: device.lastSyncStatus
                });
                continue;
            }

            let zkInstance = null;
            try {
                zkInstance = new ZKLib(device.ip, device.port, 10000, 2000);
                await zkInstance.createSocket();
                await zkInstance.disconnect();

                statuses.push({
                    deviceId: device.deviceId,
                    name: device.name,
                    ip: device.ip,
                    status: 'online',
                    lastSyncAt: device.lastSyncAt,
                    lastSyncStatus: device.lastSyncStatus
                });
            } catch (error) {
                statuses.push({
                    deviceId: device.deviceId,
                    name: device.name,
                    ip: device.ip,
                    status: 'offline',
                    error: error.message,
                    lastSyncAt: device.lastSyncAt,
                    lastSyncStatus: device.lastSyncStatus
                });

                if (zkInstance) {
                    try {
                        await zkInstance.disconnect();
                    } catch (e) {
                        // Ignore
                    }
                }
            }
        }

        return statuses;
    }
    /**
     * =========================================
     *  BIOMETRIC TEMPLATE SYNC (Multi-Master)
     * =========================================
     */

    async syncAllDevices() {
        // 1. Load all healthy/enabled devices
        const devices = await this.loadDevicesFromDB();
        const syncReport = {
            harvested: [],
            distributed: [],
            errors: []
        };

        logger.info(`Starting Master-Sync for ${devices.length} devices...`);

        // PHASE 1: HARVEST (Pull from all devices to DB)
        for (const device of devices) {
            try {
                logger.info(`Harvesting from ${device.name}...`);
                const stats = await this.harvestFromDevice(device);
                syncReport.harvested.push({ device: device.name, stats });
            } catch (err) {
                logger.error(`Harvest failed for ${device.name}: ${err.message}`);
                syncReport.errors.push({ device: device.name, error: err.message, phase: 'harvest' });
            }
        }

        // PHASE 2: DISTRIBUTE (Push DB Golden Record to all devices)
        // Re-fetch full golden record from DB
        const allUsers = await DeviceUser.find({}).lean();
        logger.info(`Distribution Phase: Syncing ${allUsers.length} users to ${devices.length} devices...`);

        for (const device of devices) {
            try {
                const stats = await this.distributeToDevice(device, allUsers);
                syncReport.distributed.push({ device: device.name, stats });
            } catch (err) {
                logger.error(`Distribution failed for ${device.name}: ${err.message}`);
                syncReport.errors.push({ device: device.name, error: err.message, phase: 'distribute' });
            }
        }

        return syncReport;
    }

    /**
     * Connect to device, fetch ALL users and templates, merge into DB
     */
    async harvestFromDevice(device) {
        let zk = null;
        const stats = { usersFound: 0, templatesFound: 0, newUsers: 0, updatedTemplates: 0 };

        try {
            zk = new ZKLib(device.ip, device.port, 10000, 4000);
            await zk.createSocket();

            // 1. Get Users (Basic Info)
            const users = await zk.getUsers();
            stats.usersFound = users.data.length;

            for (const u of users.data) {
                // Upsert User Base Info
                // node-zklib usually returns: { userId, name, cardno, password, role }
                const userId = u.userId || u.uid;

                await DeviceUser.updateOne(
                    { userId: userId },
                    {
                        $set: {
                            name: u.name,
                            role: u.role || 0,
                            card: u.cardno || '',
                            password: u.password || '',
                        },
                        $setOnInsert: { fingerprints: [] } // Init array if new
                    },
                    { upsert: true }
                );
            }

            // 2. Get Templates (Fingerprints)
            // zk.getUserTmps() isn't always reliable for bulk, but let's try standard way
            // or iterate users if needed. Some libs have getAllUserTemplates()
            // Using standard getAttendances like logic often doesn't apply to templates.
            // We'll iterate users found to be safe, or use specialized command if available.
            // For this implementation, we assume `getUserOnFly` or we iterate known users.

            // Note: Efficient way is specific to library version. 
            // We'll assume `getUserTp(userId, tempId)` or `getTemplates()` exists. 
            // Often `zk.getUser` returns templates in some versions.

            // Let's try iterating users to fetch templates (Safest cross-device method)
            for (const u of users.data) {
                const userId = u.userId || u.uid;

                // Read 0-9 fingers
                for (let i = 0; i < 10; i++) {
                    try {
                        // This is a blocking call, might be slow for many users.
                        // In prod, this should be optimized or limited.
                        const tmpl = await zk.getUserTp(userId, i); // Custom wrapper needed or raw cmd
                        // Note: If library doesn't support getUserTp directly, we might need to extend it.
                        // Assuming standard node-zklib-alternatives or we might need to catch error if empty.

                        if (tmpl && tmpl.length > 10) { // Valid template
                            await DeviceUser.updateOne(
                                { userId: userId },
                                {
                                    $addToSet: {
                                        fingerprints: {
                                            fingerIndex: i,
                                            templateData: tmpl
                                        }
                                    }
                                }
                            );
                            stats.templatesFound++;
                        }
                    } catch (e) {
                        // ignore if no template for this finger
                    }
                }
            }

            await zk.disconnect();
            return stats;

        } catch (e) {
            if (zk) try { await zk.disconnect(); } catch (dz) { }
            throw e;
        }
    }

    /**
     * Push global users to a specific device
     */
    async distributeToDevice(device, allUsers) {
        let zk = null;
        const stats = { sentUsers: 0, sentTemplates: 0 };

        try {
            zk = new ZKLib(device.ip, device.port, 10000, 4000);
            await zk.createSocket();

            for (const user of allUsers) {
                try {
                    // 1. Set User Info
                    // Use Polyfill if library missing method
                    if (typeof zk.setUser === 'function') {
                        await zk.setUser(
                            user.userId,
                            user.card || 0,
                            user.role || 0,
                            user.password || '',
                            user.name || ''
                        );
                    } else {
                        await this.setUserPolyfill(zk, user);
                    }
                    stats.sentUsers++;

                    // 2. Set Templates
                    if (user.fingerprints && user.fingerprints.length > 0) {
                        for (const fp of user.fingerprints) {
                            if (typeof zk.setUserTp === 'function') {
                                await zk.setUserTp(user.userId, fp.fingerIndex, fp.templateData);
                            } else {
                                await this.setUserTemplatePolyfill(zk, user.userId, fp.fingerIndex, fp.templateData);
                            }
                            stats.sentTemplates++;
                        }
                    }
                } catch (uErr) {
                    logger.error(`Failed to push user ${user.userId} to ${device.name}: ${uErr.message}`);
                }
            }

            await zk.disconnect();
            return stats;

        } catch (e) {
            if (zk) try { await zk.disconnect(); } catch (dz) { }
            throw e;
        }
    }

    /**
     * Polyfill for setUser (CMD 8)
     * Structure (72 bytes):
     * - 2B UID
     * - 1B Role
     * - 8B Password
     * - 24B Name
     * - 4B Card
     * - 1B Group (1)
     * - 2B Timezones (0)
     * - 4B UserID (String? No, mostly int in binary, but check)
     * ... padding/reserved
     */
    async setUserPolyfill(zk, user) {
        // Construct 72-byte buffer for standard ZK DataUser
        const buf = Buffer.alloc(72);

        // 1. UID (Internal ID) - We often map UserId to UID for simplicity or auto-gen
        // Ideally we should query free UID, but for sync we force it.
        const uid = parseInt(user.userId);
        buf.writeUInt16LE(uid, 0);

        // 2. Role (1=Admin, 0=User usually, or 14=Admin)
        buf.writeUInt8(user.role || 0, 2);

        // 3. Password (8 bytes)
        if (user.password) {
            buf.write(user.password, 3, 8);
        }

        // 4. Name (24 bytes)
        if (user.name) {
            // Ensure null termination or clean string
            const nameBuf = Buffer.from(user.name);
            nameBuf.copy(buf, 11, 0, Math.min(24, nameBuf.length));
        }

        // 5. Card (4 bytes) at offset 35
        // Wait, standard offsets:
        // 0-1: UID
        // 2: Role
        // 3-10: Pwd
        // 11-34: Name
        // 35-38: Card
        // 39: Group
        // 40-41: Timezones
        // 42-47: ??? 
        // 48-56: UserID (String representation) -> 9 bytes?

        buf.writeUInt32LE(parseInt(user.card || 0), 35);
        buf.writeUInt8(1, 39); // Group

        // UserID String at offset 48 (length 9 usually)
        if (user.userId) {
            buf.write(user.userId.toString(), 48, 9);
        }

        // Execute Command 8
        // Need to access executeCmd. If it's private, we are stuck.
        // Assuming zk.executeCmd or zk.zklibTcp.executeCmd exists.

        if (zk.executeCmd) {
            await zk.executeCmd(CMD.CMD_SET_USER, buf);
        } else if (zk.zklibTcp && zk.zklibTcp.executeCmd) {
            await zk.zklibTcp.executeCmd(CMD.CMD_SET_USER, buf);
        } else {
            throw new Error('Cannot execute low-level commands on this library');
        }
    }

    /**
     * Polyfill for setUserTemplate (CMD 9)
     */
    async setUserTemplatePolyfill(zk, userId, fingerIndex, templateData) {
        // CMD_SET_USER_TEMP (9)
        // Packet:
        // 2B: UID (Internal ID)
        // 1B: Finger Index (0-9)
        // 2048B (or varying): Template Data? 
        // No, typically:
        // Header: Size(2), UID(2), FID(1), Valid(1), Template(...)

        // Actually, ZK protocols are complex here. 
        // Simplest binary struct for CMD 9:
        // 0-1: UID
        // 2: FingerIndex
        // 3: Valid (1)
        // 4+: Template Data (Base64 decoded? or raw?)

        // NOTE: templateData in DB should ideally be the raw binary string/buffer.
        // If it's Base64, we convert.

        const uid = parseInt(userId);

        // We assume templateData is valid raw buffer related content
        // If templateData is string, generic buffer
        let tmplBuf = Buffer.from(templateData, 'base64'); // Assuming cached as B64
        if (tmplBuf.length < 10) {
            // Maybe it was already raw string?
            tmplBuf = Buffer.from(templateData);
        }

        const head = Buffer.alloc(4);
        head.writeUInt16LE(uid, 0);
        head.writeUInt8(fingerIndex, 2);
        head.writeUInt8(1, 3); // Valid flag

        const totalBuf = Buffer.concat([head, tmplBuf]);

        if (zk.executeCmd) {
            await zk.executeCmd(CMD.CMD_SET_USER_TEMP, totalBuf);
        } else if (zk.zklibTcp && zk.zklibTcp.executeCmd) {
            await zk.zklibTcp.executeCmd(CMD.CMD_SET_USER_TEMP, totalBuf);
        }
    }
}

module.exports = DeviceService;