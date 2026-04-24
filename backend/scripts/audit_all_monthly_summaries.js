/**
 * Read-only audit of MonthlyAttendanceSummary across all stored months.
 *
 * Usage (from backend):
 *   node scripts/audit_all_monthly_summaries.js
 *
 * Remove invalid placeholder month (optional):
 *   DELETE_JUNK_1970=1 node scripts/audit_all_monthly_summaries.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);

  if (process.env.DELETE_JUNK_1970 === '1' || process.env.DELETE_JUNK_1970 === 'true') {
    const junk = await MonthlyAttendanceSummary.deleteMany({ month: '1970-01' });
    console.log('Deleted MonthlyAttendanceSummary junk month 1970-01:', junk.deletedCount, '\n');
  }

  const byMonth = await MonthlyAttendanceSummary.aggregate([
    { $group: { _id: '$month', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log('MonthlyAttendanceSummary by payroll month key (YYYY-MM → documents):\n');
  let totalDocs = 0;
  for (const r of byMonth) {
    totalDocs += r.count;
    console.log(`  ${r._id}\t${r.count}`);
  }
  console.log(`\nDistinct months: ${byMonth.length} | Total documents: ${totalDocs}`);

  console.log(
    '\n--- Rows where totalPaidLeaves > totalLeaves + 0.01 (often double-counted parent+split before fix) ---\n'
  );
  const paidGtLeaves = await MonthlyAttendanceSummary.find({
    $expr: { $gt: ['$totalPaidLeaves', { $add: ['$totalLeaves', 0.01] }] },
  })
    .select('emp_no month totalLeaves totalPaidLeaves totalLopLeaves totalPresentDays totalPayableShifts')
    .sort({ month: 1, emp_no: 1 })
    .lean();

  console.log('Count:', paidGtLeaves.length);
  const cap = 50;
  paidGtLeaves.slice(0, cap).forEach((a) => {
    console.log(
      `  ${a.month} ${a.emp_no}  leaves=${a.totalLeaves} paid=${a.totalPaidLeaves} lop=${a.totalLopLeaves} present=${a.totalPresentDays} payable=${a.totalPayableShifts}`
    );
  });
  if (paidGtLeaves.length > cap) console.log(`  ... and ${paidGtLeaves.length - cap} more`);

  console.log(
    '\n--- Rows where totalLeaves + 0.01 < totalPaidLeaves + totalLopLeaves (leave parts sum above calendar leave days) ---\n'
  );
  const partsGtLeaves = await MonthlyAttendanceSummary.find({
    $expr: {
      $gt: [{ $add: ['$totalPaidLeaves', '$totalLopLeaves'] }, { $add: ['$totalLeaves', 0.01] }],
    },
  })
    .select('emp_no month totalLeaves totalPaidLeaves totalLopLeaves')
    .sort({ month: 1, emp_no: 1 })
    .lean();
  console.log('Count:', partsGtLeaves.length);
  partsGtLeaves.slice(0, cap).forEach((a) => {
    const sum = (Number(a.totalPaidLeaves) || 0) + (Number(a.totalLopLeaves) || 0);
    console.log(`  ${a.month} ${a.emp_no}  leaves=${a.totalLeaves} paid+lop=${sum}`);
  });
  if (partsGtLeaves.length > cap) console.log(`  ... and ${partsGtLeaves.length - cap} more`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
