const mongoose = require('mongoose');

const payrollSalaryHoldHistorySchema = new mongoose.Schema({
  payrollRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRecord', required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  emp_no: { type: String, trim: true, default: '' },
  month: { type: String, trim: true, index: true },
  action: { type: String, enum: ['hold', 'release'], required: true, index: true },
  reason: { type: String, trim: true, default: null },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  performedByName: { type: String, trim: true, default: null },
  performedAt: { type: Date, default: Date.now, index: true },
  previousReason: { type: String, trim: true, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PayrollSalaryHoldHistory', payrollSalaryHoldHistorySchema);
