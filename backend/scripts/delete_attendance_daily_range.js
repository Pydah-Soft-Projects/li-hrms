/**
 * Delete AttendanceDaily for a date range. Default: Feb 20-25, 2026.
 * Usage: node scripts/delete_attendance_daily_range.js
 * Env:   DELETE_START_DATE, DELETE_END_DATE (optional)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');

const START = process.env.DELETE_START_DATE || '2026-02-20';
const END = process.env.DELETE_END_DATE || '2026-02-25';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const r = await AttendanceDaily.deleteMany({ date: { $gte: START, $lte: END } });
  console.log('Deleted', r.deletedCount, 'AttendanceDaily records (' + START + ' to ' + END + ')');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
