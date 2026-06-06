require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const {
  buildPayslipLoans,
  resolvePaysheetColumnValue,
} = require('../payroll/services/payslipLoanSectionService');

const outputColumns = [
  { header: 'Loan EMI', field: 'loanAdvance.totalEMI' },
  { header: 'Loans (remaining balance)', field: 'loanAdvance.remainingBalance' },
];

const record = {
  _id: 'pay1',
  month: '2026-01',
  employeeId: 'emp1',
  loanAdvance: {
    totalEMI: 0,
    remainingBalance: 0,
    emiBreakdown: [],
  },
};

const snapshotRow = {
  'Loan EMI': 2500,
  'Loans (remaining balance)': 15000,
};

const emi = resolvePaysheetColumnValue(outputColumns, snapshotRow, record, 'loanAdvance.totalEMI');
const remaining = resolvePaysheetColumnValue(
  outputColumns,
  snapshotRow,
  record,
  'loanAdvance.remainingBalance'
);

const loans = buildPayslipLoans(record, new Map(), { outputColumns, snapshotRow });

console.log('Paysheet EMI resolved:', emi);
console.log('Paysheet remaining resolved:', remaining);
console.log('Payslip loans:', JSON.stringify(loans, null, 2));

if (emi !== 2500 || remaining !== 15000 || !loans.hasLoans || loans.totalEmiDeducted !== 2500) {
  console.error('TEST FAILED');
  process.exit(1);
}
console.log('TEST PASSED');
