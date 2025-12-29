const express = require('express');
const router = express.Router();
const DeviceService = require('../services/DeviceService');
const DeviceUser = require('../models/DeviceUser');
const logger = require('../utils/logger');

const deviceService = new DeviceService();

// Trigger Full Sync (Harvest + Distribute)
router.post('/full', async (req, res) => {
    try {
        logger.info('API: Received request for Full User Sync');

        // This process can be long-running. 
        // In a real prod env, we should offload to a job queue.
        // For now, we await it (client might timeout) or return immediately.
        // Let's return immediately and run in background.

        // Background execution
        deviceService.syncAllDevices()
            .then(report => {
                logger.info('Full Sync Completed Successfully');
                logger.info(JSON.stringify(report, null, 2));
            })
            .catch(err => {
                logger.error('Full Sync Failed Background:', err);
            });

        res.json({
            success: true,
            message: 'Sync process started in background. Check logs for progress.',
            timestamp: new Date()
        });

    } catch (error) {
        logger.error('Sync request failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Golden Record Users
router.get('/users', async (req, res) => {
    try {
        const users = await DeviceUser.find({}).sort({ userId: 1 });
        res.json({
            success: true,
            count: users.length,
            users: users
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
