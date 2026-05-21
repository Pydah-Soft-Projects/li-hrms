/**
 * Re-approve two LOP half-days wrongly auto-rejected for emp 1613 (Apr 2026 cycle), then re-run reconciliation.
 * Usage: node scripts/restore_emp1613_april_lop_reapprove.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const Leave = require('../leaves/model/Leave');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');
const { _REMARK_PREFIX: REMARK_PREFIX } = require('../leaves/services/leaveAttendanceReconciliationService');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
const { extractISTComponents } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');
const { createISTDate } = require('../shared/utils/dateUtils');

const EMP = '1613';
const DATES = ['2026-03-30', '2026-04-13'];

function stripAutoReconRemarks(remarks) {
  const prefix = REMARK_PREFIX;
  return String(remarks || '')
    .split('\n')
    .filter((line) => !line.includes(prefix))
    .join('\n')
    .trim();
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const employee = await Employee.findOne({ emp_no: EMP }).lean();
  if (!employee) throw new Error('Employee 1613 not found');

  console.log('=== Re-approve wrongly rejected LOP half-days ===\n');

  for (const dateStr of DATES) {
    const leave = await Leave.findOne({
      employeeId: employee._id,
      status: 'rejected',
      fromDate: { $lte: createISTDate(dateStr, '23:59') },
      toDate: { $gte: createISTDate(dateStr, '00:00') },
      isHalfDay: true,
    });
    if (!leave) {
      console.log(dateStr, ': no rejected half-day leave found (may already be approved)');
      continue;
    }

    leave.status = 'approved';
    leave.remarks = stripAutoReconRemarks(leave.remarks);
    if (leave.workflow) {
      leave.workflow.isCompleted = true;
      leave.workflow.currentStepRole = null;
      leave.workflow.nextApprover = null;
      leave.workflow.nextApproverRole = null;
      leave.workflow.history = leave.workflow.history || [];
      leave.workflow.history.push({
        action: 'approved',
        comments: 'Restored to approved after HALF_DAY half-detection fix (opposite-half LOP was valid).',
        timestamp: new Date(),
      });
    }
    await leave.save();

    try {
      await leaveRegisterService.addLeaveDebit(leave, null);
    } catch (e) {
      console.warn(dateStr, 'addLeaveDebit:', e.message);
    }

    console.log('Re-approved:', dateStr, leave.leaveType, leave.halfDayType, leave._id.toString());
  }

  const anchor = createISTDate('2026-04-15', '12:00');
  const { payrollCycle } = await dateCycleService.getPeriodInfo(anchor);
  const startDateStr = extractISTComponents(payrollCycle.startDate).dateStr;
  const endDateStr = extractISTComponents(payrollCycle.endDate).dateStr;
  const empNo = String(employee.emp_no).trim().toUpperCase();

  const rows = await AttendanceDaily.find({
    employeeNumber: empNo,
    date: { $gte: startDateStr, $lte: endDateStr },
  })
    .select('date')
    .lean();

  console.log('\n=== Re-run reconciliation (', rows.length, 'days) ===\n');
  for (const row of rows) {
    await recalculateOnAttendanceUpdate(empNo, row.date);
  }

  const leaves = await Leave.find({
    employeeId: employee._id,
    fromDate: { $lte: createISTDate(endDateStr, '23:59') },
    toDate: { $gte: createISTDate(startDateStr, '00:00') },
  })
    .select('fromDate toDate status leaveType isHalfDay halfDayType remarks')
    .lean();

  console.log('Leaves after fix:');
  for (const L of leaves) {
    const d = extractISTComponents(L.fromDate).dateStr;
    console.log({
      date: d,
      status: L.status,
      type: L.leaveType,
      half: L.isHalfDay ? L.halfDayType : 'full',
      hasReconRemark: String(L.remarks || '').includes(REMARK_PREFIX),
    });
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
