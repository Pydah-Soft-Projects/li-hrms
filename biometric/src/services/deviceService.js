const ZKLib = require('node-zklib');
const AttendanceLog = require('../models/AttendanceLog');
const Device = require('../models/Device');
const logger = require('../utils/logger');

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
}

module.exports = DeviceService;
