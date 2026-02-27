const mongoose = require('mongoose');

/**
 * Statutory Deduction Configuration (single document)
 * ESI: employee + employer share (employee share deducted from salary)
 * PF (EPF): employee + employer share (employee share deducted from salary)
 * Profession Tax: employee only (no employer share)
 */
const esiSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  /** Employee contribution % (e.g. 0.75) - deducted from salary */
  employeePercent: { type: Number, default: 0.75, min: 0, max: 100 },
  /** Employer contribution % (e.g. 3.25) - company cost, not from salary */
  employerPercent: { type: Number, default: 3.25, min: 0, max: 100 },
  /** % of basic pay used as wage for ESI calculation (e.g. 50 = 50% of basic) */
  wageBasePercentOfBasic: { type: Number, default: 50, min: 0, max: 100 },
  /** Wage ceiling (₹/month) - only when enabled; ESI applicable when (basic * wageBasePercent/100) <= this. 0 = no ceiling. */
  wageCeiling: { type: Number, default: 21000, min: 0 },
}, { _id: false });

const pfSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  /** Employee contribution % on (Basic + DA) (e.g. 12) */
  employeePercent: { type: Number, default: 12, min: 0, max: 100 },
  /** Employer contribution % (e.g. 12) - 3.67% to PF, 8.33% to pension; we store total for reporting */
  employerPercent: { type: Number, default: 12, min: 0, max: 100 },
  /** Wage ceiling - PF mandatory if basic+DA <= this (e.g. 15000); above that optional */
  wageCeiling: { type: Number, default: 15000, min: 0 },
  /** Apply on: 'basic' (basic only) or 'basic_da' (basic + dearness allowance) */
  base: { type: String, enum: ['basic', 'basic_da'], default: 'basic' },
}, { _id: false });

const ptSlabSchema = new mongoose.Schema({
  min: { type: Number, default: 0 },
  max: { type: Number, default: null }, // null = no upper limit (and above)
  amount: { type: Number, default: 0 },
}, { _id: false });

const professionTaxSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  /** State/region name for reference (e.g. Maharashtra, Karnataka) */
  state: { type: String, default: '' },
  /** Slabs: salary range (min–max) → amount. Sorted by min; last slab can have max null for "and above". */
  slabs: [ptSlabSchema],
}, { _id: false });

const statutoryDeductionConfigSchema = new mongoose.Schema({
  esi: { type: esiSchema, default: () => ({}) },
  pf: { type: pfSchema, default: () => ({}) },
  professionTax: { type: professionTaxSchema, default: () => ({}) },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

statutoryDeductionConfigSchema.statics.get = async function () {
  let doc = await this.findOne({});
  if (!doc) {
    doc = await this.create({
      esi: { enabled: false, employeePercent: 0.75, employerPercent: 3.25, wageBasePercentOfBasic: 50, wageCeiling: 21000 },
      pf: { enabled: false, employeePercent: 12, employerPercent: 12, wageCeiling: 15000, base: 'basic' },
      professionTax: {
        enabled: false,
        state: '',
        slabs: [
          { min: 0, max: 14999, amount: 0 },
          { min: 15000, max: 19999, amount: 150 },
          { min: 20000, max: null, amount: 200 },
        ],
      },
    });
  }
  return doc;
};

statutoryDeductionConfigSchema.statics.upsert = async function (payload) {
  let doc = await this.findOne({});
  if (!doc) {
    doc = new this({});
  }
  if (payload.esi && typeof payload.esi === 'object') {
    doc.esi = { ...doc.esi.toObject?.() || doc.esi, ...payload.esi };
  }
  if (payload.pf && typeof payload.pf === 'object') {
    doc.pf = { ...doc.pf.toObject?.() || doc.pf, ...payload.pf };
  }
  if (payload.professionTax && typeof payload.professionTax === 'object') {
    const merged = { ...doc.professionTax.toObject?.() || doc.professionTax, ...payload.professionTax };
    if (Array.isArray(payload.professionTax.slabs)) {
      merged.slabs = payload.professionTax.slabs.map((s) => ({
        min: typeof s.min === 'number' ? s.min : 0,
        max: s.max == null || s.max === undefined || s.max === '' ? null : Number(s.max),
        amount: typeof s.amount === 'number' ? s.amount : 0,
      }));
    }
    doc.professionTax = merged;
  }
  doc.updatedAt = new Date();
  await doc.save();
  return doc;
};

module.exports = mongoose.models.StatutoryDeductionConfig || mongoose.model('StatutoryDeductionConfig', statutoryDeductionConfigSchema);
