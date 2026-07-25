/**
 * FULL WIPE for emp 1434's July 2026 CCL leave flood case.
 *
 * Unlike cleanup_emp1434_july_leave_flood.js (which re-carves eligible days),
 * THIS script:
 *   1. Backs up all July-overlapping leave docs + leave_register_years.
 *   2. Deletes EVERY leave overlapping the July pay period for emp 1434
 *      (original + flood + any carved eligible days like Jul 12/19/24/25).
 *   3. Removes ALL leave_register_years DEBIT/CREDIT rows whose applicationId
 *      points at any of those deleted leave docs (so CCL balance is aligned).
 *   4. Recalculates July monthly attendance summary, pay register, and leave balance
 *      with SKIP_LEAVE_ATTENDANCE_RECONCILIATION=1 so nothing re-creates leave.
 *
 * SAFETY: dry-run by default. Set RUN=1 to mutate.
 *   node scripts/wipe_emp1434_july_ccl_completely.js
 *   RUN=1 node scripts/wipe_emp1434_july_ccl_completely.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
require('../departments/model/Department');
require('../departments/model/Designation');
require('../departments/model/Division');

const dateCycleService = require('../leaves/services/dateCycleService');
const leaveBalanceService = require('../leaves/services/leaveBalanceService');
const { extractISTComponents } = require('../shared/utils/dateUtils');

const EMP_NO = '1434';
const YEAR = 2026;
const MONTH = 7;
const DRY_RUN = process.env.RUN !== '1';

function summarizeCcl(yearDoc) {
  let debitDays = 0;
  let creditDays = 0;
  let julyAppRows = 0;
  const rows = [];
  for (const slot of yearDoc?.months || []) {
    for (const tx of slot.transactions || []) {
      if (String(tx.leaveType || '').toUpperCase() !== 'CCL') continue;
      const days = Number(tx.days) || 0;
      const t = String(tx.transactionType || '').toUpperCase();
      if (t === 'DEBIT') debitDays += days;
      if (t === 'CREDIT') creditDays += days;
      rows.push({
        slot: slot.month || slot.monthNumber,
        type: t,
        days,
        app: tx.applicationId ? String(tx.applicationId) : null,
      });
    }
  }
  return { debitDays, creditDays, rowCount: rows.length, rows, julyAppRows };
}

async function run() {
  // Never let reconciliation recreate leave during this wipe/recalc.
  process.env.SKIP_LEAVE_ATTENDANCE_RECONCILIATION = '1';

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB:', mongoose.connection.name, '| MODE:', DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE');

  const emp = await Employee.findOne({ emp_no: EMP_NO }).lean();
  if (!emp) throw new Error('Employee 1434 not found');

  const pc = await dateCycleService.getPayrollCycleForMonth(YEAR, MONTH);
  const startStr = extractISTComponents(pc.startDate).dateStr;
  const endStr = extractISTComponents(pc.endDate).dateStr;
  console.log('Pay period:', startStr, '..', endStr);

  const julyLeaves = await Leave.find({
    $or: [{ emp_no: EMP_NO }, { employeeId: emp._id }],
    fromDate: { $lte: new Date(`${endStr}T23:59:59+05:30`) },
    toDate: { $gte: new Date(`${startStr}T00:00:00+05:30`) },
  }).lean();

  const leaveIds = julyLeaves.map((l) => l._id);
  const leaveIdSet = new Set(leaveIds.map(String));

  console.log(`\nLeaves overlapping July period: ${julyLeaves.length}`);
  julyLeaves.forEach((l) =>
    console.log({
      id: String(l._id),
      from: extractISTComponents(l.fromDate).dateStr,
      to: extractISTComponents(l.toDate).dateStr,
      type: l.leaveType,
      status: l.status,
      days: l.numberOfDays,
    })
  );

  const yearsBefore = await LeaveRegisterYear.find({ employeeId: emp._id }).lean();
  console.log('\nCCL ledger BEFORE:');
  for (const y of yearsBefore) {
    const s = summarizeCcl(y);
    const tied = s.rows.filter((r) => r.app && leaveIdSet.has(r.app));
    console.log({ fy: y.financialYear, cclDebitDays: s.debitDays, cclCreditDays: s.creditDays, cclRows: s.rowCount, rowsTiedToJulyLeaves: tied.length });
  }

  const backupDir = path.resolve(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `emp1434_july_ccl_full_wipe_backup_${Date.now()}.json`);

  if (DRY_RUN) {
    console.log('\n[dry-run] would back up', julyLeaves.length, 'leaves +', yearsBefore.length, 'ledger year docs ->', backupPath);
    console.log('[dry-run] would DELETE ALL', julyLeaves.length, 'July-overlapping leave docs');
    console.log('[dry-run] would PURGE ledger rows whose applicationId is one of those leave ids');
    console.log('[dry-run] would recalc July summary + pay register + leave balance (recon skipped)');
    await mongoose.disconnect();
    return;
  }

  fs.writeFileSync(
    backupPath,
    JSON.stringify({ emp: { _id: emp._id, emp_no: emp.emp_no }, julyLeaves, years: yearsBefore }, null, 2)
  );
  console.log('\nBackup written:', backupPath);

  // 1) Delete every leave overlapping July for this employee
  const del = await Leave.deleteMany({ _id: { $in: leaveIds } });
  console.log('Deleted leave docs:', del.deletedCount);

  // 2) Purge ledger rows tied to those application ids (DEBIT and CREDIT)
  let purged = 0;
  for (const y of await LeaveRegisterYear.find({ employeeId: emp._id })) {
    let changed = false;
    for (const slot of y.months || []) {
      const before = (slot.transactions || []).length;
      slot.transactions = (slot.transactions || []).filter((tx) => {
        const appId = tx.applicationId ? String(tx.applicationId) : null;
        return !(appId && leaveIdSet.has(appId));
      });
      const after = slot.transactions.length;
      if (after !== before) {
        purged += before - after;
        changed = true;
      }
    }
    if (changed) {
      y.markModified('months');
      await y.save();
    }
  }
  console.log('Purged ledger rows tied to deleted leaves:', purged);

  // 3) Recalc summary / pay register / balance with recon skipped
  const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');
  await calculateMonthlySummary(emp._id, EMP_NO, YEAR, MONTH, {
    startDateStr: startStr,
    endDateStr: endStr,
  });

  try {
    // Rebuild pay register for the period after leaves are gone (recon is skipped via env).
    const { syncPayRegisterFromLeave } = require('../pay-register/services/autoSyncService');
    await syncPayRegisterFromLeave({
      employeeId: emp._id,
      emp_no: EMP_NO,
      fromDate: pc.startDate,
      toDate: pc.endDate,
    });
  } catch (e) {
    console.warn('pay register sync warning:', e?.message);
  }

  try {
    await leaveBalanceService.recalculateMonthlyRecord(emp._id, `${YEAR}-${String(MONTH).padStart(2, '0')}`);
  } catch (e) {
    console.warn('balance recalc warning:', e?.message);
  }

  // 4) Final verification
  const left = await Leave.find({
    $or: [{ emp_no: EMP_NO }, { employeeId: emp._id }],
    fromDate: { $lte: new Date(`${endStr}T23:59:59+05:30`) },
    toDate: { $gte: new Date(`${startStr}T00:00:00+05:30`) },
  }).lean();
  console.log(`\n=== FINAL leave docs overlapping July: ${left.length} (expected 0) ===`);

  const yearsAfter = await LeaveRegisterYear.find({ employeeId: emp._id }).lean();
  console.log('CCL ledger AFTER:');
  for (const y of yearsAfter) {
    const s = summarizeCcl(y);
    const tied = s.rows.filter((r) => r.app && leaveIdSet.has(r.app));
    console.log({ fy: y.financialYear, cclDebitDays: s.debitDays, cclCreditDays: s.creditDays, cclRows: s.rowCount, rowsStillTiedToWipedLeaves: tied.length });
  }

  const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
  const summary = await MonthlyAttendanceSummary.findOne({
    $or: [{ employeeId: emp._id }, { emp_no: EMP_NO }],
    month: `${YEAR}-${String(MONTH).padStart(2, '0')}`,
  }).lean();
  console.log('MonthlyAttendanceSummary 2026-07:', {
    totalPresentDays: summary?.totalPresentDays,
    totalLeaves: summary?.totalLeaves,
    totalAbsentDays: summary?.totalAbsentDays,
    leaveDates: (summary?.contributingDates?.leaves || []).map((x) => x.date),
  });

  await mongoose.disconnect();
  // Redis may keep the process alive; force exit after work is done.
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
