const Settings = require('../../settings/model/Settings');

const hasGeneralComplaintsAccess = (activeModules) => {
  if (!Array.isArray(activeModules)) return true;
  if (activeModules.length === 0) return false;
  return activeModules.some((permission) =>
    permission === 'GENERAL_COMPLAINTS' ||
    permission === 'GENERAL_COMPLAINTS:read' ||
    permission === 'GENERAL_COMPLAINTS:write'
  );
};

module.exports = async (req, res, next) => {
  try {
    const globalSetting = await Settings.findOne({ key: 'general_complaints_enabled' });
    if (globalSetting?.value === false) {
      return res.status(403).json({
        success: false,
        message: 'General Complaints is disabled system-wide.',
      });
    }

    if (req.user?.role === 'super_admin') return next();

    let activeModules = req.user?.featureControl;
    if (!Array.isArray(activeModules) || activeModules.length === 0) {
      const setting = await Settings.findOne({ key: `feature_control_${req.user?.role}` });
      activeModules = setting?.value?.activeModules;
    }

    if (!hasGeneralComplaintsAccess(activeModules)) {
      return res.status(403).json({
        success: false,
        message: 'General Complaints is disabled for your role.',
      });
    }

    return next();
  } catch (error) {
    console.error('[GeneralComplaints] Failed to verify feature access:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not verify General Complaints access.',
    });
  }
};
