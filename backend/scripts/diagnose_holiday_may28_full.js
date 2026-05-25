require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const {
  normalizeMappingList,
  mappingToEmployeeOrConditionsExpanded,
} = require('../holidays/utils/holidayScopeMapping');
const Department = require('../departments/model/Department');

const TARGET = '2026-05-28';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Holiday = mongoose.connection.collection('holidays');
  const PreScheduledShift = mongoose.connection.collection('prescheduledshifts');

  const holidays = await Holiday.find({
    isActive: { $ne: false },
    date: new Date(`${TARGET}T00:00:00.000Z`),
  }).toArray();

  console.log('Holidays on exact date:', holidays.length);
  for (const h of holidays) {
    console.log(' -', h.name, h.scope, (h.divisionMapping || []).length, 'rows');
  }

  const h = holidays.find((x) => x.name === 'Ravi Buraga') || holidays[0];
  if (h) {
    const deptDocs = await Department.find({ isActive: { $ne: false } }).select('divisions').lean();
    const rows = normalizeMappingList(h.divisionMapping);
    const conditions = mappingToEmployeeOrConditionsExpanded(rows, deptDocs);
    const emps = await Employee.find({ is_active: { $ne: false }, $or: conditions }).select('emp_no').lean();
    console.log('\nMongoose resolve count for', h.name + ':', emps.length);
    console.log('emp_nos:', emps.map((e) => e.emp_no).join(', '));
  }

  const holEmps = await PreScheduledShift.find({ date: TARGET, status: 'HOL' }).project({ employeeNumber: 1, notes: 1, updatedAt: 1 }).toArray();
  console.log('\nTotal HOL rows:', holEmps.length);
  const notesHoliday = holEmps.filter((r) => r.notes === 'Holiday').length;
  const otherNotes = holEmps.filter((r) => r.notes !== 'Holiday').length;
  console.log('notes=Holiday:', notesHoliday, 'other notes:', otherNotes);

  const scopedEmpNos = h
    ? (
        await Employee.find({
          is_active: { $ne: false },
          $or: mappingToEmployeeOrConditionsExpanded(
            normalizeMappingList(h.divisionMapping),
            await Department.find({ isActive: { $ne: false } }).select('divisions').lean()
          ),
        })
          .select('emp_no')
          .lean()
      ).map((e) => String(e.emp_no).toUpperCase())
    : [];

  const holSet = new Set(holEmps.map((r) => String(r.employeeNumber).toUpperCase()));
  const inScopeHol = scopedEmpNos.filter((n) => holSet.has(n));
  const outScopeHol = holEmps.length - inScopeHol.length;
  console.log('HOL in scoped emps:', inScopeHol.length, 'HOL outside scope:', outScopeHol);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
