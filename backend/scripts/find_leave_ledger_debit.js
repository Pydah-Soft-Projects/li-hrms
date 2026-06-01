const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Employee = require('../employees/model/Employee');
const Leave = require('../leaves/model/Leave');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');

async function main() {
  const leaveId = process.argv[2] || '69be25713cd79cf6f1033828';
  await mongoose.connect(process.env.MONGODB_URI);

  const leave = await Leave.findById(leaveId)
    .select('_id employeeId leaveType status fromDate toDate numberOfDays reason appliedAt')
    .lean();
  const emp = leave ? await Employee.findById(leave.employeeId).select('emp_no employee_name').lean() : null;
  const doc = leave
    ? await LeaveRegisterYear.findOne({ employeeId: leave.employeeId, financialYear: '2026' }).lean()
    : null;

  const debitHits = [];
  for (const slot of doc?.months || []) {
    for (const tx of slot.transactions || []) {
      if (String(tx.applicationId) === String(leaveId)) {
        debitHits.push({
          month: `${slot.payrollCycleMonth}/${slot.payrollCycleYear}`,
          days: tx.days,
          type: tx.transactionType,
          reason: tx.reason,
          date: tx.startDate || tx.at,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        leave: leave
          ? {
              id: String(leave._id),
              employee: emp ? `${emp.emp_no} ${emp.employee_name}` : null,
              type: leave.leaveType,
              status: leave.status,
              days: leave.numberOfDays,
              fromDate: leave.fromDate,
              toDate: leave.toDate,
              appliedAt: leave.appliedAt,
              reason: leave.reason || '',
            }
          : null,
        ledgerDebitsForThisLeave: debitHits,
        hasLedgerDebitInMarch: debitHits.some((h) => h.month === '3/2026'),
        note:
          debitHits.length === 0
            ? 'This approved leave has NO debit posted in leave register ledger — transfer still counts it from Leave record; UI Used may show 0.'
            : undefined,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
