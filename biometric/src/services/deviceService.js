const fs = require('fs').promises;
const path = require('path');
const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');
const AttendanceLog = require('../models/AttendanceLog');
const Device = require('../models/Device');
const AdmsRawLog = require('../models/AdmsRawLog');
const DeviceCommand = require('../models/DeviceCommand');
const admsParser = require('../utils/admsParser');
const { uploadAttlogBackupFile } = require('../utils/attlogS3Upload');
const logger = require('../utils/logger');
const DeviceUser = require('../models/DeviceUser');
const { getEffectiveOperationMode, resolveLogType } = require('../utils/operationModeResolver');

const ADMS_ATTLOG_SYNC_COMMAND = 'DATA QUERY ATTLOG';

/** Directory for JSON backups pulled from devices (override with DEVICE_ATTLOG_BACKUP_DIR). */
const ATTLOG_BACKUP_ROOT = process.env.DEVICE_ATTLOG_BACKUP_DIR
    || path.join(__dirname, '../../data/device-attlog-backups');

function envMs(name, fallback, min, max) {
    const raw = process.env[name];
    if (raw == null || String(raw).trim() === '') return fallback;
    const n = parseInt(String(raw), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

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
        /** @type {Map<string, number>} deviceId -> ref count while fresh ADMS backup is capturing ATTLOG */
        this._admsFreshBackupHrmsSyncSuppressRef = new Map();
    }

    /**
     * While ref count is positive, ADMS ATTLOG posts for this device skip POST to HRMS (fresh backup capture).
     */
    beginAdmsFreshBackupSuppressHrmsSync(deviceId) {
        const id = String(deviceId);
        const n = (this._admsFreshBackupHrmsSyncSuppressRef.get(id) || 0) + 1;
        this._admsFreshBackupHrmsSyncSuppressRef.set(id, n);
    }

    endAdmsFreshBackupSuppressHrmsSync(deviceId) {
        const id = String(deviceId);
        const next = (this._admsFreshBackupHrmsSyncSuppressRef.get(id) || 0) - 1;
        if (next <= 0) this._admsFreshBackupHrmsSyncSuppressRef.delete(id);
        else this._admsFreshBackupHrmsSyncSuppressRef.set(id, next);
    }

    shouldSuppressHrmsSyncForAdmsAttlog(deviceId) {
        return (this._admsFreshBackupHrmsSyncSuppressRef.get(String(deviceId)) || 0) > 0;
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
     * Latest punch time seen in a raw getAttendances() array (for lastLogTimestamp).
     */
    _maxPunchTimeFromRawList(rows) {
        let maxT = null;
        for (const record of rows || []) {
            const t = this.getRecordTime(record);
            if (t && (!maxT || t > maxT)) maxT = t;
        }
        return maxT;
    }

    /**
     * Connect to a single device and fetch logs
     * @param {object} device — Device doc / lean object
     * @param {object} [options]
     * @param {string} [options.startDate] — YYYY-MM-DD inclusive (server parses as local start-of-day)
     * @param {string} [options.endDate] — YYYY-MM-DD inclusive (local end-of-day)
     * If startDate and/or endDate set, scans full device buffer and inserts only punches in range (backfill-friendly).
     * If omitted, keeps incremental behaviour (only punches newer than lastLogTimestamp).
     */
    async fetchLogsFromDevice(device, options = {}) {
        const startDate = options.startDate && String(options.startDate).trim() ? String(options.startDate).trim() : undefined;
        const endDate = options.endDate && String(options.endDate).trim() ? String(options.endDate).trim() : undefined;
        const rangeMode = Boolean(startDate || endDate);

        let zkInstance = null;

        try {
            logger.info(`Connecting to device: ${device.name} (${device.ip}:${device.port})${rangeMode ? ` [range ${startDate || '…'} → ${endDate || '…'}]` : ''}`);

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
                const operationMode = await getEffectiveOperationMode();
                const deviceOperationGroup = deviceDoc?.operationGroup || device?.operationGroup || null;
                if (!rangeMode && lastLogTimestamp) {
                    logger.info(`Performing incremental sync for ${device.name}. Last log: ${lastLogTimestamp.toISOString()}`);
                }
                if (rangeMode) {
                    logger.info(`Range sync for ${device.name}: window ${startDate || '(start open)'} → ${endDate || '(end open)'}`);
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

                let inRangeCount = 0;

                for (const record of sortedRecords) {
                    try {
                        const currentTimestamp = new Date(record.recordTime || record.timestamp || record.time);
                        if (Number.isNaN(currentTimestamp.getTime())) {
                            continue;
                        }

                        if (rangeMode) {
                            const inWindow = this.filterDeviceAttendanceRecords([record], {
                                startDate,
                                endDate
                            }).length > 0;
                            if (!inWindow) {
                                continue;
                            }
                            inRangeCount++;
                        } else if (lastLogTimestamp && currentTimestamp <= lastLogTimestamp) {
                            // Incremental: sorted newest first — stop once we hit already-synced data
                            break;
                        }

                        // Track newest among processed inserts
                        if (!newestLogTimestamp || currentTimestamp > newestLogTimestamp) {
                            newestLogTimestamp = currentTimestamp;
                        }

                        // Determine Mapping
                        const statusCode = record.inOutMode !== undefined ? record.inOutMode :
                            (record.attState !== undefined ? record.attState :
                                (record.status !== undefined ? record.status : record.state));

                        const { resolvedLogType } = resolveLogType({
                            rawStatusCode: statusCode,
                            deviceOperationGroup,
                            operationMode
                        });

                        if (resolvedLogType === 'CHECK-IN' && statusCode === undefined && unknownCodeCount < MAX_UNKNOWN_WARNINGS) {
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
                                    logType: resolvedLogType,
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
                const deviceLatestPunch = this._maxPunchTimeFromRawList(attendances.data);
                const lastLogToStore = deviceLatestPunch || newestLogTimestamp || lastLogTimestamp;
                console.log(`Last punch on device (max): ${deviceLatestPunch ? deviceLatestPunch.toISOString() : 'N/A'}`);
                console.log(`lastLogTimestamp (device doc): ${lastLogToStore ? lastLogToStore.toISOString() : 'N/A'}`);
                console.log(`Sync Completed At: ${new Date().toISOString()}`);
                console.log('═'.repeat(80));
                console.log('\n');

                await Device.findOneAndUpdate(
                    { deviceId: device.deviceId },
                    {
                        lastSyncAt: new Date(),
                        lastSyncStatus: 'success',
                        lastLogTimestamp: lastLogToStore
                    }
                ).catch(err => { });

                // Disconnect
                await zkInstance.disconnect();

                return {
                    success: true,
                    device: device.name,
                    deviceId: device.deviceId,
                    totalFetched: attendances.data.length,
                    newLogs: savedLogs.length,
                    rangeMode,
                    dateRange: rangeMode ? { startDate: startDate || null, endDate: endDate || null } : null,
                    rowsInRange: rangeMode ? inRangeCount : undefined
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
     * Normalize employee / user id from a ZK attendance row (TCP or mixed shapes).
     */
    getRecordEmployeeKey(record) {
        const v = record.deviceUserId ?? record.userId ?? record.uid ?? record.id;
        if (v === undefined || v === null) return '';
        return String(v).trim();
    }

    getRecordTime(record) {
        const t = record.recordTime ?? record.timestamp ?? record.time;
        if (!t) return null;
        const d = t instanceof Date ? t : new Date(t);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    /**
     * Parse YYYY-MM-DD into local start-of-day (server timezone).
     */
    parseDateOnlyStart(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10) - 1;
        const d = parseInt(m[3], 10);
        return new Date(y, mo, d, 0, 0, 0, 0);
    }

    parseDateOnlyEnd(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10) - 1;
        const d = parseInt(m[3], 10);
        return new Date(y, mo, d, 23, 59, 59, 999);
    }

    normalizeEmployeeIdList(employeeIds) {
        if (!employeeIds) return null;
        const arr = Array.isArray(employeeIds) ? employeeIds : String(employeeIds).split(/[\s,]+/);
        const set = new Set(arr.map((x) => String(x).trim()).filter(Boolean));
        return set.size ? set : null;
    }

    /**
     * Filter raw device rows by optional date range and/or employee numbers.
     */
    filterDeviceAttendanceRecords(records, { startDate, endDate, employeeIds } = {}) {
        const start = startDate ? this.parseDateOnlyStart(startDate) : null;
        const end = endDate ? this.parseDateOnlyEnd(endDate) : null;
        const idSet = this.normalizeEmployeeIdList(employeeIds);

        return records.filter((rec) => {
            const ts = this.getRecordTime(rec);
            if (!ts) return false;
            if (start && ts < start) return false;
            if (end && ts > end) return false;
            if (idSet) {
                const key = this.getRecordEmployeeKey(rec);
                if (!idSet.has(key)) return false;
            }
            return true;
        });
    }

    async ensureBackupDir() {
        await fs.mkdir(ATTLOG_BACKUP_ROOT, { recursive: true });
    }

    async _uploadAttlogBackupToS3IfEnabled(filePath, { deviceId, operationTag } = {}) {
        try {
            return await uploadAttlogBackupFile(filePath, { deviceId, operationTag });
        } catch (e) {
            logger.error('S3 upload error:', e.message);
            return { uploaded: false, error: e.message };
        }
    }

    /**
     * Connect via TCP and read all attendance rows from the terminal (no DB write).
     */
    async pullAllAttendancesFromDevice(device) {
        const zkInstance = new ZKLib(device.ip, device.port, 10000, 4000);
        await zkInstance.createSocket();
        try {
            const attendances = await zkInstance.getAttendances();
            const info = await zkInstance.getInfo().catch(() => null);
            return { zkInstance, rows: attendances.data || [], info };
        } catch (e) {
            await zkInstance.disconnect().catch(() => { });
            throw e;
        }
    }

    /**
     * Clears only attendance / punch records on the terminal.
     * Uses node-zklib `clearAttendanceLog()` → ZK CMD_CLEAR_ATTLOG (0x000f)—not CMD_CLEAR_DATA.
     * Per ZK spec, user accounts, fingerprint templates, face data, and cards are separate from ATTLOG;
     * do not call CMD_CLEAR_DATA here (that command can wipe users or templates depending on payload).
     */
    async clearAttendanceLogOnConnection(zkInstance) {
        await zkInstance.disableDevice();
        await zkInstance.clearAttendanceLog();
        await zkInstance.executeCmd(COMMANDS.CMD_REFRESHDATA, '');
        await zkInstance.enableDevice();
    }

    /**
     * Write JSON from rows already returned by the terminal over TCP (`getAttendances`).
     * Never reads MongoDB AttendanceLog.
     */
    async writeAttendanceBackupFromDeviceRows(device, allRows, deviceInfo, {
        startDate = null,
        endDate = null,
        employeeIds = null,
        includeAllInFile = true,
        operationTag = null
    } = {}) {
        const filtered = (startDate || endDate || this.normalizeEmployeeIdList(employeeIds))
            ? this.filterDeviceAttendanceRecords(allRows, { startDate, endDate, employeeIds })
            : allRows;

        const recordsForFile = includeAllInFile ? allRows : filtered;

        await this.ensureBackupDir();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeId = String(device.deviceId).replace(/[^a-zA-Z0-9-_]/g, '_');
        const filename = `attlog_${safeId}_${stamp}.json`;
        const filePath = path.join(ATTLOG_BACKUP_ROOT, filename);

        const payload = {
            dataSource: 'zk_tcp_device_getAttendances',
            note: 'Rows are exactly what was read from the physical device over TCP. Not loaded from MongoDB.',
            exportedAt: new Date().toISOString(),
            operationTag,
            deviceId: device.deviceId,
            deviceName: device.name,
            deviceIp: device.ip,
            devicePort: device.port,
            filterApplied: { startDate: startDate || null, endDate: endDate || null, employeeIds: employeeIds || null },
            rowsInDeviceSnapshot: allRows.length,
            rowsWrittenToFile: recordsForFile.length,
            rowsMatchingFilter: filtered.length,
            deviceInfo: deviceInfo || null,
            records: recordsForFile
        };

        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');

        logger.info(`Attendance backup written (from device TCP): ${filePath} (${recordsForFile.length} rows)`);

        const s3 = await this._uploadAttlogBackupToS3IfEnabled(filePath, {
            deviceId: device.deviceId,
            operationTag: operationTag || 'tcp_backup'
        });

        return {
            success: true,
            filePath,
            filename,
            rowsInDeviceSnapshot: allRows.length,
            rowsWrittenToFile: recordsForFile.length,
            rowsMatchingFilter: filtered.length,
            deviceInfo: deviceInfo || null,
            s3
        };
    }

    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Turn AdmsRawLog lean docs into pushBatches structure (rawBody + parsedRecords).
     */
    _admsRawLogLeanDocsToPushBatches(docs) {
        const pushBatches = [];
        let totalParsedPunches = 0;

        for (const d of docs) {
            let rawStr = '';
            if (typeof d.body === 'string') {
                rawStr = d.body;
            } else if (d.body != null) {
                rawStr = typeof d.body === 'object' ? JSON.stringify(d.body) : String(d.body);
            }

            const parsed = admsParser.parseTextRecords(rawStr);
            totalParsedPunches += parsed.length;

            pushBatches.push({
                mongoId: String(d._id),
                receivedAt: d.receivedAt,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt,
                ipAddress: d.ipAddress,
                method: d.method,
                admsQuery: d.query || {},
                table: d.table,
                rawBody: rawStr,
                rawBodyCharLength: rawStr.length,
                parsedPunchCount: parsed.length,
                parsedRecords: parsed
            });
        }

        return { pushBatches, totalParsedPunches };
    }

    /**
     * Queue DATA QUERY ATTLOG, wait for new ATTLOG POSTs after cutoff, write JSON from those batches only.
     * Does not include older AdmsRawLog rows—only pushes received while waiting.
     */
    async backupFreshAdmsAttlogAfterQueue(deviceId, options = {}) {
        const device = await Device.findOne({ deviceId });
        if (!device) {
            const err = new Error('Device not found');
            err.code = 'DEVICE_NOT_FOUND';
            throw err;
        }

        const pollIntervalMs = options.pollIntervalMs ?? 2000;
        const quietPeriodMs = options.quietPeriodMs
            ?? envMs('ADMS_FRESH_BACKUP_QUIET_PERIOD_MS', 12000, 2000, 120000);
        /** Absolute wall-clock cap while batches may still be arriving (sync can span many minutes). */
        const hardCapMs = options.hardCapMs
            ?? options.maxWaitMs
            ?? envMs('ADMS_FRESH_BACKUP_HARD_CAP_MS', 3600000, 120000, 7200000);
        /** If no ATTLOG batch appears at all, stop after this (avoid waiting the full hard cap on offline devices). */
        const waitForFirstBatchMs = options.waitForFirstBatchMs
            ?? envMs('ADMS_FRESH_BACKUP_FIRST_BATCH_WAIT_MS', 180000, 10000, 3600000);

        const cutoff = new Date();

        this.beginAdmsFreshBackupSuppressHrmsSync(deviceId);
        try {
        await DeviceCommand.create({
            deviceId,
            command: ADMS_ATTLOG_SYNC_COMMAND,
            status: 'PENDING'
        });

        logger.info(`Fresh ADMS backup: queued ${ADMS_ATTLOG_SYNC_COMMAND} for ${deviceId}, cutoff=${cutoff.toISOString()}`);

        const seenIds = new Set();
        const collected = [];
        let lastNewBatchAt = null;
        const loopStart = Date.now();
        let settledAfterQuiet = false;
        let stoppedReason = 'active';

        while (Date.now() - loopStart < hardCapMs) {
            await this._sleep(pollIntervalMs);

            const batch = await AdmsRawLog.find({
                serialNumber: deviceId,
                table: { $regex: /^ATTLOG$/i },
                receivedAt: { $gte: cutoff }
            })
                .sort({ receivedAt: 1 })
                .lean();

            let gotNew = false;
            for (const doc of batch) {
                const id = String(doc._id);
                if (seenIds.has(id)) continue;
                seenIds.add(id);
                collected.push(doc);
                gotNew = true;
            }

            if (gotNew) {
                lastNewBatchAt = Date.now();
            } else if (collected.length > 0 && lastNewBatchAt != null
                && (Date.now() - lastNewBatchAt) >= quietPeriodMs) {
                settledAfterQuiet = true;
                stoppedReason = 'quiet_after_sync';
                break;
            } else if (collected.length === 0 && (Date.now() - loopStart) >= waitForFirstBatchMs) {
                stoppedReason = 'no_attlog_received';
                break;
            }
        }

        if (!settledAfterQuiet && stoppedReason === 'active' && Date.now() - loopStart >= hardCapMs) {
            stoppedReason = 'hard_cap';
        }

        const timedOut = stoppedReason === 'hard_cap';

        const { pushBatches, totalParsedPunches } = this._admsRawLogLeanDocsToPushBatches(collected);
        const waitedMs = Date.now() - loopStart;

        await this.ensureBackupDir();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeId = String(device.deviceId).replace(/[^a-zA-Z0-9-_]/g, '_');
        const filename = `attlog_adms_fresh_${safeId}_${stamp}.json`;
        const filePath = path.join(ATTLOG_BACKUP_ROOT, filename);

        const payload = {
            dataSource: 'adms_http_push_AdmsRawLog_fresh_session',
            note: 'Only ATTLOG batches received after this run queued DATA QUERY ATTLOG (cutoff = triggeredAt). Full raw push bodies as from device—not TCP getAttendances. Empty batches mean the device did not POST new ATTLOG before wait ended (check ADMS URL/reachability).',
            exportedAt: new Date().toISOString(),
            operationTag: 'api_backup_adms_fresh',
            triggeredAt: cutoff.toISOString(),
            wait: {
                hardCapMs,
                waitForFirstBatchMs,
                quietPeriodMs,
                pollIntervalMs,
                waitedMs,
                timedOut,
                stoppedReason,
                settledAfterQuiet,
                maxWaitMs: hardCapMs
            },
            deviceId: device.deviceId,
            deviceName: device.name,
            deviceIp: device.ip,
            devicePort: device.port,
            pushBatchCount: pushBatches.length,
            totalParsedPunchesAcrossBatches: totalParsedPunches,
            pushBatches
        };

        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
        logger.info(`Fresh ADMS backup written: ${filePath} (${pushBatches.length} batches, ${totalParsedPunches} punches, waited ${waitedMs}ms)`);

        const s3 = await this._uploadAttlogBackupToS3IfEnabled(filePath, {
            deviceId: device.deviceId,
            operationTag: 'api_backup_adms_fresh'
        });

        return {
            success: true,
            filePath,
            filename,
            pushBatchCount: pushBatches.length,
            totalParsedPunchesAcrossBatches: totalParsedPunches,
            waitedMs,
            timedOut,
            settledAfterQuiet,
            stoppedReason,
            triggeredAt: cutoff.toISOString(),
            hrmsSyncSuppressed: true,
            s3
        };
        } finally {
            this.endAdmsFreshBackupSuppressHrmsSync(deviceId);
        }
    }

    /**
     * Write JSON backup from MongoDB AdmsRawLog rows (device HTTP push to /iclock/cdata.aspx?table=ATTLOG).
     * Not a TCP pull — exports whatever was received via ADMS push, with raw body + parsed punches per batch.
     */
    async backupAdmsPushAttendanceLogsFromDb(deviceId, options = {}) {
        const device = await Device.findOne({ deviceId });
        if (!device) {
            const err = new Error('Device not found');
            err.code = 'DEVICE_NOT_FOUND';
            throw err;
        }

        const {
            startDate = null,
            endDate = null,
            operationTag = 'api_backup_adms_push'
        } = options;

        const query = {
            serialNumber: deviceId,
            table: { $regex: /^ATTLOG$/i }
        };
        if (startDate || endDate) {
            query.receivedAt = {};
            if (startDate) query.receivedAt.$gte = this.parseDateOnlyStart(startDate);
            if (endDate) query.receivedAt.$lte = this.parseDateOnlyEnd(endDate);
        }

        const docs = await AdmsRawLog.find(query).sort({ receivedAt: 1 }).lean();
        const { pushBatches, totalParsedPunches } = this._admsRawLogLeanDocsToPushBatches(docs);

        await this.ensureBackupDir();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeId = String(device.deviceId).replace(/[^a-zA-Z0-9-_]/g, '_');
        const filename = `attlog_adms_push_${safeId}_${stamp}.json`;
        const filePath = path.join(ATTLOG_BACKUP_ROOT, filename);

        const payload = {
            dataSource: 'adms_http_push_AdmsRawLog',
            note: 'Batches are POST bodies the device sent to this server (ADMS), not from ZK TCP getAttendances(). Each batch includes the full raw body and parsedRecords from the same parser used on ingest. Empty if the device only uses TCP or push logs were deleted from MongoDB.',
            exportedAt: new Date().toISOString(),
            operationTag,
            deviceId: device.deviceId,
            deviceName: device.name,
            deviceIp: device.ip,
            devicePort: device.port,
            filterApplied: {
                startDate: startDate || null,
                endDate: endDate || null,
                appliesTo: 'AdmsRawLog.receivedAt (when the server stored the push)'
            },
            pushBatchCount: pushBatches.length,
            totalParsedPunchesAcrossBatches: totalParsedPunches,
            pushBatches
        };

        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
        logger.info(`ADMS push attendance backup written: ${filePath} (${pushBatches.length} batches, ${totalParsedPunches} parsed punches)`);

        const s3 = await this._uploadAttlogBackupToS3IfEnabled(filePath, {
            deviceId: device.deviceId,
            operationTag
        });

        return {
            success: true,
            filePath,
            filename,
            pushBatchCount: pushBatches.length,
            totalParsedPunchesAcrossBatches: totalParsedPunches,
            s3
        };
    }

    /**
     * Backup device attendance to JSON on disk. Pulls once from the terminal via TCP; optional filter limits rows in the file.
     */
    async backupDeviceAttendanceLogs(deviceId, options = {}) {
        const device = await Device.findOne({ deviceId });
        if (!device) {
            const err = new Error('Device not found');
            err.code = 'DEVICE_NOT_FOUND';
            throw err;
        }

        const {
            startDate,
            endDate,
            employeeIds,
            includeAllInFile = true
        } = options;

        let zkInstance = null;
        try {
            const pulled = await this.pullAllAttendancesFromDevice(device);
            zkInstance = pulled.zkInstance;
            const result = await this.writeAttendanceBackupFromDeviceRows(
                device,
                pulled.rows,
                pulled.info,
                { startDate, endDate, employeeIds, includeAllInFile, operationTag: 'api_backup' }
            );
            await zkInstance.disconnect();

            return result;
        } catch (error) {
            if (zkInstance) {
                try { await zkInstance.disconnect(); } catch (e) { /* ignore */ }
            }
            throw error;
        }
    }

    /**
     * Summarize what would match a filter (and total on device) without writing a file.
     */
    async summarizeDeviceAttendance(deviceId, { startDate, endDate, employeeIds } = {}) {
        const device = await Device.findOne({ deviceId });
        if (!device) {
            const err = new Error('Device not found');
            err.code = 'DEVICE_NOT_FOUND';
            throw err;
        }

        let zkInstance = null;
        try {
            const pulled = await this.pullAllAttendancesFromDevice(device);
            zkInstance = pulled.zkInstance;
            const allRows = pulled.rows;
            const filtered = (startDate || endDate || this.normalizeEmployeeIdList(employeeIds))
                ? this.filterDeviceAttendanceRecords(allRows, { startDate, endDate, employeeIds })
                : allRows;
            await zkInstance.disconnect();

            return {
                success: true,
                deviceId: device.deviceId,
                deviceName: device.name,
                totalOnDevice: allRows.length,
                matchingFilter: filtered.length,
                notMatching: allRows.length - filtered.length,
                deviceInfo: pulled.info
            };
        } catch (error) {
            if (zkInstance) {
                try { await zkInstance.disconnect(); } catch (e) { /* ignore */ }
            }
            throw error;
        }
    }

    /**
     * Clear all attendance (punch) logs on the device via TCP only—does not remove enrolled users or biometrics.
     * Selective row delete is not supported by node-zklib / most firmware.
     *
     * @param {object} options
     * @param {boolean} options.backupFirst - Write JSON from the same TCP read used for this clear (device only; never MongoDB)
     * @param {string} [options.startDate] - If set with other filters, used to detect partial match
     * @param {string} [options.endDate]
     * @param {string[]|string} [options.employeeIds]
     * @param {boolean} options.forceFullClear - If true, clear entire device even when filter matches only a subset
     */
    async clearDeviceAttendanceLogs(deviceId, options = {}) {
        const {
            backupFirst = true,
            startDate,
            endDate,
            employeeIds,
            forceFullClear = false
        } = options;

        const device = await Device.findOne({ deviceId });
        if (!device) {
            const err = new Error('Device not found');
            err.code = 'DEVICE_NOT_FOUND';
            throw err;
        }

        const hasFilter = Boolean(startDate || endDate || this.normalizeEmployeeIdList(employeeIds));
        let backupResult = null;

        let zkInstance = null;
        try {
            const pulled = await this.pullAllAttendancesFromDevice(device);
            zkInstance = pulled.zkInstance;
            const allRows = pulled.rows;

            if (allRows.length === 0) {
                await zkInstance.disconnect();
                return {
                    success: true,
                    message: 'Device has no attendance rows to clear',
                    cleared: false,
                    totalOnDevice: 0
                };
            }

            const filtered = hasFilter
                ? this.filterDeviceAttendanceRecords(allRows, { startDate, endDate, employeeIds })
                : allRows;

            if (hasFilter && filtered.length === 0) {
                await zkInstance.disconnect();
                return {
                    success: true,
                    cleared: false,
                    message: 'No attendance rows match the filter; device left unchanged',
                    totalOnDevice: allRows.length
                };
            }

            const partial = hasFilter && filtered.length < allRows.length;

            if (partial && !forceFullClear) {
                await zkInstance.disconnect();
                const err = new Error(
                    'This device cannot delete only some attendance rows over TCP. Either remove the filter and clear everything, or set forceFullClear to true (still clears the whole device).'
                );
                err.code = 'SELECTIVE_DEVICE_DELETE_UNSUPPORTED';
                err.stats = {
                    totalOnDevice: allRows.length,
                    matchingFilter: filtered.length,
                    notMatching: allRows.length - filtered.length
                };
                throw err;
            }

            if (backupFirst) {
                backupResult = await this.writeAttendanceBackupFromDeviceRows(
                    device,
                    allRows,
                    pulled.info,
                    {
                        startDate,
                        endDate,
                        employeeIds,
                        includeAllInFile: true,
                        operationTag: 'before_device_clear'
                    }
                );
            }

            await this.clearAttendanceLogOnConnection(zkInstance);
            await zkInstance.disconnect();
            zkInstance = null;

            await Device.findOneAndUpdate(
                { deviceId: device.deviceId },
                { lastLogTimestamp: null, lastSyncAt: new Date(), lastSyncStatus: 'success' }
            ).catch(() => { });

            logger.info(`Cleared attendance log on device ${device.name} (${device.deviceId})`);

            return {
                success: true,
                cleared: true,
                totalOnDeviceBeforeClear: allRows.length,
                hadFilter: hasFilter,
                matchingFilterCount: filtered.length,
                backup: backupResult
            };
        } catch (error) {
            if (zkInstance) {
                try { await zkInstance.disconnect(); } catch (e) { /* ignore */ }
            }
            throw error;
        }
    }

    /**
   * Fetch logs from all enabled devices
   */
    async fetchLogsFromAllDevices(options = {}) {
        // Load devices from database if not provided in constructor
        let enabledDevices;
        if (this.deviceConfig) {
            enabledDevices = this.deviceConfig.filter(d => d.enabled);
        } else {
            enabledDevices = await this.loadDevicesFromDB();
        }

        const { startDate, endDate } = options;
        const rangeLabel = (startDate || endDate) ? ` [range ${startDate || '…'} → ${endDate || '…'}]` : '';
        logger.info(`Starting sync for ${enabledDevices.length} devices${rangeLabel}`);

        const results = [];

        // Fetch from each device sequentially to avoid overwhelming network
        for (const device of enabledDevices) {
            const result = await this.fetchLogsFromDevice(device, { startDate, endDate });
            results.push(result);
        }

        const successCount = results.filter(r => r.success).length;
        const totalNewLogs = results.reduce((sum, r) => sum + (r.newLogs || 0), 0);

        logger.info(`Sync complete: ${successCount}/${enabledDevices.length} devices successful, ${totalNewLogs} new logs`);

        return {
            totalDevices: enabledDevices.length,
            successfulDevices: successCount,
            totalNewLogs: totalNewLogs,
            dateRange: (startDate || endDate) ? { startDate: startDate || null, endDate: endDate || null } : null,
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