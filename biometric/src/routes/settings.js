const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const {
    getEffectiveSettings,
    updateSettings,
    getEnvReadOnly,
    UPDATABLE_FIELDS
} = require('../services/biometricSettingsService');

/**
 * GET /api/settings
 * Effective operational settings (database overrides env).
 */
router.get('/', async (req, res) => {
    try {
        const effective = await getEffectiveSettings(true);
        res.json({
            success: true,
            data: {
                ...effective.values,
                sources: effective.sources,
                updatedAt: effective.updatedAt
            },
            env: getEnvReadOnly(),
            updatableFields: UPDATABLE_FIELDS
        });
    } catch (error) {
        logger.error('Error fetching settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/settings
 * Partial update — any subset of updatable fields.
 */
router.put('/', async (req, res) => {
    try {
        const body = req.body || {};
        const effective = await updateSettings(body);

        const syncScheduler = req.app.get('syncScheduler');
        if (body.syncIntervalMinutes !== undefined && syncScheduler?.reschedule) {
            syncScheduler.reschedule(effective.values.syncIntervalMinutes);
        }

        res.json({
            success: true,
            message: 'Settings saved',
            data: {
                ...effective.values,
                sources: effective.sources,
                updatedAt: effective.updatedAt
            }
        });
    } catch (error) {
        logger.error('Error updating settings:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
