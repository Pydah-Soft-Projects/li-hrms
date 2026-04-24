const PromotionTransferSettings = require('../model/PromotionTransferSettings');
const { sanitizePromotionWorkflowConfigSteps, toPlainWorkflow } = require('../utils/promotionWorkflowUtils');

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
      const wf = plain.workflow || defaultWorkflow();
      const steps = wf.isEnabled === false ? [] : sanitizePromotionWorkflowConfigSteps(wf.steps || []);
      data = {
        workflow: {
          ...wf,
          steps,
          finalAuthority: wf.finalAuthority || { role: 'hr', anyHRCanApprove: true },
        },
        isActive: plain.isActive !== false,
      };
      if (!data.workflow.finalAuthority) {
        data.workflow.finalAuthority = { role: 'hr', anyHRCanApprove: true };
      }
      if (steps.length) {
        data.workflow.finalAuthority = {
          ...data.workflow.finalAuthority,
          role: steps[steps.length - 1].approverRole,
        };
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
      const plainWf = toPlainWorkflow(settings);
      if (settings.workflow.isEnabled === false) {
        settings.workflow.steps = [];
        settings.workflow.finalAuthority = {
          ...(plainWf.finalAuthority || defaultWorkflow().finalAuthority),
          role: 'hr',
        };
      } else if (Array.isArray(workflow.steps)) {
        const steps = sanitizePromotionWorkflowConfigSteps(workflow.steps);
        settings.workflow.steps = steps;
        settings.workflow.finalAuthority = {
          ...(workflow.finalAuthority || plainWf.finalAuthority || defaultWorkflow().finalAuthority),
        };
        if (steps.length) {
          settings.workflow.finalAuthority = {
            ...settings.workflow.finalAuthority,
            role: steps[steps.length - 1].approverRole,
          };
        }
      }
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
