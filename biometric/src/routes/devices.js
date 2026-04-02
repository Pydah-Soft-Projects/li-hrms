const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const logger = require('../utils/logger');

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
        const { deviceId, name, ip, port, enabled, location } = req.body;

        // Validation
        if (!deviceId || !name || !ip) {
            return res.status(400).json({
                success: false,
                error: 'deviceId, name, and ip are required'
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
            location: location || ''
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
        const { name, ip, port, enabled, location } = req.body;

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
