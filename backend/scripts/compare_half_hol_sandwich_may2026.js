/**
 * Before/after snapshot for half-holiday sandwich on 2026-05-19 (2nd half HOL) and May 2026 payroll month.
 *
 * Usage:
 *   node scripts/compare_half_hol_sandwich_may2026.js --snapshot-before
 *   node scripts/compare_half_hol_sandwich_may2026.js --snapshot-after
 *   node scripts/compare_half_hol_sandwich_may2026.js --recalc
 *   node scripts/compare_half_hol_sandwich_may2026.js --compare
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');
const { parseRosterHalfNonWorking } = require('../shifts/utils/rosterHalfNonWorking');

const TARGET_DATE = process.env.TARGET_DATE || '2026-05-19';
const MONTH = process.env.MONTH || '2026-05';
const OUT_DIR = path.join(__dirname, '../tmp');
const BEFORE_FILE = path.join(OUT_DIR, `half_hol_sandwich_${MONTH}_before.json`);
const AFTER_FILE = path.join(OUT_DIR, `half_hol_sandwich_${MONTH}_after.json`);

function pickSummarySlice(s) {
  if (!s) return null;
  const hol19 = (s.contributingDates?.holidays || []).find((h) => h.date === TARGET_DATE);
  const lop19 = (s.contributingDates?.lopLeaves || []).filter((x) => x.date === TARGET_DATE);
  const leave19 = (s.contributingDates?.leaves || []).filter((x) => x.date === TARGET_DATE);
  const paid19 = (s.contributingDates?.paidLeaves || []).filter((x) => x.date === TARGET_DATE);
  return {
    emp_no: s.emp_no,
    totalHolidays: s.totalHolidays,
    totalLopLeaveDays: s.totalLopLeaveDays,
    totalLeaveDays: s.totalLeaveDays,
    totalPayableShifts: s.totalPayableShifts,
    holOn19: hol19 || null,
    lopOn19: lop19,
    leaveOn19: leave19,
    paidOn19: paid19,
  };
}

async function loadHalfHolRosterEmpNos() {
  const rows = await PreScheduledShift.find({ date: TARGET_DATE })
    .select('employeeNumber status firstHalfStatus secondHalfStatus')
    .lean();
  const out = [];
  for (const row of rows) {
    const p = parseRosterHalfNonWorking(row);
    if (p.secondHOL && !p.firstHOL && !p.isFullHOL) {
      out.push(String(row.employeeNumber || '').trim().toUpperCase());
    }
  }
  return [...new Set(out)];
}

async function buildSnapshot() {
  const empNos = await loadHalfHolRosterEmpNos();
  const summaries = await MonthlyAttendanceSummary.find({ month: MONTH })
    .select('emp_no totalHolidays totalLopLeaveDays totalLeaveDays totalPayableShifts contributingDates')
    .lean();

  const byEmp = new Map(summaries.map((s) => [String(s.emp_no || '').toUpperCase(), pickSummarySlice(s)]));

  const dayStart = createISTDate(TARGET_DATE, '00:00');
  const dayEnd = createISTDate(TARGET_DATE, '23:59');
  const leavesOn19 = await Leave.find({
    status: 'approved',
    isActive: true,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('emp_no employeeId fromDate toDate isHalfDay halfDayType numberOfDays leaveType leaveNature status')
    .lean();

  const leaveByEmp = new Map();
  for (const l of leavesOn19) {
    const emp = await Employee.findById(l.employeeId).select('emp_no').lean();
    const en = String(l.emp_no || emp?.emp_no || '').toUpperCase();
    if (!en) continue;
    if (!leaveByEmp.has(en)) leaveByEmp.set(en, []);
    leaveByEmp.get(en).push({
      leaveType: l.leaveType,
      isHalfDay: l.isHalfDay,
      halfDayType: l.halfDayType,
      numberOfDays: l.numberOfDays,
      from: extractISTComponents(l.fromDate).dateStr,
      to: extractISTComponents(l.toDate).dateStr,
    });
  }

  const dailies = await AttendanceDaily.find({
    date: TARGET_DATE,
    employeeNumber: { $in: empNos },
  })
    .select('employeeNumber status payableShifts policyMeta.sandwichRule rosterFirstHalfNonWorking rosterSecondHalfNonWorking')
    .lean();

  const dailyByEmp = new Map(dailies.map((d) => [String(d.employeeNumber).toUpperCase(), d]));

  const affected = [];
  for (const empNo of empNos) {
    affected.push({
      emp_no: empNo,
      summary: byEmp.get(empNo) || null,
      leavesOn19: leaveByEmp.get(empNo) || [],
      daily: dailyByEmp.get(empNo) || null,
    });
  }

  return {
    capturedAt: new Date().toISOString(),
    targetDate: TARGET_DATE,
    month: MONTH,
    halfHolSecondHalfCount: empNos.length,
    approvedLeavesOverlapping19: leavesOn19.length,
    affected,
  };
}

async function recalcMonth() {
  const { calculateAllEmployeesSummary } = require('../attendance/services/summaryCalculationService');
  const parts = MONTH.split('-');
  const year = parseInt(parts[0], 10);
  const monthNumber = parseInt(parts[1], 10);
  console.log(`Recalculating all summaries for ${MONTH}...`);
  await calculateAllEmployeesSummary(year, monthNumber);
  console.log('Recalc done.');
}

function stripMongoIds(v) {
  if (v == null) return v;
  if (Array.isArray(v)) return v.map(stripMongoIds);
  if (typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === '_id') continue;
      o[k] = stripMongoIds(val);
    }
    return o;
  }
  return v;
}

function compareSnapshots(before, after) {
  const beforeMap = new Map(before.affected.map((x) => [x.emp_no, x]));
  const changes = [];
  for (const a of after.affected) {
    const b = beforeMap.get(a.emp_no);
    if (!b) continue;
    const bs = b.summary;
    const as = a.summary;
    if (!bs && !as) continue;
    const delta = {
      emp_no: a.emp_no,
      leavesOn19: a.leavesOn19,
      before: bs,
      after: as,
      diff: {},
    };
    if (bs && as) {
      for (const k of ['totalHolidays', 'totalLopLeaveDays', 'totalLeaveDays', 'totalPayableShifts']) {
        const d = round((as[k] || 0) - (bs[k] || 0));
        if (Math.abs(d) > 0.001) delta.diff[k] = d;
      }
      if (JSON.stringify(stripMongoIds(bs.holOn19)) !== JSON.stringify(stripMongoIds(as.holOn19))) {
        delta.diff.holOn19 = { before: bs.holOn19, after: as.holOn19 };
      }
      if (
        JSON.stringify(stripMongoIds(bs.lopOn19)) !== JSON.stringify(stripMongoIds(as.lopOn19))
      ) {
        delta.diff.lopOn19 = { before: bs.lopOn19, after: as.lopOn19 };
      }
    }
    if (Object.keys(delta.diff).length > 0) changes.push(delta);
  }
  return changes;
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('Use --snapshot-before | --recalc | --compare');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  if (args.includes('--snapshot-before')) {
    const snap = await buildSnapshot();
    fs.writeFileSync(BEFORE_FILE, JSON.stringify(snap, null, 2));
    console.log('Wrote', BEFORE_FILE);
    console.log('2nd-half HOL roster on', TARGET_DATE + ':', snap.halfHolSecondHalfCount);
    console.log('Approved leaves overlapping:', snap.approvedLeavesOverlapping19);
  }

  if (args.includes('--snapshot-after')) {
    const snap = await buildSnapshot();
    fs.writeFileSync(AFTER_FILE, JSON.stringify(snap, null, 2));
    console.log('Wrote', AFTER_FILE);
  }

  if (args.includes('--recalc')) {
    await recalcMonth();
    const snap = await buildSnapshot();
    fs.writeFileSync(AFTER_FILE, JSON.stringify(snap, null, 2));
    console.log('Wrote', AFTER_FILE);
  }

  if (args.includes('--compare')) {
    if (!fs.existsSync(BEFORE_FILE)) {
      console.error('Missing before file. Run --snapshot-before first.');
      process.exit(1);
    }
    const before = JSON.parse(fs.readFileSync(BEFORE_FILE, 'utf8'));
    const after = fs.existsSync(AFTER_FILE)
      ? JSON.parse(fs.readFileSync(AFTER_FILE, 'utf8'))
      : await buildSnapshot();
    const changes = compareSnapshots(before, after);
    const reportPath = path.join(OUT_DIR, `half_hol_sandwich_${MONTH}_report.json`);
    fs.writeFileSync(reportPath, JSON.stringify({ changes, changeCount: changes.length }, null, 2));
    console.log('Employees with summary changes (half-HOL roster on 19th):', changes.length);
    console.log('Report:', reportPath);
    for (const c of changes.slice(0, 25)) {
      console.log('---', c.emp_no, JSON.stringify(c.diff));
    }
    if (changes.length > 25) console.log(`... and ${changes.length - 25} more`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
