require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Leave = require('../leaves/model/Leave');
const EmployeeHistory = require('../employees/model/EmployeeHistory');

const LEAVE_ID = '6a0fe4568c84aae08ef48c0c';
const EMP_NO = '155';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const leave = await Leave.findById(LEAVE_ID).lean();
  console.log('=== Leave 6a0fe4568c84aae08ef48c0c (Apr 27 CL) ===\n');
  console.log(JSON.stringify(leave, null, 2));

  const hist = await EmployeeHistory.find({ emp_no: EMP_NO, event: /leave/i })
    .sort({ createdAt: -1 })
    .limit(15)
    .lean();
  console.log('\n=== EmployeeHistory leave events (recent) ===');
  hist.forEach((h) => {
    console.log({
      event: h.event,
      createdAt: h.createdAt,
      leaveId: h.details?.leaveId?.toString?.() || h.details?.leaveId,
      from: h.details?.fromDate,
      to: h.details?.toDate,
      comments: h.comments,
    });
  });
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
