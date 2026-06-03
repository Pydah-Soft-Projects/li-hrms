/**
 * Full dump of leave requests for emp 2146 around Jun 2026.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Leave = require('../leaves/model/Leave');
const LeaveSplit = require('../leaves/model/LeaveSplit');
const Employee = require('../employees/model/Employee');
const { extractISTComponents } = require('../shared/utils/dateUtils');
const { expandLeaveToDailySegments } = require('../shared/utils/leaveDayRangeUtils');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const e = await Employee.findOne({ emp_no: '2146' }).lean();
  const leaves = await Leave.find({
    employeeId: e._id,
    isActive: true,
    $or: [
      { fromDate: { $lte: new Date('2026-06-10') }, toDate: { $gte: new Date('2026-06-01') } },
    ],
  })
    .sort({ createdAt: 1 })
    .lean();

  console.log('All leave rows (any status) Jun 2026 window:\n');
  for (const lv of leaves) {
    const from = extractISTComponents(lv.fromDate).dateStr;
    const to = extractISTComponents(lv.toDate).dateStr;
    console.log('---');
    console.log('_id:', lv._id);
    console.log('status:', lv.status, '| splitStatus:', lv.splitStatus);
    console.log('span:', from, '→', to, '| numberOfDays:', lv.numberOfDays);
    console.log('isHalfDay:', lv.isHalfDay, 'halfDayType:', lv.halfDayType);
    console.log('fromIsHalfDay:', lv.fromIsHalfDay, 'fromHalfDayType:', lv.fromHalfDayType);
    console.log('toIsHalfDay:', lv.toIsHalfDay, 'toHalfDayType:', lv.toHalfDayType);
    console.log('createdAt:', lv.createdAt, '| appliedAt:', lv.appliedAt);
    console.log('remarks:', (lv.remarks || '').slice(0, 80));
    console.log('segments:');
    for (const s of expandLeaveToDailySegments(lv)) {
      console.log(' ', s.dateStr, '→', s.numberOfDays, s.isHalfDay ? s.halfDayType : 'full');
    }
  }

  const splits = await LeaveSplit.find({
    employeeId: e._id,
    date: { $gte: '2026-06-01', $lte: '2026-06-10' },
  })
    .sort({ date: 1 })
    .lean();
  console.log('\nLeaveSplit rows:', splits.length);
  for (const s of splits) {
    console.log(' ', s.date, 'leaveId:', s.leaveId, 'status:', s.status, 'days:', s.numberOfDays, 'half:', s.isHalfDay, s.halfDayType);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
