const AutoEdgePermissionSettings = require('../model/AutoEdgePermissionSettings');

const DEFAULT_SETTINGS = {
  isEnabled: false,
  applyFor: 'both',
  useSameRulesForBoth: true,
  lateInRules: { shiftDurationRanges: [] },
  earlyOutRules: { shiftDurationRanges: [] },
  isDefault: true,
};

function sanitizeRange(range) {
  const toNumber = (value) => {
    if (value === '' || value === null || value === undefined) return NaN;
    return Number(value);
  };

  return {
    minShiftHours: toNumber(range.minShiftHours),
    maxShiftHours: toNumber(range.maxShiftHours),
    allowedMinutes: toNumber(range.allowedMinutes),
    minimumMinutes: range.minimumMinutes === '' || range.minimumMinutes === null || range.minimumMinutes === undefined
      ? 1
      : toNumber(range.minimumMinutes),
    description: String(range.description || '').trim(),
  };
}

function sanitizeRuleSet(ruleSet) {
  const ranges = Array.isArray(ruleSet?.shiftDurationRanges)
    ? ruleSet.shiftDurationRanges
    : [];
  return {
    shiftDurationRanges: ranges.map(sanitizeRange),
  };
}

function getSourceRuleSet(body, settings) {
  if (body.commonRules) return sanitizeRuleSet(body.commonRules);
  if (body.lateInRules) return sanitizeRuleSet(body.lateInRules);
  if (body.earlyOutRules) return sanitizeRuleSet(body.earlyOutRules);
  return sanitizeRuleSet(settings.lateInRules);
}

function hasRanges(ruleSet) {
  return Array.isArray(ruleSet?.shiftDurationRanges) && ruleSet.shiftDurationRanges.length > 0;
}

function validateEnabledTarget(settings) {
  if (!settings.isEnabled) return { valid: true };

  if (settings.applyFor === 'late_in' && !hasRanges(settings.lateInRules)) {
    return { valid: false, error: 'Late-in auto permission ranges are required when auto mode is enabled' };
  }
  if (settings.applyFor === 'early_out' && !hasRanges(settings.earlyOutRules)) {
    return { valid: false, error: 'Early-out auto permission ranges are required when auto mode is enabled' };
  }
  if (settings.applyFor === 'both') {
    if (!hasRanges(settings.lateInRules)) {
      return { valid: false, error: 'Late-in auto permission ranges are required when auto mode is enabled for both' };
    }
    if (!hasRanges(settings.earlyOutRules)) {
      return { valid: false, error: 'Early-out auto permission ranges are required when auto mode is enabled for both' };
    }
  }

  return { valid: true };
}

exports.getSettings = async (req, res) => {
  try {
    const settings = await AutoEdgePermissionSettings.getActiveSettings();
    res.status(200).json({
      success: true,
      data: settings || DEFAULT_SETTINGS,
    });
  } catch (error) {
    console.error('Error fetching auto edge permission settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch settings',
    });
  }
};

exports.saveSettings = async (req, res) => {
  try {
    const body = req.body || {};

    let settings = await AutoEdgePermissionSettings.getActiveSettings();
    if (!settings) {
      settings = new AutoEdgePermissionSettings({
        createdBy: req.user._id,
      });
    }

    if (body.isEnabled !== undefined) settings.isEnabled = Boolean(body.isEnabled);
    if (body.applyFor !== undefined) {
      if (!['late_in', 'early_out', 'both'].includes(body.applyFor)) {
        return res.status(400).json({
          success: false,
          error: 'applyFor must be late_in, early_out, or both',
        });
      }
      settings.applyFor = body.applyFor;
    }
    if (body.useSameRulesForBoth !== undefined) {
      settings.useSameRulesForBoth = Boolean(body.useSameRulesForBoth);
    }

    if (settings.useSameRulesForBoth) {
      const sourceRuleSet = getSourceRuleSet(body, settings);
      settings.lateInRules = sourceRuleSet;
      settings.earlyOutRules = sourceRuleSet;
    } else {
      if (body.lateInRules !== undefined) {
        settings.lateInRules = sanitizeRuleSet(body.lateInRules);
      }
      if (body.earlyOutRules !== undefined) {
        settings.earlyOutRules = sanitizeRuleSet(body.earlyOutRules);
      }
    }

    const enabledValidation = validateEnabledTarget(settings);
    if (!enabledValidation.valid) {
      return res.status(400).json({
        success: false,
        error: enabledValidation.error || 'Invalid auto permission settings',
      });
    }

    const validation = settings.validateRuleRanges();
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error || 'Invalid auto permission settings',
      });
    }

    settings.updatedBy = req.user._id;
    settings.isActive = true;
    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Auto late-in / early-out permission settings saved successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error saving auto edge permission settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save settings',
    });
  }
};
