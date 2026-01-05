const OvertimeSettings = require('../model/OvertimeSettings');

/**
 * Overtime Settings Controller
 * Manages OT settings and workflow configuration
 */

// @desc    Get OT settings
// @route   GET /api/overtime/settings
// @access  Private
exports.getSettings = async (req, res) => {
    try {
        let settings = await OvertimeSettings.getActiveSettings();

        // If no settings exist, return defaults
        if (!settings) {
            settings = {
                payPerHour: 0,
                minOTHours: 0,
                workflow: {
                    isEnabled: false,
                    steps: [],
                    finalAuthority: { role: 'manager', anyHRCanApprove: false }
                },
                isDefault: true,
            };
        }

        res.status(200).json({
            success: true,
            data: settings,
        });
    } catch (error) {
        console.error('Error fetching OT settings:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch settings',
        });
    }
};

// @desc    Save OT settings
// @route   POST /api/overtime/settings
// @access  Private (Super Admin)
exports.saveSettings = async (req, res) => {
    try {
        const { payPerHour, minOTHours, workflow } = req.body;

        // Find existing settings or create new
        let settings = await OvertimeSettings.getActiveSettings();

        if (!settings) {
            settings = new OvertimeSettings({
                createdBy: req.user._id,
            });
        }

        // Update settings
        if (payPerHour !== undefined) settings.payPerHour = payPerHour;
        if (minOTHours !== undefined) settings.minOTHours = minOTHours;
        if (workflow !== undefined) settings.workflow = workflow;

        settings.updatedBy = req.user._id;
        settings.isActive = true;

        await settings.save();

        res.status(200).json({
            success: true,
            message: 'OT settings saved successfully',
            data: settings,
        });
    } catch (error) {
        console.error('Error saving OT settings:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to save settings',
        });
    }
};
