require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Config = require('../payroll/model/PayrollConfiguration');
  const Snap = require('../payroll/model/PayrollPayslipSnapshot');
  const PR = require('../payroll/model/PayrollRecord');

  const cfg = await Config.get();
  const loanCols = (cfg?.outputColumns || []).filter(
    (c) =>
      String(c.field || '').includes('loan') ||
      /loan/i.test(c.header || '') ||
      String(c.field || '').includes('remainingBalance')
  );
  console.log('Loan-related output columns:', JSON.stringify(loanCols, null, 2));

  const snaps = await Snap.find({ kind: 'regular' }).limit(5).lean();
  for (const s of snaps) {
    const row = s.row || {};
    const loanKeys = Object.entries(row).filter(([k, v]) => /loan/i.test(k) && Number(v) > 0);
    if (loanKeys.length) {
      console.log('Snapshot month', s.month, 'emp', s.employeeId, loanKeys);
    }
  }

  const snapCount = await Snap.countDocuments({ kind: 'regular' });
  console.log('Snapshot count:', snapCount);

  // Find snapshot rows with any numeric value in loan column headers
  for (const col of loanCols) {
    const header = col.header?.trim();
    if (!header) continue;
    const found = await Snap.findOne({ [`row.${header}`]: { $gt: 0 } }).lean();
    if (found) {
      console.log(`Found snapshot with ${header} > 0:`, found.month, found.row[header]);
    }
  }

  await mongoose.disconnect();
})();
