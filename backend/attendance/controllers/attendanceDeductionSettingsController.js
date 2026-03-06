const AttendanceDeductionSettings = require('../model/AttendanceDeductionSettings');

/**
 * Attendance Deduction Settings Controller
 * Manages global attendance deduction rules (combined late-in + early-out)
 */

// @desc    Get attendance deduction settings
// @route   GET /api/attendance/settings/deduction
// @access  Private
exports.getSettings = async (req, res) => {
  try {
    let settings = await AttendanceDeductionSettings.getActiveSettings();

    // If no settings exist, return defaults
    if (!settings) {
      settings = {
        deductionRules: {
          freeAllowedPerMonth: null,
          combinedCountThreshold: null,
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
    console.error('Error fetching attendance deduction settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch settings',
    });
  }
};

// @desc    Save attendance deduction settings
// @route   POST /api/attendance/settings/deduction
// @route   PUT /api/attendance/settings/deduction
// @access  Private (Super Admin, Sub Admin)
exports.saveSettings = async (req, res) => {
  try {
    const { deductionRules } = req.body;

    // Find existing settings or create new
    let settings = await AttendanceDeductionSettings.getActiveSettings();

    if (!settings) {
      settings = new AttendanceDeductionSettings({
        createdBy: req.user._id,
      });
    }

    // Update deduction rules
    if (deductionRules) {
      if (deductionRules.freeAllowedPerMonth !== undefined) {
        settings.deductionRules.freeAllowedPerMonth = deductionRules.freeAllowedPerMonth;
      }
      if (deductionRules.combinedCountThreshold !== undefined) {
        settings.deductionRules.combinedCountThreshold = deductionRules.combinedCountThreshold;
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
      message: 'Attendance deduction settings saved successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error saving attendance deduction settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save settings',
    });
  }
};

