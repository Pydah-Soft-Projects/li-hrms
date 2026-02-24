const PermissionDeductionSettings = require('../model/PermissionDeductionSettings');

/**
 * Permission Deduction Settings Controller
 * Manages global permission deduction rules
 */

// @desc    Get permission deduction settings
// @route   GET /api/permissions/settings/deduction
// @access  Private
exports.getSettings = async (req, res) => {
  try {
    let settings = await PermissionDeductionSettings.getActiveSettings();

    // If no settings exist, return defaults
    if (!settings) {
      settings = {
        deductionRules: {
          freeAllowedPerMonth: null,
          countThreshold: null,
          deductionType: null,
          deductionDays: null,
          deductionAmount: null,
          minimumDuration: null,
          calculationMode: null,
        },
        isDefault: true,
      };
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching permission deduction settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch settings',
    });
  }
};

// @desc    Save permission deduction settings
// @route   POST /api/permissions/settings/deduction
// @route   PUT /api/permissions/settings/deduction
// @access  Private (Super Admin, Sub Admin)
exports.saveSettings = async (req, res) => {
  try {
    const { deductionRules, workflow } = req.body;

    // Find existing settings or create new
    let settings = await PermissionDeductionSettings.getActiveSettings();

    if (!settings) {
      settings = new PermissionDeductionSettings({
        createdBy: req.user._id,
      });
    }

    // Update workflow configuration
    if (workflow) {
      settings.workflow = workflow;
    }

    // Update deduction rules
    if (deductionRules) {
      if (deductionRules.freeAllowedPerMonth !== undefined) {
        settings.deductionRules.freeAllowedPerMonth = deductionRules.freeAllowedPerMonth;
      }
      if (deductionRules.countThreshold !== undefined) {
        settings.deductionRules.countThreshold = deductionRules.countThreshold;
      }
      if (deductionRules.deductionType !== undefined) {
        settings.deductionRules.deductionType = deductionRules.deductionType;
      }
      if (deductionRules.deductionDays !== undefined) {
        settings.deductionRules.deductionDays = deductionRules.deductionDays;
      }
      if (deductionRules.deductionAmount !== undefined) {
        settings.deductionRules.deductionAmount = deductionRules.deductionAmount;
      }
      if (deductionRules.minimumDuration !== undefined) {
        settings.deductionRules.minimumDuration = deductionRules.minimumDuration;
      }
      if (deductionRules.calculationMode !== undefined) {
        settings.deductionRules.calculationMode = deductionRules.calculationMode;
      }
    }

    settings.updatedBy = req.user._id;
    settings.isActive = true;
    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Permission deduction settings saved successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error saving permission deduction settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save settings',
    });
  }
};

