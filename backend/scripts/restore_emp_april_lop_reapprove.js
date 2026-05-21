/**
 * Re-approve half-day leaves wrongly auto-rejected in Apr 2026 cycle; re-run reconciliation.
 * Usage: node scripts/restore_emp_april_lop_reapprove.js --emp=628
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const Leave = require('../leaves/model/Leave');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');
const { _REMARK_PREFIX: REMARK_PREFIX } = require('../leaves/services/leaveAttendanceReconciliationService');
const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
const { extractISTComponents, createISTDate } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');

function parseArgs() {
  const out = { emp: '1613' };
  for (const raw of process.argv.slice(2)) {
    if (raw.startsWith('--emp=')) out.emp = raw.slice(6);
  }
  return out;
}

function stripAutoReconRemarks(remarks) {
  return String(remarks || '')
    .split('\n')
    .filter((line) => !line.includes(REMARK_PREFIX))
    .join('\n')
    .trim();
}

async function main() {
  const args = parseArgs();
  await mongoose.connect(process.env.MONGODB_URI);
  const employee = await Employee.findOne({
    $or: [{ emp_no: args.emp }, { emp_no: String(args.emp).toUpperCase() }],
  }).lean();
  if (!employee) throw new Error(`Employee ${args.emp} not found`);

  const anchor = createISTDate('2026-04-15', '12:00');
  const { payrollCycle } = await dateCycleService.getPeriodInfo(anchor);
  const startDateStr = extractISTComponents(payrollCycle.startDate).dateStr;
  const endDateStr = extractISTComponents(payrollCycle.endDate).dateStr;
  const empNo = String(employee.emp_no).trim().toUpperCase();

  console.log(`=== Employee ${empNo} — restore rejected LOP (Apr 2026 cycle) ===\n`);

  const dayStart = createISTDate(startDateStr, '00:00');
  const dayEnd = createISTDate(endDateStr, '23:59');

  const rejected = await Leave.find({
    employeeId: employee._id,
    status: 'rejected',
    isHalfDay: true,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
    remarks: { $regex: REMARK_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
  }).lean();

  console.log('Rejected half-day leaves with auto-recon remark:', rejected.length);

  for (const row of rejected) {
    const leave = await Leave.findById(row._id);
    if (!leave) continue;
    const dateStr = extractISTComponents(leave.fromDate).dateStr;

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
        comments: 'Restored to approved after HALF_DAY half-detection fix.',
        timestamp: new Date(),
      });
    }
    await leave.save();
    try {
      await leaveRegisterService.addLeaveDebit(leave, null);
    } catch (e) {
      console.warn(dateStr, 'addLeaveDebit:', e.message);
    }
    console.log('Re-approved:', dateStr, leave.leaveType, leave.halfDayType);
  }

  const rows = await AttendanceDaily.find({
    employeeNumber: empNo,
    date: { $gte: startDateStr, $lte: endDateStr },
  })
    .select('date')
    .lean();

  console.log('\nRe-run reconciliation on', rows.length, 'day(s)...');
  for (const row of rows) {
    await recalculateOnAttendanceUpdate(empNo, row.date);
  }

  const leaves = await Leave.find({
    employeeId: employee._id,
    fromDate: { $lte: dayEnd },
    toDate: { $gte: dayStart },
  })
    .select('fromDate toDate status leaveType isHalfDay halfDayType remarks')
    .lean();

  console.log('\nLeaves in cycle:');
  for (const L of leaves) {
    console.log({
      date: extractISTComponents(L.fromDate).dateStr,
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
