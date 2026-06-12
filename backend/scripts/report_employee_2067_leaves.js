/**
 * Full leave report for employee 2067: register balances, monthly summary,
 * per-leave register DEBITs, and before/after simulation per operation type.
 *
 * Usage: node scripts/report_employee_2067_leaves.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const EMP_NO = process.argv[2] || '2067';

function fmt(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toISOString().slice(0, 10);
}

async function payrollMonthsForLeave(leave) {
  const dateCycleService = require('../leaves/services/dateCycleService');
  const { payrollCycle: startCycle } = await dateCycleService.getPeriodInfo(leave.fromDate);
  const { payrollCycle: endCycle } = await dateCycleService.getPeriodInfo(leave.toDate);
  const months = [];
  let y = startCycle.year;
  let m = startCycle.month;
  while (y < endCycle.year || (y === endCycle.year && m <= endCycle.month)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (m === 12) {
      m = 1;
      y += 1;
    } else m += 1;
  }
  return [...new Set(months)];
}

async function getRegisterSnapshot(employeeId, fyName) {
  const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
  const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
  const doc = await LeaveRegisterYear.findOne({ employeeId, financialYear: fyName }).lean();
  const balances = {};
  for (const lt of ['CL', 'EL', 'CCL', 'LOP']) {
    try {
      balances[lt] = await leaveRegisterYearLedgerService.getCurrentBalance(employeeId, lt);
    } catch {
      balances[lt] = null;
    }
  }
  const allDebits = [];
  for (const slot of doc?.months || []) {
    for (const tx of slot.transactions || []) {
      if (String(tx.transactionType || '').toUpperCase() !== 'DEBIT') continue;
      allDebits.push({
        leaveType: tx.leaveType,
        days: tx.days,
        opening: tx.openingBalance,
        closing: tx.closingBalance,
        start: fmt(tx.startDate),
        end: fmt(tx.endDate),
        appId: tx.applicationId ? String(tx.applicationId) : null,
        slot: `${slot.payrollCycleYear}-${String(slot.payrollCycleMonth).padStart(2, '0')}`,
        monthlyApplyApproved: slot.monthlyApplyApproved,
        monthlyApplyConsumed: slot.monthlyApplyConsumed,
      });
    }
  }
  return { balances, allDebits, slots: (doc?.months || []).map((s) => ({
    slot: `${s.payrollCycleYear}-${String(s.payrollCycleMonth).padStart(2, '0')}`,
    clCredits: s.clCredits,
    monthlyApplyApproved: s.monthlyApplyApproved,
    monthlyApplyConsumed: s.monthlyApplyConsumed,
    debitCount: (s.transactions || []).filter((t) => String(t.transactionType).toUpperCase() === 'DEBIT').length,
  })) };
}

async function getAttendanceSnapshots(employeeId, months) {
  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  const out = {};
  for (const month of months) {
    const ms = await MonthlyAttendanceSummary.findOne({ employeeId, month }).lean();
    out[month] = ms
      ? {
          present: ms.totalPresentDays,
          absent: ms.totalAbsentDays,
          leaves: ms.totalLeaves,
          paid: ms.totalPaidLeaves,
          lop: ms.totalLopLeaves,
          weeklyOff: ms.totalWeeklyOffs,
          holidays: ms.totalHolidays,
        }
      : null;
  }
  return out;
}

async function snapshotRestoreDocs(employeeId, months) {
  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
  const ms = await MonthlyAttendanceSummary.find({ employeeId, month: { $in: months } }).lean();
  const pr = await PayRegisterSummary.find({ employeeId, month: { $in: months } }).lean();
  return { ms, pr };
}

async function restoreDocs(employeeId, months, snap) {
  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
  await MonthlyAttendanceSummary.deleteMany({ employeeId, month: { $in: months } });
  await PayRegisterSummary.deleteMany({ employeeId, month: { $in: months } });
  if (snap.ms.length) await MonthlyAttendanceSummary.insertMany(snap.ms);
  if (snap.pr.length) await PayRegisterSummary.insertMany(snap.pr);
}

function diffSummary(before, after) {
  const changes = [];
  const keys = ['present', 'absent', 'leaves', 'paid', 'lop', 'weeklyOff', 'holidays'];
  for (const m of Object.keys({ ...before, ...after })) {
    for (const k of keys) {
      const b = before[m]?.[k];
      const a = after[m]?.[k];
      if (b !== a && (b != null || a != null)) {
        changes.push({ month: m, field: k, before: b ?? '—', after: a ?? '—', delta: (Number(a) || 0) - (Number(b) || 0) });
      }
    }
  }
  return changes;
}

async function simulateNewPath(leaveSnap, options = {}) {
  const { runLeaveStatusSideEffects } = require('../leaves/services/leaveApprovalSideEffectsService');
  await runLeaveStatusSideEffects(leaveSnap, options);
}

async function simulateOldPath(leaveSnap) {
  const { recalculateOnLeaveApproval } = require('../attendance/services/summaryCalculationService');
  const { syncPayRegisterFromLeave } = require('../pay-register/services/autoSyncService');
  const pr = new Set(['approved', 'hod_approved', 'hr_approved', 'rejected', 'cancelled']);
  if (leaveSnap.status === 'approved') await recalculateOnLeaveApproval(leaveSnap);
  if (pr.has(leaveSnap.status)) await syncPayRegisterFromLeave(leaveSnap);
}

function leaveSnap(leave) {
  return {
    _id: leave._id,
    employeeId: leave.employeeId,
    emp_no: leave.emp_no,
    fromDate: leave.fromDate,
    toDate: leave.toDate,
    status: leave.status,
    leaveType: leave.leaveType,
  };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  require('../departments/model/Department');
  const Employee = require('../employees/model/Employee');
  const Leave = require('../leaves/model/Leave');
  const dateCycleService = require('../leaves/services/dateCycleService');

  const emp = await Employee.findOne({ emp_no: EMP_NO }).lean();
  if (!emp) {
    console.error(`Employee ${EMP_NO} not found`);
    process.exit(1);
  }
  const employeeId = String(emp._id);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`EMPLOYEE ${EMP_NO} — ${emp.employee_name || emp.first_name || ''}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  const fy = await dateCycleService.getFinancialYearForDate(new Date());
  const reg = await getRegisterSnapshot(employeeId, fy.name);

  console.log('--- CURRENT LEAVE REGISTER BALANCES ---');
  console.log(JSON.stringify(reg.balances, null, 2));

  console.log('\n--- REGISTER SLOTS (monthly apply) ---');
  console.table(reg.slots.filter((s) => s.monthlyApplyApproved > 0 || s.debitCount > 0 || s.clCredits > 0).slice(0, 12));

  const leaves = await Leave.find({ employeeId: emp._id, isActive: { $ne: false } })
    .sort({ updatedAt: -1 })
    .lean();

  const allPayMonths = new Set();
  for (const l of leaves) {
    for (const m of await payrollMonthsForLeave(l)) allPayMonths.add(m);
  }
  const payMonths = [...allPayMonths].sort();

  console.log('\n--- CURRENT MONTHLY ATTENDANCE SUMMARY (all touched payroll months) ---');
  const currentSummary = await getAttendanceSnapshots(employeeId, payMonths);
  console.log(JSON.stringify(currentSummary, null, 2));

  console.log(`\n--- LEAVES FOR EMP ${EMP_NO} (${leaves.length} active) ---`);
  for (const l of leaves) {
    console.log(
      `  ${String(l._id).slice(-8)} | ${l.status.padEnd(14)} | ${String(l.leaveType).padEnd(4)} | ${fmt(l.fromDate)} → ${fmt(l.toDate)} | ${l.numberOfDays}d`
    );
  }

  console.log('\n--- PER-LEAVE: REGISTER DEBIT + MONTHLY SUMMARY (current DB) ---\n');

  const byStatus = {};
  for (const leave of leaves) {
    const statusKey = leave.status;
    if (!byStatus[statusKey]) byStatus[statusKey] = [];
    byStatus[statusKey].push(leave);
  }

  for (const leave of leaves.slice(0, 8)) {
    const months = await payrollMonthsForLeave(leave);
    const debits = reg.allDebits.filter((d) => d.appId === String(leave._id));
    const summaryForLeave = {};
    for (const m of months) summaryForLeave[m] = currentSummary[m];

    console.log(`▶ Leave ${leave._id}`);
    console.log(`  Status: ${leave.status} | Type: ${leave.leaveType} | ${fmt(leave.fromDate)} → ${fmt(leave.toDate)} | ${leave.numberOfDays} days`);
    console.log(`  Register DEBIT for this app:`, debits.length ? debits : '(none)');
    console.log(`  Monthly attendance summary:`, summaryForLeave);

    const snap = leaveSnap(leave);
    const docSnap = await snapshotRestoreDocs(employeeId, months);
    const beforeSummary = await getAttendanceSnapshots(employeeId, months);
    const beforeReg = await getRegisterSnapshot(employeeId, fy.name);

    try {
      await simulateNewPath(snap);
      const afterNewSummary = await getAttendanceSnapshots(employeeId, months);
      const changesNew = diffSummary(beforeSummary, afterNewSummary);
      console.log(`  [SIMULATE present path] Monthly summary changes:`, changesNew.length ? changesNew : '(no change)');
      await restoreDocs(employeeId, months, docSnap);

      await simulateOldPath(snap);
      const afterOldSummary = await getAttendanceSnapshots(employeeId, months);
      const changesOld = diffSummary(beforeSummary, afterOldSummary);
      console.log(`  [SIMULATE previous path] Monthly summary changes:`, changesOld.length ? changesOld : '(no change)');
    } finally {
      await restoreDocs(employeeId, months, docSnap);
    }
    console.log('');
  }

  console.log('--- ALL REGISTER DEBITS FOR THIS EMPLOYEE ---');
  console.table(reg.allDebits.slice(0, 25));

  console.log('\nDone.\n');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
