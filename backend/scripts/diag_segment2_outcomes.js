/**
 * Print AttendanceDaily outcomes for OVN001 on pay-period days 15–28 (default range).
 * Usage: node scripts/diag_segment2_outcomes.js [EMP] [START] [END]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');

async function main() {
  const emp = (process.argv[2] || 'OVN001').toUpperCase();
  const start = process.argv[3] || '2026-05-10';
  const end = process.argv[4] || '2026-05-23';
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const rows = await AttendanceDaily.find({
    employeeNumber: emp,
    date: { $gte: start, $lte: end },
  })
    .sort({ date: 1 })
    .lean();

  console.log(`Employee ${emp} | ${start} .. ${end} | rows=${rows.length}\n`);
  let i = 15;
  for (const r of rows) {
    const ns = (r.shifts || []).length;
    console.log(
      `Pay day ${i}\t${r.date}\t${r.status}\tpayable=${r.payableShifts}\tlate=${r.totalLateInMinutes ?? 0}\tearly=${r.totalEarlyOutMinutes ?? 0}\tshifts=${r.totalShifts ?? ns}`
    );
    i++;
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
