/**
 * One-time / idempotent backfill: seed orgHistory + salaryHistory for employees missing them.
 * Usage: node scripts/backfillEmployeeTimeline.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const { ensureInitialTimeline } = require('../employees/services/employeeTimelineService');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const cursor = Employee.find({}).cursor();
  let n = 0;
  let touched = 0;
  for await (const emp of cursor) {
    n += 1;
    const { orgAdded, salaryAdded } = ensureInitialTimeline(emp);
    if (orgAdded || salaryAdded) {
      await emp.save();
      touched += 1;
    }
    if (n % 500 === 0) console.log(`Scanned ${n}, updated ${touched}…`);
  }
  console.log(`Done. Scanned ${n}, updated ${touched}.`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
