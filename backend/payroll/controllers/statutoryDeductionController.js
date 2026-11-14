const StatutoryDeductionConfig = require('../model/StatutoryDeductionConfig');
const { recordSettingAudit } = require('../../settings/services/settingsAuditService');

exports.getStatutoryConfig = async (req, res) => {
  try {
    const config = await StatutoryDeductionConfig.get();
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('getStatutoryConfig error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to get statutory config' });
  }
};

exports.upsertStatutoryConfig = async (req, res) => {
  try {
    const previous = await StatutoryDeductionConfig.get();
    const { esi, pf, professionTax } = req.body || {};
    const config = await StatutoryDeductionConfig.upsert({ esi, pf, professionTax });

    await recordSettingAudit({
      settingKey: 'statutory_deduction_config',
      category: 'payroll',
      action: previous ? 'update' : 'create',
      previousValue: previous ? (previous.toObject ? previous.toObject() : previous) : null,
      newValue: config ? (config.toObject ? config.toObject() : config) : null,
      req,
      description: 'Updated statutory deduction configuration (ESI/PF/PT)',
    });

    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('upsertStatutoryConfig error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to save statutory config' });
  }
};
