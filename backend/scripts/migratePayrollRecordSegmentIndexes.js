/**
 * Drop legacy unique indexes on PayrollRecord (employeeId+month / emp_no+month)
 * so segmentIndex unique indexes can be created.
 * Usage: node scripts/migratePayrollRecordSegmentIndexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.collection('payrollrecords');
  const indexes = await col.indexes();
  console.log('Existing indexes:', indexes.map((i) => i.name));
  for (const idx of indexes) {
    const keys = Object.keys(idx.key || {});
    if (
      idx.unique &&
      keys.length === 2 &&
      ((keys.includes('employeeId') && keys.includes('month') && !keys.includes('segmentIndex')) ||
        (keys.includes('emp_no') && keys.includes('month') && !keys.includes('segmentIndex')))
    ) {
      console.log('Dropping', idx.name);
      await col.dropIndex(idx.name);
    }
  }
  // Ensure model indexes
  const PayrollRecord = require('../payroll/model/PayrollRecord');
  await PayrollRecord.syncIndexes();
  console.log('Synced PayrollRecord indexes');
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
