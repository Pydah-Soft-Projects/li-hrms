const PromotionTransferSettings = require('../model/PromotionTransferSettings');

const defaultWorkflow = () => ({
  isEnabled: true,
  steps: [],
  finalAuthority: { role: 'hr', anyHRCanApprove: true },
  allowHigherAuthorityToApproveLowerLevels: false,
});

exports.getSettings = async (req, res) => {
  try {
    let settings = await PromotionTransferSettings.getActiveSettings();
    let data;
    if (!settings) {
      data = {
        workflow: defaultWorkflow(),
        isActive: true,
        isDefault: true,
      };
    } else {
      const plain = settings.toObject ? settings.toObject() : { ...settings };
      data = {
        workflow: plain.workflow || defaultWorkflow(),
        isActive: plain.isActive !== false,
      };
      if (!data.workflow.finalAuthority) {
        data.workflow.finalAuthority = { role: 'hr', anyHRCanApprove: true };
      }
    }
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error fetching promotion/transfer settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch settings',
    });
  }
};

exports.saveSettings = async (req, res) => {
  try {
    const { workflow } = req.body;
    let settings = await PromotionTransferSettings.getActiveSettings();
    if (!settings) {
      settings = new PromotionTransferSettings({});
    }
    if (workflow) {
      settings.workflow = settings.workflow || {};
      if (workflow.isEnabled !== undefined) settings.workflow.isEnabled = !!workflow.isEnabled;
      if (workflow.steps) settings.workflow.steps = workflow.steps;
      if (workflow.finalAuthority) settings.workflow.finalAuthority = workflow.finalAuthority;
      if (workflow.allowHigherAuthorityToApproveLowerLevels !== undefined) {
        settings.workflow.allowHigherAuthorityToApproveLowerLevels =
          !!workflow.allowHigherAuthorityToApproveLowerLevels;
      }
    }
    settings.updatedBy = req.user?._id;
    settings.isActive = true;
    await settings.save();
    await PromotionTransferSettings.updateMany({ _id: { $ne: settings._id } }, { isActive: false });
    res.status(200).json({
      success: true,
      message: 'Promotion & transfer policy saved',
      data: settings,
    });
  } catch (error) {
    console.error('Error saving promotion/transfer settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save settings',
    });
  }
};
