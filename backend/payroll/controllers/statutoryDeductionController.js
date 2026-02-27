const StatutoryDeductionConfig = require('../model/StatutoryDeductionConfig');

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
    const { esi, pf, professionTax } = req.body || {};
    const config = await StatutoryDeductionConfig.upsert({ esi, pf, professionTax });
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('upsertStatutoryConfig error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to save statutory config' });
  }
};
