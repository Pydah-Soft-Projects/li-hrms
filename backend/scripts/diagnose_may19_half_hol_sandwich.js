require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { createISTDate } = require('../shared/utils/dateUtils');
const Leave = require('../leaves/model/Leave');
const LeaveSplit = require('../leaves/model/LeaveSplit');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { evaluateHalfHolidaySandwichDay } = require('../attendance/utils/halfHolidaySandwichPolicy');

const DATE = '2026-05-19';
const PREV = '2026-05-18';
const NEXT = '2026-05-20';

function leaveCoverage(leaves) {
  return (leaves || []).reduce((sum, l) => {
    if (!l) return sum;
    if (l.isHalfDay) return sum + 0.5;
    if (typeof l.numberOfDays === 'number' && l.numberOfDays > 0 && l.numberOfDays < 1) return sum + 0.5;
    return sum + 1;
  }, 0);
}

async function neighborKind(employeeId, dStr) {
  const ds = createISTDate(dStr, '00:00');
  const de = createISTDate(dStr, '23:59');
  const lvs = await Leave.find({
    employeeId,
    status: 'approved',
    isActive: true,
    fromDate: { $lte: de },
    toDate: { $gte: ds },
  })
    .select('isHalfDay halfDayType numberOfDays')
    .lean();
  const splits = await LeaveSplit.find({
    employeeId,
    status: 'approved',
    date: ds,
  })
    .select('isHalfDay numberOfDays')
    .lean();
  const all = [...lvs, ...splits];
  const cov = Math.min(1, leaveCoverage(all));
  if (cov >= 1) return 'LEAVE';
  if (cov > 0) return `HALF_LEAVE(${cov})`;
  return 'NONE';
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const dayStart = createISTDate(DATE, '00:00');
  const dayEnd = createISTDate(DATE, '23:59');

  const leaves19 = await Leave.find({
    status: 'approved',
    isActive: true,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('employeeId fromDate toDate isHalfDay halfDayType numberOfDays leaveType')
    .lean();

  console.log('Approved leaves overlapping', DATE + ':', leaves19.length);
  let sandwichedEligible = 0;
  let wouldSandwich = 0;

  for (const lv of leaves19.slice(0, 40)) {
    const emp = await Employee.findById(lv.employeeId).select('emp_no').lean();
    const en = String(emp?.emp_no || '').toUpperCase();
    const prevK = await neighborKind(lv.employeeId, PREV);
    const nextK = await neighborKind(lv.employeeId, NEXT);
    const daily = await AttendanceDaily.findOne({ employeeNumber: en, date: DATE })
      .select('status payableShifts totalWorkingHours')
      .lean();

    const day = {
      isHOL: false,
      rosterFirstHalfHOL: false,
      rosterSecondHalfHOL: true,
      leaves: [lv],
      ods: [],
      attendance: daily,
    };
    const prevKind = prevK === 'LEAVE' ? 'LEAVE' : null;
    const nextKind = nextK === 'LEAVE' ? 'LEAVE' : null;
    if (prevKind === 'LEAVE' && nextKind === 'LEAVE') sandwichedEligible += 1;
    const ev = evaluateHalfHolidaySandwichDay(day, prevKind, nextKind);
    if (ev.pushSandwichLop) wouldSandwich += 1;

    console.log(
      [
        en,
        `leave=${lv.isHalfDay ? lv.halfDayType || 'half' : 'full'}`,
        `prev=${prevK}`,
        `next=${nextK}`,
        `att=${daily?.status || 'none'}`,
        `sandwichLop=${ev.pushSandwichLop}`,
        `creditDelta=${ev.creditDelta}`,
      ].join(' | ')
    );
  }

  console.log('\nAmong first 40 with leave on 19:');
  console.log('  prev+next full leave:', sandwichedEligible);
  console.log('  would apply 0.5 sandwich LOP:', wouldSandwich);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
