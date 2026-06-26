require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Division = require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
const { extractISTComponents } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const period = await dateCycleService.getPayrollCycleForMonth(2026, 6);
  const start = extractISTComponents(new Date(period.startDate)).dateStr;
  const end = extractISTComponents(new Date(period.endDate)).dateStr;
  const divs = await Division.find({ isActive: { $ne: false } }).select('name code').sort({ name: 1 }).lean();
  const rows = [];
  for (const div of divs) {
    const emps = await Employee.find({ is_active: { $ne: false }, division_id: div._id }).select('emp_no').lean();
    let multiPunchDays = 0;
    let employeesAffected = 0;
    for (const emp of emps) {
      const logs = await AttendanceRawLog.find({
        employeeNumber: String(emp.emp_no).toUpperCase(),
        date: { $gte: start, $lte: end },
      })
        .select('date type punch_state timestamp')
        .lean();
      const byDate = {};
      for (const l of logs) {
        const d = l.date || extractISTComponents(l.timestamp).dateStr;
        if (!byDate[d]) byDate[d] = { in: 0, out: 0 };
        const t =
          l.type ||
          (l.punch_state === 0 || l.punch_state === '0' ? 'IN' : l.punch_state != null ? 'OUT' : null);
        if (t === 'IN') byDate[d].in++;
        if (t === 'OUT') byDate[d].out++;
      }
      const empDays = Object.values(byDate).filter((x) => x.in >= 2 && x.out >= 2).length;
      if (empDays) {
        employeesAffected++;
        multiPunchDays += empDays;
      }
    }
    rows.push({
      code: div.code,
      name: div.name,
      employees: emps.length,
      multiPunchDays,
      employeesAffected,
    });
  }
  const outPath = path.resolve(__dirname, '../../tmp/division-multi-punch-scenario-june-2026.json');
  fs.writeFileSync(outPath, JSON.stringify({ period: { start, end }, rows }, null, 2));
  console.log('Multi-punch scenario (days with 2+ IN & 2+ OUT):');
  for (const r of rows) {
    console.log(
      `${r.code.padEnd(14)} emps ${String(r.employees).padStart(3)} | multi-punch days ${String(r.multiPunchDays).padStart(4)} | emps affected ${r.employeesAffected}`
    );
  }
  console.log('Written:', outPath);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
