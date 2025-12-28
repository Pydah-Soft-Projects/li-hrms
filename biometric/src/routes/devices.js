const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const logger = require('../utils/logger');

/**
 * GET /api/devices
 * Get all devices
 */
router.get('/', async (req, res) => {
    try {
        const devices = await Device.find().sort({ createdAt: -1 });

        res.json({
            success: true,
            count: devices.length,
            data: devices
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

        res.json({
            success: true,
            data: device
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
