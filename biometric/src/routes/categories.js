const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const DeviceCategory = require('../models/DeviceCategory');
const logger = require('../utils/logger');

function slugifyCategoryId(name) {
    const base = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || `category-${Date.now()}`;
}

/**
 * GET /api/categories
 * List categories with device counts.
 */
router.get('/', async (req, res) => {
    try {
        const categories = await DeviceCategory.find().sort({ name: 1 }).lean();
        const deviceCounts = await Device.aggregate([
            { $match: { categoryId: { $ne: null, $exists: true } } },
            { $group: { _id: '$categoryId', count: { $sum: 1 } } }
        ]);
        const countMap = Object.fromEntries(deviceCounts.map((r) => [r._id, r.count]));

        const data = categories.map((c) => ({
            ...c,
            deviceCount: countMap[c.categoryId] || 0
        }));

        res.json({ success: true, count: data.length, data });
    } catch (error) {
        logger.error('Error listing categories:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/categories
 * Body: { name, description?, categoryId?, autoCloneEnabled? }
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, autoCloneEnabled } = req.body;
        let { categoryId } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, error: 'name is required' });
        }

        categoryId = categoryId ? String(categoryId).trim() : slugifyCategoryId(name);
        const existing = await DeviceCategory.findOne({ categoryId });
        if (existing) {
            return res.status(400).json({ success: false, error: 'categoryId already exists' });
        }

        const category = await DeviceCategory.create({
            categoryId,
            name: String(name).trim(),
            description: description || '',
            autoCloneEnabled: autoCloneEnabled !== false
        });

        res.status(201).json({ success: true, data: category });
    } catch (error) {
        logger.error('Error creating category:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/categories/:categoryId
 */
router.put('/:categoryId', async (req, res) => {
    try {
        const category = await DeviceCategory.findOne({ categoryId: req.params.categoryId });
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        const { name, description, autoCloneEnabled } = req.body;
        if (name !== undefined) category.name = String(name).trim();
        if (description !== undefined) category.description = description;
        if (autoCloneEnabled !== undefined) category.autoCloneEnabled = Boolean(autoCloneEnabled);

        await category.save();
        res.json({ success: true, data: category });
    } catch (error) {
        logger.error('Error updating category:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/categories/:categoryId
 * Unassigns devices from this category (does not delete devices).
 */
router.delete('/:categoryId', async (req, res) => {
    try {
        const category = await DeviceCategory.findOneAndDelete({ categoryId: req.params.categoryId });
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        await Device.updateMany(
            { categoryId: req.params.categoryId },
            { $set: { categoryId: null } }
        );

        res.json({ success: true, message: 'Category deleted; devices unassigned' });
    } catch (error) {
        logger.error('Error deleting category:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PATCH /api/categories/:categoryId/devices
 * Body: { deviceIds: string[] } — assign these devices to the category (replaces membership for listed devices only).
 */
router.patch('/:categoryId/devices', async (req, res) => {
    try {
        const category = await DeviceCategory.findOne({ categoryId: req.params.categoryId });
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        const deviceIds = Array.isArray(req.body.deviceIds)
            ? req.body.deviceIds.map(String)
            : [];

        await Device.updateMany(
            { categoryId: req.params.categoryId },
            { $set: { categoryId: null } }
        );

        if (deviceIds.length > 0) {
            await Device.updateMany(
                { deviceId: { $in: deviceIds } },
                { $set: { categoryId: req.params.categoryId } }
            );
        }

        const assigned = await Device.find({ categoryId: req.params.categoryId }).select('deviceId name').lean();
        res.json({
            success: true,
            categoryId: req.params.categoryId,
            deviceCount: assigned.length,
            devices: assigned
        });
    } catch (error) {
        logger.error('Error assigning devices to category:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
