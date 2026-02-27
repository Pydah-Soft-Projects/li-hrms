const mongoose = require('mongoose');

/**
 * Payroll Configuration (single document for the application).
 * We use only outputColumns for the paysheet; config.steps are not used to control payroll calculation.
 * - outputColumns: paysheet columns. source=field → value from service/controller (getValueByPath(payslip, field)).
 *   source=formula → value from before columns (earlier in list) + context from payslip.
 */
/** Per-step component: links to dynamic allowance/deduction master + optional formula override */
const stepComponentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  /** Reference to AllowanceDeductionMaster when component is a dynamic allowance/deduction */
  masterId: { type: mongoose.Schema.Types.ObjectId, ref: 'AllowanceDeductionMaster', default: null },
  name: { type: String, default: '' },
  type: { type: String, enum: ['fixed', 'percentage', 'formula'], default: 'fixed' },
  amount: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  base: { type: String, enum: ['basic', 'gross'], default: 'basic' },
  /** Optional formula override for this component (overrides master rule when set) */
  formula: { type: String, default: '' },
  order: { type: Number, default: 0 },
}, { _id: false });

const stepSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, required: true },
  label: { type: String, default: '' },
  order: { type: Number, default: 0 },
  enabled: { type: Boolean, default: true },
  /** Optional formula for this step (e.g. basic pay = perDayBasicPay * paidDays) */
  formula: { type: String, default: '' },
  /** Components (allowances in allowances step, deductions in other_deductions step) */
  components: { type: [stepComponentSchema], default: [] },
  config: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const outputColumnSchema = new mongoose.Schema({
  header: { type: String, required: true, default: 'Column' },
  source: { type: String, enum: ['field', 'formula'], default: 'field' },
  field: { type: String, default: '' },
  formula: { type: String, default: '' },
  order: { type: Number, default: 0 },
}, { _id: false });

const payrollConfigurationSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  steps: { type: [stepSchema], default: [] },
  outputColumns: { type: [outputColumnSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

payrollConfigurationSchema.statics.get = async function () {
  let doc = await this.findOne({});
  if (!doc) {
    doc = await this.create({ enabled: false, steps: [], outputColumns: [] });
  }
  return doc;
};

payrollConfigurationSchema.statics.upsert = async function (payload) {
  let doc = await this.findOne({});
  if (!doc) {
    doc = new this({ enabled: false, steps: [], outputColumns: [] });
  }
  if (payload.enabled !== undefined) doc.enabled = payload.enabled;
  if (Array.isArray(payload.steps)) {
    doc.steps = payload.steps.map((s, i) => {
      const order = s.order ?? i;
      const components = Array.isArray(s.components)
        ? s.components.map((c, j) => ({
            id: c.id || `comp_${j}`,
            masterId: c.masterId ? (mongoose.Types.ObjectId.isValid(c.masterId) ? new mongoose.Types.ObjectId(c.masterId) : null) : null,
            name: c.name != null ? String(c.name) : '',
            type: ['fixed', 'percentage', 'formula'].includes(c.type) ? c.type : 'fixed',
            amount: typeof c.amount === 'number' ? c.amount : 0,
            percentage: typeof c.percentage === 'number' ? c.percentage : 0,
            base: c.base === 'gross' ? 'gross' : 'basic',
            formula: c.formula != null ? String(c.formula) : '',
            order: typeof c.order === 'number' ? c.order : j,
          }))
        : [];
      return { ...s, order, components, formula: s.formula != null ? String(s.formula) : (s.formula || '') };
    });
  }
  if (Array.isArray(payload.outputColumns)) {
    doc.outputColumns = payload.outputColumns.map((c, i) => {
      const header = (c.header != null && String(c.header).trim()) ? String(c.header).trim() : `Column ${i + 1}`;
      const order = c.order ?? i;
      const source = c.source === 'formula' ? 'formula' : 'field';
      const field = source === 'formula' ? '' : (c.field || '');
      return { ...c, header, order, source, field };
    });
  }
  doc.updatedAt = new Date();
  await doc.save();
  return doc;
};

module.exports = mongoose.models.PayrollConfiguration || mongoose.model('PayrollConfiguration', payrollConfigurationSchema);
