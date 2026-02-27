const PayrollConfiguration = require('../model/PayrollConfiguration');

exports.getPayrollConfig = async (req, res) => {
  try {
    const config = await PayrollConfiguration.get();
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('getPayrollConfig error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to get payroll config' });
  }
};

exports.upsertPayrollConfig = async (req, res) => {
  try {
    const { enabled, steps, outputColumns } = req.body || {};
    const normalizedOutputColumns = Array.isArray(outputColumns)
      ? outputColumns.map((c, i) => {
          const header = (c.header != null && String(c.header).trim()) ? String(c.header).trim() : `Column ${i + 1}`;
          const source = c.source === 'formula' ? 'formula' : 'field';
          return {
            header,
            source,
            field: source === 'formula' ? '' : (c.field || ''),
            formula: source === 'formula' ? (c.formula || '') : (c.formula || ''),
            order: typeof c.order === 'number' ? c.order : i,
          };
        })
      : [];
    const config = await PayrollConfiguration.upsert({
      enabled: !!enabled,
      steps: Array.isArray(steps) ? steps : [],
      outputColumns: normalizedOutputColumns,
    });
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    console.error('upsertPayrollConfig error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to save payroll config' });
  }
};
