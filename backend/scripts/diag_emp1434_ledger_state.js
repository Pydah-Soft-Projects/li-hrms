/** Read-only: inspect emp 1434 CCL ledger + identify the original (pre-flood) leave. */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const { extractISTComponents } = require('../shared/utils/dateUtils');

const FLOOD_START = new Date('2026-07-25T00:00:00Z');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB:', mongoose.connection.name);
  const emp = await Employee.findOne({ emp_no: '1434' }).lean();

  const july = await Leave.find({
    $or: [{ emp_no: '1434' }, { employeeId: emp._id }],
    fromDate: { $lte: new Date('2026-07-25T23:59:59Z') },
    toDate: { $gte: new Date('2026-06-26T00:00:00Z') },
  })
    .sort({ createdAt: 1 })
    .lean();

  const preFlood = july.filter((l) => new Date(l.createdAt) < FLOOD_START);
  const floodDocs = july.filter((l) => new Date(l.createdAt) >= FLOOD_START);
  console.log('July-overlapping leaves:', july.length, '| pre-flood:', preFlood.length, '| flood:', floodDocs.length);
  console.log('\n--- PRE-FLOOD (original application(s)) ---');
  preFlood.forEach((l) =>
    console.log({
      id: String(l._id),
      from: extractISTComponents(l.fromDate).dateStr,
      to: extractISTComponents(l.toDate).dateStr,
      type: l.leaveType,
      status: l.status,
      numberOfDays: l.numberOfDays,
      isActive: l.isActive,
      createdAt: l.createdAt,
      appliedBy: l.appliedBy ? String(l.appliedBy) : null,
    })
  );

  // Ledger
  const years = await LeaveRegisterYear.find({ employeeId: emp._id }).lean();
  console.log('\n--- leave_register_years docs:', years.length, '---');
  const floodIds = new Set(floodDocs.map((d) => String(d._id)));
  const allJulyIds = new Set(july.map((d) => String(d._id)));
  for (const y of years) {
    let totalTx = 0;
    let cclDebit = 0;
    let floodDebitRows = 0;
    let julyDebitRows = 0;
    const perTypeDebit = {};
    for (const slot of y.months || []) {
      for (const tx of slot.transactions || []) {
        totalTx += 1;
        const isDebit = String(tx.transactionType || '').toUpperCase() === 'DEBIT';
        if (isDebit) {
          perTypeDebit[tx.leaveType] = (perTypeDebit[tx.leaveType] || 0) + (Number(tx.days) || 0);
          if (tx.leaveType === 'CCL') cclDebit += Number(tx.days) || 0;
          const appId = tx.applicationId ? String(tx.applicationId) : null;
          if (appId && floodIds.has(appId)) floodDebitRows += 1;
          if (appId && allJulyIds.has(appId)) julyDebitRows += 1;
        }
      }
    }
    console.log({
      fy: y.financialYear,
      totalTx,
      debitDaysByType: perTypeDebit,
      julyDebitRows,
      floodDebitRows,
    });
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
