const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const needle = 'Initial sync: approved CL leave used';
  const docs = await LeaveRegisterYear.find({
    financialYear: '2026',
    months: {
      $elemMatch: {
        transactions: { $elemMatch: { leaveType: 'CL', transactionType: 'DEBIT', reason: { $regex: needle, $options: 'i' } } },
      },
    },
  })
    .select('employeeId empNo employeeName months')
    .lean();

  console.log(`matches=${docs.length}`);
  for (const d of docs.slice(0, 50)) {
    const hits = [];
    for (const m of d.months || []) {
      for (const t of m.transactions || []) {
        if (t.leaveType === 'CL' && t.transactionType === 'DEBIT' && String(t.reason || '').toLowerCase().includes(needle.toLowerCase())) {
          hits.push({
            label: m.label,
            startDate: t.startDate,
            endDate: t.endDate,
            days: t.days,
            reason: t.reason,
          });
        }
      }
    }
    console.log(`\nempNo=${d.empNo} name=${d.employeeName} id=${d.employeeId}`);
    console.log(JSON.stringify(hits.slice(0, 10), null, 2));
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

