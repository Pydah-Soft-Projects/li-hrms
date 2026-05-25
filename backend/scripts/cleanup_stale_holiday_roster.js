/**
 * Remove stale roster HOL rows left by legacy holiday sync (company-wide apply).
 * Usage: node scripts/cleanup_stale_holiday_roster.js [YYYY-MM-DD] [holidayNameSubstring]
 * Default: 2026-05-28 asdfsadfsa
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');

async function guessShiftFromWeekdayPattern(employeeNumber, dateStr) {
  const targetWeekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  const lookbackStart = new Date(`${dateStr}T00:00:00Z`);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 63);
  const fromStr = lookbackStart.toISOString().slice(0, 10);

  const candidates = await PreScheduledShift.find({
    employeeNumber,
    date: { $gte: fromStr, $lt: dateStr },
    shiftId: { $ne: null },
    status: { $ne: 'HOL' },
  })
    .select('date shiftId')
    .sort({ date: -1 })
    .lean();

  for (const row of candidates) {
    const wd = new Date(`${row.date}T00:00:00Z`).getUTCDay();
    if (wd === targetWeekday && row.shiftId) return row.shiftId;
  }
  return null;
}

async function main() {
  const date = process.argv[2] || '2026-05-28';
  const namePart = process.argv[3] || 'asdfsadfsa';

  await mongoose.connect(process.env.MONGODB_URI);

  const rows = await PreScheduledShift.find({
    date,
    status: 'HOL',
    notes: { $regex: namePart, $options: 'i' },
  })
    .select('employeeNumber')
    .lean();

  const empNos = [...new Set(rows.map((r) => String(r.employeeNumber || '').toUpperCase()).filter(Boolean))];
  console.log(`Found ${empNos.length} employees with HOL on ${date} matching "${namePart}"`);

  let restored = 0;
  let weekOff = 0;
  for (const empNo of empNos) {
    const shiftId = await guessShiftFromWeekdayPattern(empNo, date);
    const update = shiftId
      ? { status: null, shiftId, notes: null }
      : { status: 'WO', shiftId: null, notes: 'Week Off' };
    await PreScheduledShift.updateOne({ employeeNumber: empNo, date }, { $set: update });
    if (shiftId) restored += 1;
    else weekOff += 1;
  }

  console.log(`Done. Shift restored: ${restored}, set to WO: ${weekOff}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
