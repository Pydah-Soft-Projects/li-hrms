const SettingsAudit = require('../model/SettingsAudit');

/**
 * Mask sensitive values in settings before writing to audit log
 */
function sanitizeSettingValueForAudit(key, val) {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;

  try {
    const clone = JSON.parse(JSON.stringify(val));
    const mask = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const k of Object.keys(obj)) {
        const lower = k.toLowerCase();
        if (
          lower.includes('secret') ||
          lower.includes('password') ||
          lower.includes('apikey') ||
          lower.includes('privatekey')
        ) {
          if (obj[k]) obj[k] = '********';
        } else if (typeof obj[k] === 'object' && obj[k] !== null) {
          mask(obj[k]);
        }
      }
    };
    mask(clone);
    return clone;
  } catch {
    return val;
  }
}

/**
 * Record an audit log for a setting change
 */
async function recordSettingAudit({
  settingKey,
  category = 'general',
  action = 'update',
  previousValue = null,
  newValue = null,
  user = null,
  req = null,
  description = null,
  details = {},
}) {
  try {
    if (!settingKey) return null;

    const performedBy = user?._id || req?.user?._id || null;
    const performedByName = user?.name || req?.user?.name || 'System';
    const performedByEmail = user?.email || req?.user?.email || null;
    const performedByRole = user?.role || req?.user?.role || 'system';

    let ipAddress = null;
    let userAgent = null;
    if (req) {
      ipAddress =
        req.ip ||
        req.headers?.['x-forwarded-for'] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        null;
      userAgent = req.headers?.['user-agent'] || null;
    }

    const cleanPreviousValue = sanitizeSettingValueForAudit(settingKey, previousValue);
    const cleanNewValue = sanitizeSettingValueForAudit(settingKey, newValue);

    const auditEntry = await SettingsAudit.create({
      settingKey,
      category,
      action,
      previousValue: cleanPreviousValue,
      newValue: cleanNewValue,
      performedBy,
      performedByName,
      performedByEmail,
      performedByRole,
      description: description || `Changed setting ${settingKey}`,
      details: details || {},
      ipAddress,
      userAgent,
      timestamp: new Date(),
    });

    return auditEntry;
  } catch (error) {
    console.error(`[SettingsAudit] Failed to record audit for "${settingKey}":`, error.message);
    // Never fail the parent transaction if audit insert encounters an error
    return null;
  }
}

module.exports = {
  recordSettingAudit,
  sanitizeSettingValueForAudit,
};
