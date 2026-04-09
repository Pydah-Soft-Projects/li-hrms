const OvertimeSettings = require('../model/OvertimeSettings');
const cacheService = require('../../shared/services/cacheService');

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

    if (!settings) {
      settings = {
        payPerHour: 0,
        multiplier: 1.5,
        minOTHours: 0,
        roundingMinutes: 15,
        recognitionMode: 'none',
        thresholdHours: null,
        roundUpIfFractionMinutesGte: null,
        otHourRanges: [],
        autoCreateOtRequest: false,
        defaultWorkingHoursPerDay: 8,
        workflow: {
          isEnabled: false,
          steps: [],
          finalAuthority: { role: 'manager', anyHRCanApprove: false },
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
    const body = req.body || {};
    let settings = await OvertimeSettings.getActiveSettings();

    if (!settings) {
      settings = new OvertimeSettings({
        createdBy: req.user._id,
      });
    }

    const assignIfDefined = (key) => {
      if (body[key] !== undefined) settings[key] = body[key];
    };

    [
      'payPerHour',
      'multiplier',
      'minOTHours',
      'roundingMinutes',
      'workflow',
      'recognitionMode',
      'thresholdHours',
      'roundUpIfFractionMinutesGte',
      'otHourRanges',
      'autoCreateOtRequest',
      'defaultWorkingHoursPerDay',
    ].forEach(assignIfDefined);

    settings.updatedBy = req.user._id;
    settings.isActive = true;

    await settings.save();

    try {
      await cacheService.delByPattern('settings:ot:v3:*');
      await cacheService.delByPattern('settings:ot:second-salary:*');
    } catch (e) {
      /* non-fatal */
    }

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
