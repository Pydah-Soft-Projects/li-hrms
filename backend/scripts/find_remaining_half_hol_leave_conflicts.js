/**
 * Find approved full-day leaves on roster half-holiday days not yet narrowed.
 * Run: node scripts/find_remaining_half_hol_leave_conflicts.js
 * Fix:  FIX_REMAINING=1 node scripts/find_remaining_half_hol_leave_conflicts.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { connectMongoDB, closeMongoDB } = require('../config/database');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const { parseRosterHalfNonWorking } = require('../shifts/utils/rosterHalfNonWorking');
const { getRosterHalfHolidayForEmployeeDate, LEAVE_NARROW_REMARK } = require('../leaves/services/odHalfHolidayRosterService');
const { runLeaveAttendanceReconciliation } = require('../leaves/services/leaveAttendanceReconciliationService');
const { extractISTComponents, createISTDate } = require('../shared/utils/dateUtils');

const HALF_HOL_LEAVE_TAG = '[Half-holiday leave reconcile]';
const FIX = process.env.FIX_REMAINING === '1';

function isFullDayLeave(leave) {
  if (leave.isHalfDay) return false;
  const nd = Number(leave.numberOfDays);
  return Number.isFinite(nd) && nd >= 1 - 1e-6;
}

function alreadyNarrowed(leave) {
  const r = String(leave.remarks || '');
  return r.includes(HALF_HOL_LEAVE_TAG) || r.includes(LEAVE_NARROW_REMARK);
}

async function main() {
  await connectMongoDB();

  const rosterRows = await PreScheduledShift.find({
    $or: [{ firstHalfStatus: 'HOL' }, { secondHalfStatus: 'HOL' }],
    status: { $nin: ['HOL'] },
  })
    .select('employeeNumber date firstHalfStatus secondHalfStatus status shiftId')
    .lean();

  const halfHolDays = rosterRows.filter((row) => {
    const p = parseRosterHalfNonWorking(row);
    return (p.firstHOL || p.secondHOL) && !p.isFullHOL;
  });

  console.log(`\n=== Half-holiday roster rows: ${halfHolDays.length} ===\n`);

  const remaining = [];
  const alreadyOk = [];
  const empCache = new Map();

  for (const row of halfHolDays) {
    const empNo = String(row.employeeNumber || '').toUpperCase();
    const dateStr = String(row.date || '').substring(0, 10);
    if (!empNo || !dateStr) continue;

    const ctx = await getRosterHalfHolidayForEmployeeDate(empNo, dateStr);
    if (!ctx.hasHalfHoliday) continue;

    let emp = empCache.get(empNo);
    if (!emp) {
      emp = await Employee.findOne({ emp_no: empNo }).select('_id emp_no employee_name').lean();
      empCache.set(empNo, emp);
    }
    if (!emp?._id) continue;

    const dayStart = createISTDate(dateStr, '00:00');
    const dayEnd = createISTDate(dateStr, '23:59');
    const leaves = await Leave.find({
      employeeId: emp._id,
      status: 'approved',
      isActive: { $ne: false },
      fromDate: { $lte: dayEnd },
      toDate: { $gte: dayStart },
      isHalfDay: false,
      numberOfDays: { $gte: 1 },
    })
      .select('fromDate toDate isHalfDay halfDayType numberOfDays remarks leaveType status')
      .lean();

    for (const l of leaves) {
      const fromStr = extractISTComponents(l.fromDate).dateStr;
      const toStr = extractISTComponents(l.toDate).dateStr;
      if (fromStr !== dateStr || toStr !== dateStr) continue;
      if (!isFullDayLeave(l)) continue;

      const entry = {
        emp_no: empNo,
        employee_name: emp.employee_name,
        date: dateStr,
        holiday_half: ctx.holidayHalf,
        working_half: ctx.workingHalf,
        leaveType: l.leaveType,
        leaveId: String(l._id),
        remarks: (l.remarks || '').slice(0, 80),
      };

      if (alreadyNarrowed(l)) {
        alreadyOk.push(entry);
      } else {
        remaining.push(entry);
      }
    }
  }

  // Also flag pending/in-approval full-day leaves on half-hol (not yet narrowed at apply)
  const pending = [];
  for (const row of halfHolDays) {
    const empNo = String(row.employeeNumber || '').toUpperCase();
    const dateStr = String(row.date || '').substring(0, 10);
    const emp = empCache.get(empNo) || (await Employee.findOne({ emp_no: empNo }).lean());
    if (!emp?._id) continue;
    const ctx = await getRosterHalfHolidayForEmployeeDate(empNo, dateStr);
    if (!ctx.hasHalfHoliday) continue;

    const dayStart = createISTDate(dateStr, '00:00');
    const dayEnd = createISTDate(dateStr, '23:59');
    const leaves = await Leave.find({
      employeeId: emp._id,
      status: {
        $in: [
          'pending',
          'reporting_manager_approved',
          'hod_approved',
          'manager_approved',
          'hr_approved',
          'principal_approved',
        ],
      },
      isActive: { $ne: false },
      fromDate: { $lte: dayEnd },
      toDate: { $gte: dayStart },
      isHalfDay: false,
      numberOfDays: { $gte: 1 },
    })
      .select('fromDate toDate numberOfDays remarks leaveType status isHalfDay')
      .lean();

    for (const l of leaves) {
      const fromStr = extractISTComponents(l.fromDate).dateStr;
      const toStr = extractISTComponents(l.toDate).dateStr;
      if (fromStr !== dateStr || toStr !== dateStr) continue;
      if (alreadyNarrowed(l)) continue;
      pending.push({
        emp_no: empNo,
        employee_name: emp.employee_name,
        date: dateStr,
        status: l.status,
        leaveType: l.leaveType,
        leaveId: String(l._id),
      });
    }
  }

  console.log('--- NEEDS FIX: Approved full-day leave on half-holiday (not narrowed) ---');
  console.log(`Count: ${remaining.length}\n`);
  if (remaining.length) {
    const byDate = {};
    for (const r of remaining) {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    }
    for (const [date, rows] of Object.entries(byDate).sort()) {
      console.log(`\nDate: ${date} (${rows.length} employee(s))`);
      for (const r of rows.sort((a, b) => a.emp_no.localeCompare(b.emp_no))) {
        console.log(
          `  ${r.emp_no} | ${r.employee_name || '-'} | ${r.leaveType} | hol=${r.holiday_half} → should be leave on ${r.working_half}`
        );
      }
    }
    console.log('\nCSV (emp_no,date,leaveType,holiday_half,working_half):');
    console.log('emp_no,date,leaveType,holiday_half,working_half');
    for (const r of remaining) {
      console.log(`${r.emp_no},${r.date},${r.leaveType},${r.holiday_half},${r.working_half}`);
    }
  }

  console.log(`\n--- Already narrowed / reconciled: ${alreadyOk.length} ---`);

  // Half-day leave on the holiday half (should be rejected)
  const wrongHalfLeave = [];
  for (const row of halfHolDays) {
    const empNo = String(row.employeeNumber || '').toUpperCase();
    const dateStr = String(row.date || '').substring(0, 10);
    const emp = empCache.get(empNo);
    if (!emp?._id) continue;
    const ctx = await getRosterHalfHolidayForEmployeeDate(empNo, dateStr);
    if (!ctx.hasHalfHoliday) continue;
    const dayStart = createISTDate(dateStr, '00:00');
    const dayEnd = createISTDate(dateStr, '23:59');
    const leaves = await Leave.find({
      employeeId: emp._id,
      status: 'approved',
      isActive: { $ne: false },
      isHalfDay: true,
      fromDate: { $lte: dayEnd },
      toDate: { $gte: dayStart },
    })
      .select('halfDayType remarks leaveType fromDate toDate status')
      .lean();
    for (const l of leaves) {
      const fromStr = extractISTComponents(l.fromDate).dateStr;
      if (fromStr !== dateStr) continue;
      const half = l.halfDayType === 'second_half' ? 'second_half' : 'first_half';
      if (half === ctx.holidayHalf && l.status === 'approved') {
        wrongHalfLeave.push({ emp_no: empNo, date: dateStr, halfDayType: half, leaveType: l.leaveType });
      }
    }
  }
  if (wrongHalfLeave.length) {
    console.log(`\n--- Approved half-leave ON holiday half (should reject): ${wrongHalfLeave.length} ---`);
    for (const w of wrongHalfLeave) {
      console.log(`  ${w.emp_no} | ${w.date} | ${w.leaveType} | ${w.halfDayType}`);
    }
  }

  // Already fixed (half-day leave on working half after narrow)
  const fixedNarrowed = await Leave.find({
    remarks: { $regex: HALF_HOL_LEAVE_TAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
  })
    .select('emp_no fromDate toDate isHalfDay halfDayType numberOfDays leaveType remarks')
    .lean();
  console.log(`\n--- Already reconciled (half-hol leave tag in remarks): ${fixedNarrowed.length} ---`);
  for (const f of fixedNarrowed) {
    const d = extractISTComponents(f.fromDate).dateStr;
    console.log(`  ${f.emp_no} | ${d} | ${f.leaveType} | half=${f.isHalfDay} ${f.halfDayType || ''} | ${f.numberOfDays}d`);
  }

  console.log(`\n--- Pending / in-approval full-day (will narrow on reconcile or at apply): ${pending.length} ---`);
  if (pending.length) {
    for (const p of pending.slice(0, 30)) {
      console.log(`  ${p.emp_no} | ${p.date} | ${p.status} | ${p.leaveType}`);
    }
    if (pending.length > 30) console.log(`  ... and ${pending.length - 30} more`);
  }

  if (FIX && remaining.length) {
    console.log('\n--- Fixing remaining approved leaves ---');
    let fixed = 0;
    for (const r of remaining) {
      const emp = empCache.get(r.emp_no) || (await Employee.findOne({ emp_no: r.emp_no }).lean());
      if (!emp) continue;
      const daily = await AttendanceDaily.findOne({
        employeeNumber: r.emp_no,
        date: r.date,
      });
      const recon = await runLeaveAttendanceReconciliation(emp, r.date, daily);
      const hit = recon?.results?.find(
        (x) => x.leaveId && String(x.leaveId) === r.leaveId && x.action === 'narrowed_leave_half_holiday'
      );
      if (hit) fixed += 1;
    }
    console.log(`Fixed: ${fixed} / ${remaining.length}`);
  } else if (remaining.length && !FIX) {
    console.log('\nTip: Run FIX_REMAINING=1 node scripts/find_remaining_half_hol_leave_conflicts.js to auto-narrow.');
  }

  await closeMongoDB();
  process.exit(remaining.length > 0 && !FIX ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await closeMongoDB();
  } catch (_) {}
  process.exit(1);
});
