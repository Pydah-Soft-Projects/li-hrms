/**
 * One-off: fix loan documents where loanConfig was never saved (EMI/total 0) but interestAmount exists.
 * Run: node backend/scripts/repair_loan_loanconfig_bulk.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Loan = require('../loans/model/Loan');

const { calculateEMI } = (() => {
  const calc = (principal, interestRate, duration) => {
    if (interestRate === 0 || !interestRate) {
      const emi = principal / duration;
      return { emiAmount: Math.round(emi), totalInterest: 0, totalAmount: principal };
    }
    const totalInterest = (principal * interestRate * (duration / 12)) / 100;
    const totalAmount = principal + totalInterest;
    const emi = totalAmount / duration;
    return {
      emiAmount: Math.round(emi),
      totalInterest: Math.round(totalInterest),
      totalAmount: Math.round(totalAmount),
    };
  };
  return { calculateEMI: calc };
})();

function inferRate(loan) {
  const p = Number(loan.amount);
  const d = Number(loan.duration);
  const ti = Number(loan.interestAmount ?? loan.loanConfig?.totalInterest);
  if (!p || !d || !ti || ti <= 0) return null;
  return Math.round(((ti * 100) / (p * (d / 12))) * 1000) / 1000;
}

function needsRepair(doc) {
  if (doc.requestType !== 'loan') return false;
  const emi = Number(doc.loanConfig?.emiAmount);
  const tot = Number(doc.loanConfig?.totalAmount);
  const ti = Number(doc.interestAmount);
  return (!(emi > 0) || !(tot > 0)) || (ti > 0 && !(emi > 0));
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set MONGO_URI or MONGODB_URI');
    process.exit(1);
  }
  await mongoose.connect(uri);
  const cursor = Loan.find({ requestType: 'loan' }).cursor();
  let n = 0;
  for await (const loan of cursor) {
    if (!needsRepair(loan)) continue;
    if (!loan.loanConfig) loan.loanConfig = {};
    let rate = Number(loan.loanConfig.interestRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      const inf = inferRate(loan);
      rate = inf != null ? inf : 0;
    }
    loan.loanConfig.interestRate = rate;
    const { emiAmount, totalInterest, totalAmount } = calculateEMI(Number(loan.amount), rate, Number(loan.duration));
    loan.loanConfig.emiAmount = emiAmount;
    loan.loanConfig.totalInterest = totalInterest;
    loan.loanConfig.totalAmount = totalAmount;
    loan.interestAmount = totalInterest;
    if (loan.repayment && !(Number(loan.repayment.totalPaid) > 0)) {
      loan.repayment.remainingBalance = totalAmount;
    }
    loan.markModified('loanConfig');
    loan.markModified('repayment');
    await loan.save();
    n += 1;
    console.log('Repaired loan', loan._id.toString(), loan.emp_no, { emiAmount, totalAmount });
  }
  console.log('Done. Repaired count:', n);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
