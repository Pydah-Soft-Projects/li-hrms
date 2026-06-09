const mongoose = require('mongoose');
const Loan = require('../model/Loan');

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter =
  mongoose.models.LoanApplicationFormCounter ||
  mongoose.model('LoanApplicationFormCounter', CounterSchema);

const COUNTER_ID = 'loan_application_form';

async function ensureCounterInitialized() {
  const existing = await Counter.findById(COUNTER_ID).lean();
  if (existing) return;

  const maxLoan = await Loan.findOne({ applicationFormNumber: { $ne: null } })
    .sort({ applicationFormNumber: -1 })
    .select('applicationFormNumber')
    .lean();

  const start = maxLoan?.applicationFormNumber || 0;
  await Counter.findByIdAndUpdate(
    COUNTER_ID,
    { $setOnInsert: { seq: start } },
    { upsert: true },
  );
}

/**
 * Atomically returns the next loan application form number (No. 1, 2, 3…).
 */
async function nextLoanApplicationFormNumber() {
  await ensureCounterInitialized();
  const doc = await Counter.findByIdAndUpdate(
    COUNTER_ID,
    { $inc: { seq: 1 } },
    { new: true },
  );
  return doc.seq;
}

module.exports = {
  nextLoanApplicationFormNumber,
};
