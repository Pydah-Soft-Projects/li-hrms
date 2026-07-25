/**
 * One-off cleanup for emp 1434's July 2026 CCL leave flood.
 *
 * WHAT IT DOES (in order):
 *   1. Snapshots every July-overlapping leave + the leave_register_years doc to a backup JSON.
 *   2. Hard-deletes the ~997 reconciliation-created flood leave docs.
 *   3. Purges leave_register_years DEBIT rows that reference any of those July leave ids.
 *   4. Restores the single original application (Jul 8..25 CCL) to a clean APPROVED state.
 *   5. Re-posts the original leave debit, then runs the (now loop-safe) reconciliation once.
 *   6. Recalculates the monthly attendance summary, pay register and leave balance.
 *   7. Prints the final state for verification.
 *
 * SAFETY: read-only dry run by default. Set RUN=1 to actually mutate.
 *   MONGODB_URI=mongodb://127.0.0.1:27017/ravi-1 RUN=1 node scripts/cleanup_emp1434_july_leave_flood.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
// Register referenced models so populate() inside register/reconcile services works.
require('../departments/model/Department');
require('../departments/model/Designation');
require('../departments/model/Division');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');
const leaveBalanceService = require('../leaves/services/leaveBalanceService');
const dateCycleService = require('../leaves/services/dateCycleService');
const { extractISTComponents, getAllDatesInRange } = require('../shared/utils/dateUtils');

const EMP_NO = '1434';
const YEAR = 2026;
const MONTH = 7;
const FLOOD_START = new Date('2026-07-25T00:00:00Z');
const ORIGINAL_ID = '6a60ac787aac1ab1251b89c7';
const DRY_RUN = process.env.RUN !== '1';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB:', mongoose.connection.name, '| MODE:', DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE');
  const emp = await Employee.findOne({ emp_no: EMP_NO }).lean();
  if (!emp) throw new Error('Employee 1434 not found');

  const pc = await dateCycleService.getPayrollCycleForMonth(YEAR, MONTH);
  const startStr = extractISTComponents(pc.startDate).dateStr;
  const endStr = extractISTComponents(pc.endDate).dateStr;

  const july = await Leave.find({
    $or: [{ emp_no: EMP_NO }, { employeeId: emp._id }],
    fromDate: { $lte: new Date('2026-07-25T23:59:59Z') },
    toDate: { $gte: new Date('2026-06-26T00:00:00Z') },
  }).lean();

  const original = july.find((l) => String(l._id) === ORIGINAL_ID) ||
    july.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
  const floodDocs = july.filter((l) => String(l._id) !== String(original._id));
  const floodIds = floodDocs.map((d) => d._id);
  const allJulyIds = new Set(july.map((d) => String(d._id)));

  console.log(`\nJuly leaves: ${july.length} | original kept: ${original._id} | to delete (flood): ${floodDocs.length}`);
  console.log('Pay period:', startStr, '..', endStr);

  // 1) Snapshot backup
  const backupDir = path.resolve(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const years = await LeaveRegisterYear.find({ employeeId: emp._id }).lean();
  const backupPath = path.join(backupDir, `emp1434_july_flood_backup_${Date.now()}.json`);
  if (!DRY_RUN) {
    fs.writeFileSync(backupPath, JSON.stringify({ emp: { _id: emp._id, emp_no: emp.emp_no }, july, years }, null, 2));
    console.log('Backup written:', backupPath);
  } else {
    console.log('[dry-run] would back up', july.length, 'leaves +', years.length, 'ledger year docs');
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] would DELETE', floodDocs.length, 'flood leaves');
    console.log('[dry-run] would PURGE ledger DEBIT rows referencing any of', allJulyIds.size, 'July leave ids');
    console.log('[dry-run] would RESTORE original', String(original._id), 'to approved CCL', 
      extractISTComponents(original.fromDate).dateStr, '..', extractISTComponents(original.toDate).dateStr);
    console.log('[dry-run] would re-run reconciliation + recalc summary/pay-register/balance');
    await mongoose.disconnect();
    return;
  }

  // 2) Delete flood docs
  const del = await Leave.deleteMany({ _id: { $in: floodIds } });
  console.log('Deleted flood leaves:', del.deletedCount);

  // 3) Purge ledger DEBIT rows referencing any July leave id
  let purged = 0;
  for (const y of await LeaveRegisterYear.find({ employeeId: emp._id })) {
    let changed = false;
    for (const slot of y.months || []) {
      const before = (slot.transactions || []).length;
      slot.transactions = (slot.transactions || []).filter((tx) => {
        const appId = tx.applicationId ? String(tx.applicationId) : null;
        const isDebit = String(tx.transactionType || '').toUpperCase() === 'DEBIT';
        const drop = isDebit && appId && allJulyIds.has(appId);
        return !drop;
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
  console.log('Purged ledger DEBIT rows:', purged);

  // 4) Restore original to clean approved state
  const leave = await Leave.findById(original._id);
  const reconRemarkLines = String(leave.remarks || '')
    .split('\n')
    .filter((ln) => !ln.includes('[Auto attendance reconciliation]'))
    .join('\n')
    .trim();
  leave.status = 'approved';
  leave.isActive = true;
  leave.splitStatus = null;
  leave.remarks = reconRemarkLines || null;
  leave.changeHistory = [];
  if (leave.workflow) {
    leave.workflow.isCompleted = true;
    leave.workflow.currentStep = 'completed';
    leave.workflow.currentStepRole = null;
    leave.workflow.nextApprover = null;
    leave.workflow.nextApproverRole = null;
    leave.workflow.history = (leave.workflow.history || []).filter(
      (h) => !String(h.comments || '').includes('[Auto attendance reconciliation]')
    );
  }
  leave.$locals = leave.$locals || {};
  leave.$locals.skipReconcileSideEffects = true; // we drive recalc explicitly below
  await leave.save();
  console.log('Restored original leave to approved:',
    extractISTComponents(leave.fromDate).dateStr, '..', extractISTComponents(leave.toDate).dateStr,
    `(${leave.numberOfDays}d)`);

  // 5) Re-post its debit, then run the fixed reconciliation once for the pay period
  try {
    await leaveRegisterService.addLeaveDebit(leave, null);
  } catch (e) {
    console.warn('addLeaveDebit warning:', e?.message);
  }

  const empDoc = await Employee.findById(emp._id);
  const { reconcileEmployeePayPeriodBeforeSummary } = require('../leaves/services/leaveAttendanceReconciliationService');
  const reconRes = await reconcileEmployeePayPeriodBeforeSummary(empDoc, startStr, endStr);
  console.log('Reconciliation days processed:', reconRes.daysProcessed);

  // 6) Recalc summary + pay register + leave balance
  const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');
  await calculateMonthlySummary(emp._id, EMP_NO, YEAR, MONTH, { startDateStr: startStr, endDateStr: endStr });
  try {
    const { syncPayRegisterFromLeave } = require('../pay-register/services/autoSyncService');
    await syncPayRegisterFromLeave({ employeeId: emp._id, emp_no: EMP_NO, fromDate: leave.fromDate, toDate: leave.toDate });
  } catch (e) {
    console.warn('pay register sync warning:', e?.message);
  }
  try {
    await leaveBalanceService.recalculateMonthlyRecord(emp._id, `${YEAR}-${String(MONTH).padStart(2, '0')}`);
  } catch (e) {
    console.warn('balance recalc warning:', e?.message);
  }

  // 7) Final state
  const finalLeaves = await Leave.find({
    $or: [{ emp_no: EMP_NO }, { employeeId: emp._id }],
    fromDate: { $lte: new Date('2026-07-25T23:59:59Z') },
    toDate: { $gte: new Date('2026-06-26T00:00:00Z') },
  })
    .sort({ fromDate: 1, status: 1 })
    .lean();
  const approved = finalLeaves.filter((l) => l.status === 'approved' && l.isActive !== false);
  console.log(`\n=== FINAL leaves overlapping period: ${finalLeaves.length} (approved: ${approved.length}) ===`);
  finalLeaves.forEach((l) =>
    console.log({
      from: extractISTComponents(l.fromDate).dateStr,
      to: extractISTComponents(l.toDate).dateStr,
      status: l.status,
      days: l.numberOfDays,
    })
  );
  const approvedDates = new Set();
  approved.forEach((l) => getAllDatesInRange(extractISTComponents(l.fromDate).dateStr, extractISTComponents(l.toDate).dateStr).forEach((d) => {
    if (d >= startStr && d <= endStr) approvedDates.add(d);
  }));
  console.log('Approved CCL calendar days in period:', [...approvedDates].sort());

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
