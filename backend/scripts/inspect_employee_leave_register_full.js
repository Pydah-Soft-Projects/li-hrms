/**
 * Inspect leave register month-wise frontend display fields for one employee.
 * Usage: node scripts/inspect_employee_leave_register_full.js 925 2026
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const Employee = require('../employees/model/Employee');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');

const empNoArg = process.argv[2] || process.env.EMP_NO || '925';
const fyArg = process.argv[3] || process.env.FINANCIAL_YEAR || '2026';

function toMonthView(m) {
  return {
    label: m.label,
    month: m.month,
    year: m.year,
    policyScheduledCl: m.policyScheduledCl ?? null,
    scheduledCl: m.scheduledCl ?? null,
    clUsed: m.cl?.used ?? null,
    clLocked: m.cl?.locked ?? null,
    clTransferIn: m.cl?.transferIn ?? null,
    clTransferOut: m.cl?.transferOut ?? null,
    clPoolBalance: m.cl?.poolBalance ?? null,
    clBalance: m.clBalance ?? null,

    policyScheduledCco: m.policyScheduledCco ?? null,
    scheduledCco: m.scheduledCco ?? null,
    cclUsed: m.ccl?.used ?? null,
    cclLocked: m.ccl?.locked ?? null,
    cclTransferIn: m.ccl?.transferIn ?? null,
    cclTransferOut: m.ccl?.transferOut ?? null,
    cclPoolBalance: m.ccl?.poolBalance ?? null,
    cclBalance: m.cclBalance ?? null,

    policyScheduledEl: m.policyScheduledEl ?? null,
    scheduledEl: m.scheduledEl ?? null,
    elUsed: m.el?.used ?? null,
    elLocked: m.el?.locked ?? null,
    elTransferIn: m.el?.transferIn ?? null,
    elTransferOut: m.el?.transferOut ?? null,
    elPoolBalance: m.el?.poolBalance ?? null,
    elBalance: m.elBalance ?? null,

    monthlyApplyLimit: m.monthlyApplyLimit ?? null,
    monthlyApplyRemaining: m.monthlyApplyRemaining ?? null,
    transactionCount: m.transactionCount ?? 0,
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI missing in backend/.env');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const emp = await Employee.findOne({
    $or: [{ emp_no: String(empNoArg) }, { emp_no: Number(empNoArg) }],
  })
    .select('_id emp_no employee_name is_active doj casualLeaves compensatoryOffs paidLeaves')
    .lean();

  if (!emp) {
    console.log(JSON.stringify({ ok: false, error: 'Employee not found', empNo: empNoArg }, null, 2));
    return;
  }

  const grouped = await leaveRegisterService.getLeaveRegister(
    { employeeId: emp._id, financialYear: String(fyArg).trim() },
    null,
    null
  );
  const row = Array.isArray(grouped) ? grouped[0] : grouped;
  const months = Array.isArray(row?.registerMonths) ? row.registerMonths : [];

  console.log(
    JSON.stringify(
      {
        ok: true,
        employee: {
          id: String(emp._id),
          emp_no: emp.emp_no,
          name: emp.employee_name,
          is_active: emp.is_active,
          doj: emp.doj,
          employeeProfileBalances: {
            casualLeaves: emp.casualLeaves ?? null,
            compensatoryOffs: emp.compensatoryOffs ?? null,
            paidLeaves: emp.paidLeaves ?? null,
          },
        },
        financialYearRequested: String(fyArg).trim(),
        financialYearResolved: row?.yearSnapshot?.financialYear || row?.financialYear || null,
        monthCount: months.length,
        months: months.map(toMonthView),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_) {
      // ignore
    }
  });

