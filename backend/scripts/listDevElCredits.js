require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const ELHistory = require('../leaves/model/ELHistory');

const YEAR = parseInt(process.argv[2] || '2026', 10);
const MONTH = process.argv[3] ? parseInt(process.argv[3], 10) : null; // optional 1-12

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const dept =
    (await Department.findOne({ code: /^DEV$/i }).lean()) ||
    (await Department.findOne({ name: /development/i }).lean());
  if (!dept) {
    console.log(JSON.stringify({ error: 'Department not found' }));
    process.exit(0);
  }
  const emps = await Employee.find({ department_id: dept._id, is_active: true })
    .select('_id emp_no name paidLeaves')
    .sort({ emp_no: 1 })
    .lean();
  const ids = emps.map((e) => e._id);

  const q = { employeeId: { $in: ids }, type: 'CREDIT' };
  if (MONTH) {
    q.year = YEAR;
    q.month = MONTH;
  } else {
    q.year = YEAR;
  }

  const rows = await ELHistory.find(q).sort({ empNo: 1, year: 1, month: 1, createdAt: 1 }).lean();

  const out = emps.map((e) => {
    const mine = rows.filter((r) => String(r.employeeId) === String(e._id));
    const totalDays = mine.reduce((s, r) => s + (Number(r.days) || 0), 0);
    return {
      emp_no: e.emp_no,
      name: e.name,
      current_paid_leaves_balance: e.paidLeaves,
      el_history_rows: mine.length,
      el_credited_days_sum_for_query: totalDays,
      details: mine.map((r) => ({
        month: r.month,
        year: r.year,
        days: r.days,
        source: r.source,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    };
  });

  console.log(
    JSON.stringify(
      {
        department: dept.name,
        filter: MONTH ? { year: YEAR, month: MONTH } : { year: YEAR, allMonths: true },
        employees: out,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  mongoose.disconnect().finally(() => process.exit(1));
});
