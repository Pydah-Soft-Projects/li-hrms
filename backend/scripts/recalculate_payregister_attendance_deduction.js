/**
 * Recompute and persist policy attendance deduction days on all PayRegisterSummary docs for a month.
 * Uses the same engine as payroll (deductionService live path with ignore MAS/PR snapshot).
 *
 * Usage:
 *   node scripts/recalculate_payregister_attendance_deduction.js 2026-03
 *   node scripts/recalculate_payregister_attendance_deduction.js 2026-03 --limit 50
 *   node scripts/recalculate_payregister_attendance_deduction.js 2026-03 --dry-run
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const { recalculatePayRegisterAttendanceDeduction } = require('../pay-register/services/payRegisterAttendanceDeductionService');

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  let limit = null;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10);
    args.splice(limitIdx, 2);
  }

  const month = args[0];
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    console.error('Usage: node scripts/recalculate_payregister_attendance_deduction.js <YYYY-MM> [--limit N] [--dry-run]');
    process.exit(1);
  }

  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    console.error('MONGODB_URI missing in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoURI);
  console.log('Connected. Month:', month, dryRun ? '(dry-run)' : '');

  const q = PayRegisterSummary.find({ month }).sort({ emp_no: 1 });
  if (limit && Number.isFinite(limit) && limit > 0) q.limit(limit);

  const rows = await q;
  console.log('Documents:', rows.length);

  let updated = 0;
  for (const doc of rows) {
    const before = doc.totalAttendanceDeductionDays;
    await recalculatePayRegisterAttendanceDeduction(doc);
    const after = doc.totalAttendanceDeductionDays;
    const br = doc.attendanceDeductionBreakdown || {};
    console.log(
      `[${doc.emp_no || '?'}] days ${before} -> ${after} | late/early inst: ${br.lateInsCount ?? 0}/${br.earlyOutsCount ?? 0} | combined: ${br.combinedCount ?? 0}`
    );
    if (!dryRun) {
      await doc.save();
      updated++;
    }
  }

  console.log(dryRun ? 'Dry-run complete (no saves).' : `Saved ${updated} pay register rows.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
