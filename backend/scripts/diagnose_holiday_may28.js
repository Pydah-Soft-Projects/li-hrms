/**
 * Diagnose holidays on 2026-05-28: creator, scope, mapping, roster HOL count vs scoped employees.
 * Run: node scripts/diagnose_holiday_may28.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const TARGET = '2026-05-28';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const Holiday = mongoose.connection.collection('holidays');
  const User = mongoose.connection.collection('users');
  const Employee = mongoose.connection.collection('employees');
  const PreScheduledShift = mongoose.connection.collection('prescheduledshifts');
  const HolidayHistory = mongoose.connection.collection('holidayhistories');

  const dayStart = new Date(`${TARGET}T00:00:00.000Z`);
  const dayEnd = new Date(`${TARGET}T23:59:59.999Z`);

  const holidays = await Holiday.find({
    isActive: { $ne: false },
    $or: [
      { date: { $gte: dayStart, $lte: dayEnd } },
      { endDate: { $gte: dayStart, $lte: dayEnd } },
      { date: { $lte: dayStart }, endDate: { $gte: dayEnd } },
    ],
  }).toArray();

  console.log('\n=== Holidays covering', TARGET, '===\n');
  if (holidays.length === 0) {
    console.log('No active holidays found for this date. Trying any year with month-day 05-28...');
    const any = await Holiday.find({
      isActive: { $ne: false },
      $expr: {
        $or: [
          { $eq: [{ $month: '$date' }, 5] },
          { $eq: [{ $month: '$endDate' }, 5] },
        ],
      },
    })
      .limit(20)
      .toArray();
    console.log('Sample May-28 holidays (any year):', any.length);
    for (const h of any) {
      console.log(' -', h.name, '|', h.date, '| scope:', h.scope);
    }
  }

  for (const h of holidays) {
    console.log('---');
    console.log('Holiday:', h.name);
    console.log('  _id:', h._id);
    console.log('  date:', h.date, 'endDate:', h.endDate);
    console.log('  scope:', h.scope, '| applicableTo:', h.applicableTo);
    console.log('  isMaster:', h.isMaster, '| groupId:', h.groupId);
    console.log('  divisionMapping rows:', (h.divisionMapping || []).length);
    console.log(JSON.stringify(h.divisionMapping, null, 2));

    const creatorId = h.createdBy;
    if (creatorId) {
      const creator = await User.findOne({ _id: creatorId });
      if (creator) {
        console.log('\n  Created by:', creator.name, '|', creator.email, '| role:', creator.role);
        console.log('  Creator holidayDivisionMapping:', JSON.stringify(creator.holidayDivisionMapping, null, 2));
        console.log('  Creator managedHolidayGroupIds:', (creator.managedHolidayGroupIds || []).length);
      }
    }

    const hist = await HolidayHistory.find({ holidayId: h._id }).sort({ timestamp: -1 }).limit(3).toArray();
    for (const row of hist) {
      console.log('  History:', row.event, row.performedByName, row.timestamp);
      if (row.details) console.log('    details:', JSON.stringify(row.details));
    }

    const holRoster = await PreScheduledShift.countDocuments({ date: TARGET, status: 'HOL' });
    const totalActive = await Employee.countDocuments({ is_active: { $ne: false } });
    console.log('\n  Roster HOL on', TARGET + ':', holRoster, '| active employees:', totalActive);

    if (h.scope === 'MAPPING' && h.divisionMapping?.length) {
      const { normalizeMappingList, mappingToEmployeeOrConditionsExpanded } = require('../holidays/utils/holidayScopeMapping');
      const Department = mongoose.connection.collection('departments');
      const deptDocs = await Department.find({ isActive: { $ne: false } }).toArray();
      const rows = normalizeMappingList(h.divisionMapping);
      const conditions = mappingToEmployeeOrConditionsExpanded(rows, deptDocs);
      const scoped = await Employee.find({ is_active: { $ne: false }, $or: conditions }).toArray();
      console.log('  Expected scoped employees (MAPPING):', scoped.length);
      console.log('  Sample emp_nos:', scoped.slice(0, 8).map((e) => e.emp_no));
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
