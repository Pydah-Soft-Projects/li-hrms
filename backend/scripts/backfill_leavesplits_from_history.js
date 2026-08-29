/**
 * Backfill LeaveSplit rows from leave.splitHistory when splits are missing locally.
 * Usage: node scripts/backfill_leavesplits_from_history.js [--apply]
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Leave = require('../leaves/model/Leave');
const LeaveSplit = require('../leaves/model/LeaveSplit');
const Employee = require('../employees/model/Employee');
const { getLeaveNature } = require('../leaves/services/leaveBalanceService');
const { getFinancialYear } = require('../leaves/services/leaveBalanceService');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const apply = hasFlag('apply');
  await mongoose.connect(process.env.MONGODB_URI);

  const leaves = await Leave.find({
    splitStatus: 'split_approved',
    isActive: { $ne: false },
  }).lean();

  const results = [];
  for (const leave of leaves) {
    const existing = await LeaveSplit.countDocuments({ leaveId: leave._id });
    if (existing > 0) continue;

    const history = Array.isArray(leave.splitHistory) ? leave.splitHistory : [];
    const latest = history.length ? history[history.length - 1] : null;
    const splitRows = latest?.splits || [];
    if (!splitRows.length) {
      results.push({ leaveId: String(leave._id), emp_no: leave.emp_no, status: 'skip_no_history' });
      continue;
    }

    const row = {
      leaveId: String(leave._id),
      emp_no: leave.emp_no,
      status: apply ? 'backfilled' : 'would_backfill',
      splits: splitRows.map((s) => ({
        date: s.date,
        leaveType: s.leaveType,
        status: s.status,
        numberOfDays: s.numberOfDays,
      })),
    };
    results.push(row);

    if (!apply) continue;

    const emp = await Employee.findById(leave.employeeId).select('emp_no').lean();
    const financialYear = await getFinancialYear(new Date(leave.fromDate));
    for (const s of splitRows) {
      const splitDate = new Date(s.date);
      const year = splitDate.getFullYear();
      const monthNum = splitDate.getMonth() + 1;
      const month = `${year}-${String(monthNum).padStart(2, '0')}`;
      const nature = await getLeaveNature(s.leaveType);
      await LeaveSplit.create({
        leaveId: leave._id,
        employeeId: leave.employeeId,
        emp_no: emp?.emp_no || leave.emp_no,
        date: splitDate,
        leaveType: String(s.leaveType).toUpperCase(),
        leaveNature: nature,
        isHalfDay: !!s.isHalfDay,
        halfDayType: s.halfDayType || null,
        status: s.status || 'approved',
        originalLeaveType: String(leave.originalLeaveType || leave.leaveType).toUpperCase(),
        numberOfDays: s.numberOfDays || (s.isHalfDay ? 0.5 : 1),
        splitBy: latest.actionBy,
        splitByName: latest.actionByName,
        splitByRole: latest.actionByRole,
        splitAt: latest.actionAt ? new Date(latest.actionAt) : new Date(),
        financialYear,
        month,
      });
    }
  }

  console.log(JSON.stringify({ apply, count: results.length, results }, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
