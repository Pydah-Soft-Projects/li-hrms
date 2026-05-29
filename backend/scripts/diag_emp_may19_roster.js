require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectMongoDB, closeMongoDB } = require('../config/database');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Holiday = require('../holidays/model/Holiday');
const Employee = require('../employees/model/Employee');
const { parseRosterHalfNonWorking } = require('../shifts/utils/rosterHalfNonWorking');

const DATE = process.env.DIAG_DATE || '2026-05-19';
const EMPS = (process.env.DIAG_EMPS || '111117,111122,111127').split(',').map((s) => s.trim().toUpperCase());

(async () => {
  await connectMongoDB();

  const holidays = await Holiday.find({ isActive: { $ne: false } })
    .select('name date endDate rosterApplyMode halfDayType rosterFillMode scope')
    .lean();

  console.log(`\n=== Holidays overlapping ${DATE} ===`);
  let holCount = 0;
  for (const h of holidays) {
    const d = String(h.date).substring(0, 10);
    const e = h.endDate ? String(h.endDate).substring(0, 10) : d;
    if (DATE >= d && DATE <= e) {
      holCount++;
      console.log({
        name: h.name,
        date: d,
        endDate: e,
        rosterApplyMode: h.rosterApplyMode,
        halfDayType: h.halfDayType,
        rosterFillMode: h.rosterFillMode,
        scope: h.scope,
      });
    }
  }
  if (!holCount) console.log('  (none found active for this date)');

  for (const empNo of EMPS) {
    const emp = await Employee.findOne({ emp_no: empNo })
      .select('emp_no employee_name department_id division_id')
      .lean();
    console.log(`\n=== ${empNo} ${emp?.employee_name || '?'} ===`);

    const roster = await PreScheduledShift.findOne({ employeeNumber: empNo, date: DATE })
      .select('status shiftId firstHalfStatus secondHalfStatus holidayHalfDayType holidaySegmentScope sourceHolidayId notes holidayName')
      .lean();
    const parsed = parseRosterHalfNonWorking(roster);
    console.log('  Roster row:', roster ? {
      status: roster.status,
      shiftId: roster.shiftId ? 'set' : null,
      firstHalfStatus: roster.firstHalfStatus,
      secondHalfStatus: roster.secondHalfStatus,
      holidayHalfDayType: roster.holidayHalfDayType,
      holidayName: roster.holidayName,
      notes: roster.notes,
      sourceHolidayId: roster.sourceHolidayId,
    } : 'NONE');
    console.log('  Parsed:', {
      isFullHOL: parsed.isFullHOL,
      isFullWO: parsed.isFullWO,
      firstHOL: parsed.firstHOL,
      secondHOL: parsed.secondHOL,
      firstWO: parsed.firstWO,
      secondWO: parsed.secondWO,
    });

    const daily = await AttendanceDaily.findOne({ employeeNumber: empNo, date: DATE })
      .select('status payableShifts totalWorkingHours notes rosterFirstHalfNonWorking rosterSecondHalfNonWorking policyMeta.partialDayRule')
      .lean();
    console.log('  AttendanceDaily:', daily ? {
      status: daily.status,
      payable: daily.payableShifts,
      hours: daily.totalWorkingHours,
      rosterFirst: daily.rosterFirstHalfNonWorking,
      rosterSecond: daily.rosterSecondHalfNonWorking,
      partialRule: daily.policyMeta?.partialDayRule,
      notes: (daily.notes || '').slice(0, 100),
    } : 'NONE');
  }

  // Count how many transport employees have WO vs HOL on this date
  const transportRoster = await PreScheduledShift.find({ date: DATE, employeeNumber: /^1111/i })
    .select('employeeNumber status firstHalfStatus secondHalfStatus')
    .limit(200)
    .lean();
  let fullWo = 0, fullHol = 0, halfHol = 0, halfWo = 0, other = 0;
  for (const r of transportRoster) {
    const p = parseRosterHalfNonWorking(r);
    if (p.isFullWO) fullWo++;
    else if (p.isFullHOL) fullHol++;
    else if (p.firstHOL || p.secondHOL) halfHol++;
    else if (p.firstWO || p.secondWO) halfWo++;
    else other++;
  }
  console.log(`\n=== Sample 1111* roster on ${DATE} (up to 200 rows) ===`);
  console.log({ fullWo, fullHol, halfHol, halfWo, other, total: transportRoster.length });

  const HolidayGroup = require('../holidays/model/HolidayGroup');
  const activeHol = await Holiday.findOne({ name: /POWER PROBLEM/i, isActive: true }).lean();
  if (activeHol) {
    console.log(`\n=== Active POWER PROBLEM holiday ===`);
    console.log({
      id: String(activeHol._id),
      scope: activeHol.scope,
      groupId: activeHol.groupId,
      applicableTo: activeHol.applicableTo,
      rosterApplyMode: activeHol.rosterApplyMode,
      halfDayType: activeHol.halfDayType,
    });
    if (activeHol.groupId) {
      const g = await HolidayGroup.findById(activeHol.groupId).select('name employeeNumbers').lean();
      console.log('  Holiday group:', g?.name, 'members:', g?.employeeNumbers?.length);
      for (const e of EMPS) {
        const inGrp = g?.employeeNumbers?.some((x) => String(x).toUpperCase() === e);
        console.log(`    ${e} in holiday group:`, !!inGrp);
      }
    }
  }

  for (const empNo of EMPS) {
    const week = await PreScheduledShift.find({
      employeeNumber: empNo,
      date: { $gte: '2026-05-15', $lte: '2026-05-22' },
    })
      .select('date status firstHalfStatus secondHalfStatus notes sourceHolidayId')
      .sort({ date: 1 })
      .lean();
    console.log(`\n=== ${empNo} roster 15–22 May ===`);
    for (const r of week) {
      console.log(`  ${r.date}: status=${r.status} H1=${r.firstHalfStatus} H2=${r.secondHalfStatus} holId=${r.sourceHolidayId || '-'}`);
    }
  }

  const woList = await PreScheduledShift.find({ date: DATE, status: 'WO' })
    .select('employeeNumber')
    .lean();
  console.log(`\n=== All full WO on ${DATE} (${woList.length}) ===`);
  console.log(woList.map((x) => x.employeeNumber).join(', '));

  await closeMongoDB();
})();
