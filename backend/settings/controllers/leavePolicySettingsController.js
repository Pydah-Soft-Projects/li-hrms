/**
 * Leave Policy Settings Controller
 * Manages earned leave rules, carry forward policies, and financial year settings
 */

const LeavePolicySettings = require('../model/LeavePolicySettings');
const { recordSettingAudit } = require('../services/settingsAuditService');

/**
 * @desc    Get current leave policy settings
 * @route   GET /api/settings/leave-policy
 * @access  Private (HR, Admin)
 */
exports.getSettings = async (req, res) => {
    try {
        const settings = await LeavePolicySettings.getSettings();
        
        res.status(200).json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Error fetching leave policy settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching leave policy settings',
            error: error.message
        });
    }
};

/**
 * @desc    Update leave policy settings
 * @route   PUT /api/settings/leave-policy
 * @access  Private (HR, Admin)
 */
exports.updateSettings = async (req, res) => {
    try {
        const previousSettings = await LeavePolicySettings.getSettings();
        const settings = await LeavePolicySettings.updateSettings(req.body);

        await recordSettingAudit({
            settingKey: 'leave_policy_settings',
            category: 'leave_policy',
            action: 'update',
            previousValue: previousSettings ? (previousSettings.toObject ? previousSettings.toObject() : previousSettings) : null,
            newValue: settings ? (settings.toObject ? settings.toObject() : settings) : null,
            req,
            description: 'Updated leave policy settings',
        });

        res.status(200).json({
            success: true,
            message: 'Leave policy settings updated successfully',
            data: settings
        });
    } catch (error) {
        console.error('Error updating leave policy settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating leave policy settings',
            error: error.message
        });
    }
};

/**
 * @desc    Reset settings to defaults
 * @route   POST /api/settings/leave-policy/reset
 * @access  Private (Admin only)
 */
exports.resetSettings = async (req, res) => {
    try {
        const previousSettings = await LeavePolicySettings.getSettings();
        await LeavePolicySettings.deleteMany({});
        const defaultSettings = await LeavePolicySettings.create({});

        await recordSettingAudit({
            settingKey: 'leave_policy_settings',
            category: 'leave_policy',
            action: 'reset',
            previousValue: previousSettings ? (previousSettings.toObject ? previousSettings.toObject() : previousSettings) : null,
            newValue: defaultSettings ? (defaultSettings.toObject ? defaultSettings.toObject() : defaultSettings) : null,
            req,
            description: 'Reset leave policy settings to defaults',
        });

        res.status(200).json({
            success: true,
            message: 'Leave policy settings reset to defaults',
            data: defaultSettings
        });
    } catch (error) {
        console.error('Error resetting leave policy settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting leave policy settings',
            error: error.message
        });
    }
};

/**
 * @desc    Get EL calculation preview for testing
 * @route   POST /api/settings/leave-policy/preview
 * @access  Private (HR, Admin)
 */
exports.previewELCalculation = async (req, res) => {
    try {
        const { employeeId, month, year } = req.body;
        const { calculateEarnedLeave } = require('../../leaves/services/earnedLeaveService');
        
        const calculation = await calculateEarnedLeave(employeeId, month, year);
        
        res.status(200).json({
            success: true,
            data: calculation
        });
    } catch (error) {
        console.error('Error in EL calculation preview:', error);
        res.status(500).json({
            success: false,
            message: 'Error in EL calculation preview',
            error: error.message
        });
    }
};

/**
 * @desc    Initialize leave policy settings (force create)
 * @route   POST /api/settings/leave-policy/init
 * @access  Private (Admin only)
 */
exports.initSettings = async (req, res) => {
    try {
        const previousSettings = await LeavePolicySettings.getSettings();
        // Force create default settings even if they exist
        await LeavePolicySettings.deleteMany({});
        const settings = await LeavePolicySettings.create({});

        await recordSettingAudit({
            settingKey: 'leave_policy_settings',
            category: 'leave_policy',
            action: 'create',
            previousValue: previousSettings ? (previousSettings.toObject ? previousSettings.toObject() : previousSettings) : null,
            newValue: settings ? (settings.toObject ? settings.toObject() : settings) : null,
            req,
            description: 'Initialized leave policy settings (forced defaults)',
        });

        console.log('[LeavePolicySettings] Settings initialized (forced)');
        
        res.status(200).json({
            success: true,
            message: 'Leave policy settings initialized successfully',
            data: settings
        });
    } catch (error) {
        console.error('Error initializing leave policy settings:', error);
        res.status(500).json({
            success: false,
            message: 'Error initializing leave policy settings',
            error: error.message
        });
    }
};
