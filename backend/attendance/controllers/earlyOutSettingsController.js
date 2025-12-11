const EarlyOutSettings = require('../model/EarlyOutSettings');

/**
 * Early-Out Settings Controller
 * Manages independent early-out deduction rules
 */

// @desc    Get early-out settings
// @route   GET /api/attendance/settings/early-out
// @access  Private
exports.getSettings = async (req, res) => {
  try {
    let settings = await EarlyOutSettings.getActiveSettings();

    // If no settings exist, return defaults
    if (!settings) {
      settings = {
        isEnabled: false,
        allowedDurationMinutes: 0,
        minimumDuration: 0,
        deductionRanges: [],
        isDefault: true,
      };
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching early-out settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch settings',
    });
  }
};

// @desc    Save early-out settings
// @route   POST /api/attendance/settings/early-out
// @route   PUT /api/attendance/settings/early-out
// @access  Private (Super Admin, Sub Admin)
exports.saveSettings = async (req, res) => {
  try {
    const { isEnabled, allowedDurationMinutes, minimumDuration, deductionRanges } = req.body;

    // Find existing settings or create new
    let settings = await EarlyOutSettings.getActiveSettings();

    if (!settings) {
      settings = new EarlyOutSettings({
        createdBy: req.user._id,
      });
    }

    // Update settings
    if (isEnabled !== undefined) {
      settings.isEnabled = isEnabled;
    }
    if (allowedDurationMinutes !== undefined) {
      settings.allowedDurationMinutes = allowedDurationMinutes;
    }
    if (minimumDuration !== undefined) {
      settings.minimumDuration = minimumDuration;
    }
    if (deductionRanges !== undefined) {
      // Validate ranges
      settings.deductionRanges = deductionRanges;
      const validation = settings.validateRanges();
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error || 'Invalid deduction ranges',
        });
      }
    }

    settings.updatedBy = req.user._id;
    settings.isActive = true;
    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Early-out settings saved successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error saving early-out settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save settings',
    });
  }
};

// @desc    Add deduction range
// @route   POST /api/attendance/settings/early-out/ranges
// @access  Private (Super Admin, Sub Admin)
exports.addRange = async (req, res) => {
  try {
    const { minMinutes, maxMinutes, deductionType, deductionAmount, description } = req.body;

    if (!minMinutes || !maxMinutes || !deductionType) {
      return res.status(400).json({
        success: false,
        error: 'minMinutes, maxMinutes, and deductionType are required',
      });
    }

    if (maxMinutes <= minMinutes) {
      return res.status(400).json({
        success: false,
        error: 'maxMinutes must be greater than minMinutes',
      });
    }

    if (deductionType === 'custom_amount' && (!deductionAmount || deductionAmount <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'deductionAmount is required when deductionType is custom_amount',
      });
    }

    let settings = await EarlyOutSettings.getActiveSettings();
    if (!settings) {
      settings = new EarlyOutSettings({
        createdBy: req.user._id,
        isEnabled: false,
      });
    }

    // Add new range
    settings.deductionRanges.push({
      minMinutes,
      maxMinutes,
      deductionType,
      deductionAmount: deductionType === 'custom_amount' ? deductionAmount : null,
      description: description || '',
    });

    // Validate ranges
    const validation = settings.validateRanges();
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error || 'Invalid deduction ranges',
      });
    }

    settings.updatedBy = req.user._id;
    settings.isActive = true;
    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Deduction range added successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error adding deduction range:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add range',
    });
  }
};

// @desc    Update deduction range
// @route   PUT /api/attendance/settings/early-out/ranges/:rangeId
// @access  Private (Super Admin, Sub Admin)
exports.updateRange = async (req, res) => {
  try {
    const { rangeId } = req.params;
    const { minMinutes, maxMinutes, deductionType, deductionAmount, description } = req.body;

    const settings = await EarlyOutSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: 'Early-out settings not found',
      });
    }

    const range = settings.deductionRanges.id(rangeId);
    if (!range) {
      return res.status(404).json({
        success: false,
        error: 'Deduction range not found',
      });
    }

    // Update range
    if (minMinutes !== undefined) range.minMinutes = minMinutes;
    if (maxMinutes !== undefined) range.maxMinutes = maxMinutes;
    if (deductionType !== undefined) range.deductionType = deductionType;
    if (deductionAmount !== undefined) {
      range.deductionAmount = deductionType === 'custom_amount' ? deductionAmount : null;
    }
    if (description !== undefined) range.description = description;

    // Validate ranges
    const validation = settings.validateRanges();
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error || 'Invalid deduction ranges',
      });
    }

    settings.updatedBy = req.user._id;
    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Deduction range updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error updating deduction range:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update range',
    });
  }
};

// @desc    Delete deduction range
// @route   DELETE /api/attendance/settings/early-out/ranges/:rangeId
// @access  Private (Super Admin, Sub Admin)
exports.deleteRange = async (req, res) => {
  try {
    const { rangeId } = req.params;

    const settings = await EarlyOutSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        error: 'Early-out settings not found',
      });
    }

    settings.deductionRanges.id(rangeId).remove();
    settings.updatedBy = req.user._id;
    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Deduction range deleted successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error deleting deduction range:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete range',
    });
  }
};

