const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const DeviceCommand = require('../models/DeviceCommand');
const logger = require('../utils/logger');
const { normalizeOperationGroup } = require('../utils/operationModeResolver');

/** Same command the dashboard sends for “Sync All Attendance” — device uploads ATTLOG via ADMS push after next heartbeat(s). */
const ADMS_ATTLOG_FULL_SYNC_COMMAND = 'DATA QUERY ATTLOG';

/** Max age of lastSeenAt (ms) to treat device as "live" in dashboard. Override with DEVICE_HEARTBEAT_STALE_MS. */
const HEARTBEAT_STALE_MS = parseInt(process.env.DEVICE_HEARTBEAT_STALE_MS, 10) || 180000;

/**
 * GET /api/devices
 * Get all devices
 */
router.get('/', async (req, res) => {
    try {
        const devices = await Device.find().sort({ createdAt: -1 }).lean();
        const now = Date.now();
        const data = devices.map((d) => ({
            ...d,
            isOnline: Boolean(d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() <= HEARTBEAT_STALE_MS),
        }));

        res.json({
            success: true,
            count: data.length,
            heartbeatStaleMs: HEARTBEAT_STALE_MS,
            data
        });
    } catch (error) {
        logger.error('Error fetching devices:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/devices/:deviceId/attendance/summary
 * Count rows on device and how many match optional date / employee filter (TCP pull).
 */
router.get('/:deviceId/attendance/summary', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { startDate, endDate, employeeIds } = req.query;
        const deviceService = req.app.get('deviceService');
        if (!deviceService) {
            return res.status(500).json({ success: false, error: 'Device service not initialized' });
        }
        let employeeIdsParsed = employeeIds;
        if (typeof employeeIds === 'string' && employeeIds.trim()) {
            try {
                employeeIdsParsed = JSON.parse(employeeIds);
            } catch {
                employeeIdsParsed = employeeIds;
            }
        }
        const summary = await deviceService.summarizeDeviceAttendance(deviceId, {
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            employeeIds: employeeIdsParsed || undefined
        });
        res.json({ success: true, data: summary });
    } catch (error) {
        if (error.code === 'DEVICE_NOT_FOUND') {
            return res.status(404).json({ success: false, error: error.message });
        }
        logger.error('Attendance summary failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/devices/:deviceId/attendance/backup
 * Pull attendance from device via TCP; write JSON under data/device-attlog-backups (optional filter for rows in file).
 * Body: { startDate?, endDate?, employeeIds?, includeAllInFile?: boolean } — includeAllInFile false writes only matching rows.
 */
router.post('/:deviceId/attendance/backup', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { startDate, endDate, employeeIds, includeAllInFile } = req.body || {};
        const deviceService = req.app.get('deviceService');
        if (!deviceService) {
            return res.status(500).json({ success: false, error: 'Device service not initialized' });
        }
        const result = await deviceService.backupDeviceAttendanceLogs(deviceId, {
            startDate,
            endDate,
            employeeIds,
            includeAllInFile: includeAllInFile !== false
        });
        res.json({ success: true, data: result });
    } catch (error) {
        if (error.code === 'DEVICE_NOT_FOUND') {
            return res.status(404).json({ success: false, error: error.message });
        }
        logger.error('Attendance backup failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/devices/:deviceId/attendance/backup-adms-push
 * Export ATTLOG batches from MongoDB (AdmsRawLog) — data as received via device ADMS HTTP push, not TCP pull.
 * Body (optional): { startDate?, endDate? } — filters AdmsRawLog.receivedAt (YYYY-MM-DD).
 */
router.post('/:deviceId/attendance/backup-adms-push', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { startDate, endDate } = req.body || {};
        const deviceService = req.app.get('deviceService');
        if (!deviceService) {
            return res.status(500).json({ success: false, error: 'Device service not initialized' });
        }
        const result = await deviceService.backupAdmsPushAttendanceLogsFromDb(deviceId, {
            startDate: startDate || undefined,
            endDate: endDate || undefined
        });
        res.json({ success: true, data: result });
    } catch (error) {
        if (error.code === 'DEVICE_NOT_FOUND') {
            return res.status(404).json({ success: false, error: error.message });
        }
        logger.error('ADMS push backup failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/devices/:deviceId/attendance/backup-adms-fresh
 * Queue DATA QUERY ATTLOG, then wait for NEW ATTLOG POSTs (not old Mongo rows) and write JSON from those batches only.
 * Body (optional): { hardCapMs?, maxWaitMs? (alias), quietPeriodMs?, waitForFirstBatchMs?, pollIntervalMs? }
 * Waits until ATTLOG pushes go quiet (quietPeriodMs after last batch), up to hardCapMs (default 1h, env-tunable).
 */
router.post('/:deviceId/attendance/backup-adms-fresh', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const body = req.body || {};
        const apiCap = (() => {
            const raw = process.env.ADMS_FRESH_BACKUP_API_HARD_CAP_MS;
            if (raw == null || String(raw).trim() === '') return 7200000;
            const n = parseInt(String(raw), 10);
            return Number.isFinite(n) ? Math.min(Math.max(n, 60000), 14400000) : 7200000;
        })();
        const hardRaw = body.hardCapMs != null ? parseInt(body.hardCapMs, 10) : body.maxWaitMs != null ? parseInt(body.maxWaitMs, 10) : undefined;
        const quietPeriodMs = body.quietPeriodMs != null ? parseInt(body.quietPeriodMs, 10) : undefined;
        const waitForFirstBatchMs = body.waitForFirstBatchMs != null ? parseInt(body.waitForFirstBatchMs, 10) : undefined;
        const pollIntervalMs = body.pollIntervalMs != null ? parseInt(body.pollIntervalMs, 10) : undefined;
        const deviceService = req.app.get('deviceService');
        if (!deviceService) {
            return res.status(500).json({ success: false, error: 'Device service not initialized' });
        }
        const result = await deviceService.backupFreshAdmsAttlogAfterQueue(deviceId, {
            hardCapMs: Number.isFinite(hardRaw) ? Math.min(Math.max(hardRaw, 60000), apiCap) : undefined,
            quietPeriodMs: Number.isFinite(quietPeriodMs) ? Math.min(Math.max(quietPeriodMs, 2000), 120000) : undefined,
            waitForFirstBatchMs: Number.isFinite(waitForFirstBatchMs)
                ? Math.min(Math.max(waitForFirstBatchMs, 5000), apiCap)
                : undefined,
            pollIntervalMs: Number.isFinite(pollIntervalMs) ? Math.min(Math.max(pollIntervalMs, 500), 30000) : undefined
        });
        res.json({ success: true, data: result });
    } catch (error) {
        if (error.code === 'DEVICE_NOT_FOUND') {
            return res.status(404).json({ success: false, error: error.message });
        }
        logger.error('Fresh ADMS backup failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/devices/:deviceId/attendance/trigger-adms-attlog-sync
 * Queue DATA QUERY ATTLOG for the device (identical to dashboard “Sync All Attendance”).
 * Not TCP and not MongoDB: the terminal pulls the command on getrequest.aspx and posts ATTLOG batches to /iclock/cdata.aspx.
 */
router.post('/:deviceId/attendance/trigger-adms-attlog-sync', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found' });
        }

        const doc = await DeviceCommand.create({
            deviceId,
            command: ADMS_ATTLOG_FULL_SYNC_COMMAND,
            status: 'PENDING'
        });

        logger.info(`Queued ADMS ATTLOG full sync: [${deviceId}] id=${doc._id}`);

        res.json({
            success: true,
            data: {
                commandId: doc._id,
                command: ADMS_ATTLOG_FULL_SYNC_COMMAND,
                status: 'PENDING',
                note: 'Ensure the device reaches this server over ADMS (heartbeats). It will upload logs in one or more ATTLOG POSTs—not instant.'
            }
        });
    } catch (error) {
        logger.error('trigger-adms-attlog-sync failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/devices/:deviceId/attendance/sync
 * TCP pull from this device and insert into MongoDB (AttendanceLog).
 * Body (optional): { startDate?, endDate? } YYYY-MM-DD — if set, only punches in window are inserted.
 * If omitted, incremental sync for this device.
 */
router.post('/:deviceId/attendance/sync', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const body = req.body || {};
        const startDate = body.startDate && String(body.startDate).trim() ? String(body.startDate).trim() : undefined;
        const endDate = body.endDate && String(body.endDate).trim() ? String(body.endDate).trim() : undefined;

        if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            return res.status(400).json({ success: false, error: 'startDate must be YYYY-MM-DD' });
        }
        if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
            return res.status(400).json({ success: false, error: 'endDate must be YYYY-MM-DD' });
        }
        if (startDate && endDate && startDate > endDate) {
            return res.status(400).json({ success: false, error: 'startDate must be before or equal to endDate' });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found' });
        }
        if (!device.enabled) {
            return res.status(400).json({ success: false, error: 'Device is disabled' });
        }

        const deviceService = req.app.get('deviceService');
        if (!deviceService) {
            return res.status(500).json({ success: false, error: 'Device service not initialized' });
        }

        const devLean = device.toObject ? device.toObject() : device;
        const result = await deviceService.fetchLogsFromDevice(devLean, { startDate, endDate });
        res.json({ success: result.success !== false, data: result });
    } catch (error) {
        logger.error('Attendance sync to DB failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/devices/:deviceId/attendance/clear
 * Clear ALL attendance (punch) logs on the device (ZK TCP)—CMD_CLEAR_ATTLOG only; users and templates are not wiped.
 * Optional filter is only for validation unless forceFullClear is true.
 * Body: { confirmClear: 'CLEAR_ALL_ATTLOG', backupFirst?, startDate?, endDate?, employeeIds?, forceFullClear? }
 */
router.post('/:deviceId/attendance/clear', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const body = req.body || {};
        if (body.confirmClear !== 'CLEAR_ALL_ATTLOG') {
            return res.status(400).json({
                success: false,
                error: 'confirmClear must be exactly CLEAR_ALL_ATTLOG'
            });
        }
        const deviceService = req.app.get('deviceService');
        if (!deviceService) {
            return res.status(500).json({ success: false, error: 'Device service not initialized' });
        }
        const result = await deviceService.clearDeviceAttendanceLogs(deviceId, {
            backupFirst: body.backupFirst !== false,
            startDate: body.startDate,
            endDate: body.endDate,
            employeeIds: body.employeeIds,
            forceFullClear: Boolean(body.forceFullClear)
        });
        res.json({ success: true, data: result });
    } catch (error) {
        if (error.code === 'DEVICE_NOT_FOUND') {
            return res.status(404).json({ success: false, error: error.message });
        }
        if (error.code === 'SELECTIVE_DEVICE_DELETE_UNSUPPORTED') {
            return res.status(409).json({
                success: false,
                code: error.code,
                error: error.message,
                stats: error.stats
            });
        }
        logger.error('Attendance clear failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/devices/:deviceId
 * Get single device by deviceId
 */
router.get('/:deviceId', async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.deviceId });

        if (!device) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        const d = device.toObject ? device.toObject() : device;
        const now = Date.now();
        const enriched = {
            ...d,
            isOnline: Boolean(d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() <= HEARTBEAT_STALE_MS),
        };

        res.json({
            success: true,
            heartbeatStaleMs: HEARTBEAT_STALE_MS,
            data: enriched
        });
    } catch (error) {
        logger.error('Error fetching device:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/devices/test-pull
 * Manually test ZK TCP direct connection using IP and Port
 */
router.post('/test-pull', async (req, res) => {
    try {
        const { ip, port } = req.body;
        if (!ip) {
            return res.status(400).json({ success: false, error: 'IP address is required' });
        }

        const zkPort = port || 4370;
        logger.info(`Testing direct TCP connection to ${ip}:${zkPort}`);

        const ZKLib = require('node-zklib');
        const zkInstance = new ZKLib(ip, zkPort, 5000, 4000); // 5 second timeout

        try {
            await zkInstance.createSocket();
            
            // Try fetching basic info to confirm readability
            const time = await zkInstance.getTime().catch(() => 'Unknown Time');
            
            // Optional: try getting attendances to show pull works
            // Note: If device is completely empty, it might return empty array.
            const attendances = await zkInstance.getAttendances().catch(() => ({ data: [] }));

            await zkInstance.disconnect();

            res.json({
                success: true,
                message: `Successfully connected and pulled data from ${ip}:${zkPort}`,
                data: {
                    deviceTime: time,
                    logCountAvailable: attendances?.data?.length || 0
                }
            });
        } catch (innerError) {
            // Ensure disconnect on fail
            try { await zkInstance.disconnect(); } catch (e) {}
            throw innerError;
        }
    } catch (error) {
        logger.error(`TCP Connection Test Failed for ${req.body.ip}:`, error.message);
        res.status(500).json({
            success: false,
            message: `Connection timed out or refused at ${req.body.ip}`,
            error: error.message
        });
    }
});

/**
 * POST /api/devices
 * Add a new device
 */
router.post('/', async (req, res) => {
    try {
        const { deviceId, name, ip, port, enabled, location, operationGroup } = req.body;
        const normalizedOperationGroup = normalizeOperationGroup(operationGroup);

        // Validation
        if (!deviceId || !name || !ip) {
            return res.status(400).json({
                success: false,
                error: 'deviceId, name, and ip are required'
            });
        }
        if (operationGroup !== undefined && operationGroup !== null && String(operationGroup).trim() !== '' && !normalizedOperationGroup) {
            return res.status(400).json({
                success: false,
                error: 'Invalid operationGroup. Allowed: CHECK-IN, CHECK-OUT, BREAK-IN, BREAK-OUT, OVERTIME-IN, OVERTIME-OUT'
            });
        }

        // Check if device already exists
        const existingDevice = await Device.findOne({ deviceId });
        if (existingDevice) {
            return res.status(400).json({
                success: false,
                error: 'Device with this deviceId already exists'
            });
        }

        // Create new device
        const device = new Device({
            deviceId,
            name,
            ip,
            port: port || 4370,
            enabled: enabled !== undefined ? enabled : true,
            location: location || '',
            operationGroup: normalizedOperationGroup
        });

        await device.save();

        logger.info(`New device added: ${deviceId} - ${name} (${ip})`);

        res.status(201).json({
            success: true,
            message: 'Device added successfully',
            data: device
        });

    } catch (error) {
        logger.error('Error adding device:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/devices/:deviceId
 * Update an existing device
 */
router.put('/:deviceId', async (req, res) => {
    try {
        const { name, ip, port, enabled, location, operationGroup } = req.body;
        const normalizedOperationGroup = normalizeOperationGroup(operationGroup);

        const device = await Device.findOne({ deviceId: req.params.deviceId });

        if (!device) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        // Update fields
        if (name !== undefined) device.name = name;
        if (ip !== undefined) device.ip = ip;
        if (port !== undefined) device.port = port;
        if (enabled !== undefined) device.enabled = enabled;
        if (location !== undefined) device.location = location;
        if (operationGroup !== undefined) {
            if (operationGroup !== null && String(operationGroup).trim() !== '' && !normalizedOperationGroup) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid operationGroup. Allowed: CHECK-IN, CHECK-OUT, BREAK-IN, BREAK-OUT, OVERTIME-IN, OVERTIME-OUT'
                });
            }
            device.operationGroup = normalizedOperationGroup;
        }

        await device.save();

        logger.info(`Device updated: ${device.deviceId}`);

        res.json({
            success: true,
            message: 'Device updated successfully',
            data: device
        });

    } catch (error) {
        logger.error('Error updating device:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/devices/:deviceId
 * Delete a device
 */
router.delete('/:deviceId', async (req, res) => {
    try {
        const device = await Device.findOneAndDelete({ deviceId: req.params.deviceId });

        if (!device) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        logger.info(`Device deleted: ${device.deviceId}`);

        res.json({
            success: true,
            message: 'Device deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting device:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PATCH /api/devices/:deviceId/toggle
 * Toggle device enabled status
 */
router.patch('/:deviceId/toggle', async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.deviceId });

        if (!device) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        device.enabled = !device.enabled;
        await device.save();

        logger.info(`Device ${device.enabled ? 'enabled' : 'disabled'}: ${device.deviceId}`);

        res.json({
            success: true,
            message: `Device ${device.enabled ? 'enabled' : 'disabled'}`,
            data: device
        });

    } catch (error) {
        logger.error('Error toggling device:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
