/**
 * Human-readable transfer chain report for specific emp nos (ended payroll months only).
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');
const { isPayrollPeriodEndedOnOrBeforeAsOf } = require('../leaves/services/leaveRegisterYearService');

const EMP_NOS =
  String(process.argv[2] || '06,128,71,5008,1823,2067,1644,1724,166,2163')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const FY = String(process.argv[3] || '2026');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const reports = [];

  for (const empNo of EMP_NOS) {
    const emp = await Employee.findOne({
      $or: [{ emp_no: String(empNo) }, { emp_no: Number(empNo) }],
    })
      .select('_id emp_no employee_name')
      .lean();
    if (!emp) {
      reports.push({ empNo, error: 'not_found' });
      continue;
    }

    const grouped = await leaveRegisterService.getLeaveRegister(
      { employeeId: emp._id, financialYear: FY },
      null,
      null
    );
    const row = Array.isArray(grouped) ? grouped[0] : grouped;
    const months = row?.registerMonths || [];
    const chain = [];
    let chainOk = true;

    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      const ended =
        m.payPeriodEnd && isPayrollPeriodEndedOnOrBeforeAsOf(m.payPeriodEnd, new Date());
      if (!ended) continue;

      const clOut = Number(m.cl?.transferOut ?? 0);
      const clIn = Number(m.cl?.transferIn ?? 0);
      const cclOut = Number(m.ccl?.transferOut ?? 0);
      const cclIn = Number(m.ccl?.transferIn ?? 0);
      const prev = i > 0 ? months[i - 1] : null;
      const prevEnded =
        prev?.payPeriodEnd &&
        isPayrollPeriodEndedOnOrBeforeAsOf(prev.payPeriodEnd, new Date());

      let note = '';
      if (prev && prevEnded) {
        const prevClOut = Number(prev.cl?.transferOut ?? 0);
        const prevCclOut = Number(prev.ccl?.transferOut ?? 0);
        if (prevClOut !== clIn) {
          chainOk = false;
          note += `CL chain break: prior out ${prevClOut} ≠ in ${clIn}. `;
        }
        if (prevCclOut !== cclIn) {
          chainOk = false;
          note += `CCL chain break: prior out ${prevCclOut} ≠ in ${cclIn}. `;
        }
      }

      chain.push({
        month: `${m.month}/${m.year}`,
        label: m.label,
        cl: { cr: m.scheduledCl, used: m.cl?.used, in: clIn, out: clOut, bal: m.clBalance },
        ccl: { cr: m.scheduledCco, used: m.ccl?.used, in: cclIn, out: cclOut, bal: m.cclBalance },
        ok: !note,
        note: note.trim() || undefined,
      });
    }

    reports.push({
      empNo: emp.emp_no,
      name: emp.employee_name,
      chainOk,
      months: chain,
    });
  }

  console.log(
    JSON.stringify(
      {
        financialYear: FY,
        reconciledThrough: 'June 2026 opening (applied)',
        employees: reports.length,
        allChainsOk: reports.every((r) => r.chainOk !== false),
        reports,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
