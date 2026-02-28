/**
 * One-time migration: set employee deduction flags to true where missing.
 * Run once after deploying the deduction-preferences feature so existing
 * employees have explicit values (default true). Optional – payroll already
 * treats missing as true.
 *
 * Usage: node backend/scripts/migrate_employee_deduction_flags.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');

const FLAGS = [
  'applyProfessionTax',
  'applyESI',
  'applyPF',
  'applyAttendanceDeduction',
  'deductLateIn',
  'deductEarlyOut',
  'deductPermission',
  'deductAbsent',
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  // Only update docs that have none of the flags (pre-feature records)
  const filter = Object.fromEntries(FLAGS.map((f) => [f, { $exists: false }]));
  const result = await Employee.updateMany(filter, { $set: Object.fromEntries(FLAGS.map((f) => [f, true])) });
  console.log(`Updated ${result.modifiedCount} employee(s) with default deduction flags.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
