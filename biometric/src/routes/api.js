const express = require('express');
const router = express.Router();
const AttendanceLog = require('../models/AttendanceLog');
const logger = require('../utils/logger');

/**
 * GET /api/logs
 * Query attendance logs with filters
 * Query params: employeeId, startDate, endDate, logType, limit
 */
router.get('/logs', async (req, res) => {
    try {
        const { employeeId, startDate, endDate, logType, limit } = req.query;

        // Build query
        const query = {};

        if (employeeId) {
            query.employeeId = employeeId;
        }

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) {
                query.timestamp.$gte = new Date(startDate);
            }
            if (endDate) {
                query.timestamp.$lte = new Date(endDate);
            }
        }

        if (logType) {
            query.logType = logType;
        }

        // Execute query
        const logs = await AttendanceLog
            .find(query)
            .sort({ timestamp: -1 })
            .limit(limit ? parseInt(limit) : 1000)
            .lean();

        logger.info(`API: Retrieved ${logs.length} logs`, { employeeId, startDate, endDate });

        res.json({
            success: true,
            count: logs.length,
            data: logs
        });

    } catch (error) {
        logger.error('Error fetching logs:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/logs/employee/:employeeId
 * Get ALL logs for a specific employee (no date filter)
 */
router.get('/logs/employee/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { limit } = req.query;

        const logs = await AttendanceLog
            .find({ employeeId })
            .sort({ timestamp: -1 })
            .limit(limit ? parseInt(limit) : 10000) // Default high limit for all logs
            .lean();

        logger.info(`API: Retrieved all logs for employee ${employeeId}: ${logs.length} logs`);

        res.json({
            success: true,
            employeeId: employeeId,
            count: logs.length,
            data: logs
        });

    } catch (error) {
        logger.error(`Error fetching logs for employee ${req.params.employeeId}:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/logs/latest
 * Get the most recent sync timestamp
 */
router.get('/logs/latest', async (req, res) => {
    try {
        const latestLog = await AttendanceLog
            .findOne()
            .sort({ syncedAt: -1 })
            .select('syncedAt')
            .lean();

        res.json({
            success: true,
            latestSync: latestLog ? latestLog.syncedAt : null
        });

    } catch (error) {
        logger.error('Error fetching latest sync:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/sync
 * Trigger manual sync from all enabled devices (TCP → MongoDB).
 * Body (optional): { startDate?: 'YYYY-MM-DD', endDate?: 'YYYY-MM-DD' }
 * If either date is set, only punches in that inclusive window are inserted (full device read, filtered).
 * If omitted, incremental sync (only rows newer than device lastLogTimestamp).
 */
router.post('/sync', async (req, res) => {
    try {
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

        logger.info('API: Manual sync triggered', { startDate, endDate });

        const deviceService = req.app.get('deviceService');

        if (!deviceService) {
            return res.status(500).json({
                success: false,
                error: 'Device service not initialized'
            });
        }

        const result = await deviceService.fetchLogsFromAllDevices({ startDate, endDate });

        res.json({
            success: true,
            message: 'Sync completed',
            ...result
        });

    } catch (error) {
        logger.error('Error during manual sync:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/devices/status
 * Check connectivity status of all configured devices
 */
router.get('/devices/status', async (req, res) => {
    try {
        const deviceService = req.app.get('deviceService');

        if (!deviceService) {
            return res.status(500).json({
                success: false,
                error: 'Device service not initialized'
            });
        }

        const statuses = await deviceService.checkDeviceStatus();

        res.json({
            success: true,
            devices: statuses
        });

    } catch (error) {
        logger.error('Error checking device status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/stats
 * Get statistics about stored logs
 */
router.get('/stats', async (req, res) => {
    try {
        const totalLogs = await AttendanceLog.countDocuments();
        const uniqueEmployees = await AttendanceLog.distinct('employeeId');

        const logTypeStats = await AttendanceLog.aggregate([
            {
                $group: {
                    _id: '$logType',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            stats: {
                totalLogs,
                uniqueEmployees: uniqueEmployees.length,
                logTypeBreakdown: logTypeStats
            }
        });

    } catch (error) {
        logger.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/logs/recent
 * Get the latest 25 logs (raw data format)
 */
router.get('/logs/recent', async (req, res) => {
    try {
        const logs = await AttendanceLog
            .find()
            .sort({ timestamp: -1, createdAt: -1 })
            .limit(25)
            .lean();

        // Extract just the raw device data or the whole log if rawData is missing
        const rawLogs = logs.map(log => log.rawData || log);

        res.json({
            success: true,
            count: rawLogs.length,
            data: rawLogs
        });

    } catch (error) {
        logger.error('Error fetching recent logs:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/devices/sync-time
 * Force all enabled devices to sync their clocks to current IST time
 */
router.post('/devices/sync-time', async (req, res) => {
    try {
        const Device = require('../models/Device');
        const DeviceCommand = require('../models/DeviceCommand');
        const dayjs = require('dayjs');
        const utc = require('dayjs/plugin/utc');
        const timezone = require('dayjs/plugin/timezone');
        dayjs.extend(utc);
        dayjs.extend(timezone);

        const devices = await Device.find({ enabled: true });

        // Format current time as YYYY-MM-DD HH:mm:ss in IST
        const nowIST = dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
        const command = `SET_TIME ${nowIST}`;

        const results = [];
        for (const device of devices) {
            await DeviceCommand.create({
                deviceId: device.deviceId,
                command: command,
                status: 'PENDING'
            });
            results.push({ deviceId: device.deviceId, name: device.name });
        }

        logger.info(`Time sync command (${command}) queued for ${results.length} devices`);

        res.json({
            success: true,
            message: `Time sync command queued for ${results.length} devices`,
            command: command,
            devices: results
        });
    } catch (error) {
        logger.error('Error syncing device time:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/devices/:deviceId/raw
 * Fetch raw logs DIRECTLY from device (no DB storage, no transformation)
 */
router.get('/devices/:deviceId/raw', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const deviceService = req.app.get('deviceService');

        if (!deviceService) {
            return res.status(500).json({ success: false, error: 'Device service not initialized' });
        }

        const data = await deviceService.fetchRawLogsDirectly(deviceId);
        res.json(data);

    } catch (error) {
        logger.error(`Direct raw fetch failed for ${req.params.deviceId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

