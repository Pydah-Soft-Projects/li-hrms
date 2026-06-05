/**
 * Repair emp 2146: merge split CL back to one 3–6 Jun boundary leave (0.5+1+1+0.5 = 3 days).
 * Run: node scripts/repair_2146_jun_boundary_leave.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const { createISTDate } = require('../shared/utils/dateUtils');
const { buildLeaveDocumentFieldsForSpan } = require('../shared/utils/leaveDayRangeUtils');
const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');
const leaveRegisterService = require('../leaves/services/leaveRegisterService');

const KEEP_ID = '6a200d1be4ad359a0a9a9faa';
const REMOVE_ID = '6a2020fdb5d604ee6f9cb938';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const e = await Employee.findOne({ emp_no: '2146' }).lean();
  const keep = await Leave.findById(KEEP_ID);
  const remove = await Leave.findById(REMOVE_ID);
  if (!keep || !remove) {
    console.error('Leave rows not found');
    process.exit(1);
  }

  const span = buildLeaveDocumentFieldsForSpan(
    {
      fromDate: createISTDate('2026-06-03', '00:00'),
      toDate: createISTDate('2026-06-06', '23:59'),
      fromIsHalfDay: true,
      toIsHalfDay: true,
      isHalfDay: false,
    },
    '2026-06-03',
    '2026-06-06'
  );

  try {
    await leaveRegisterService.reverseLeaveDebit(remove, null);
  } catch (err) {
    console.warn('reverse remove:', err.message);
  }
  remove.status = 'rejected';
  remove.isActive = false;
  await remove.save();

  try {
    await leaveRegisterService.reverseLeaveDebit(keep, null);
  } catch (err) {
    console.warn('reverse keep:', err.message);
  }

  Object.assign(keep, span);
  keep.remarks = 'sadfsdf\n[Repaired] Restored single 3–6 Jun boundary leave after incorrect attendance split.';
  keep.status = 'approved';
  keep.isActive = true;
  await keep.save();
  await leaveRegisterService.addLeaveDebit(keep, null);

  await calculateMonthlySummary(e._id, e.emp_no, 2026, 6);
  console.log('Repaired leave', KEEP_ID, '→ 3–6 Jun, days=', keep.numberOfDays);
  console.log('Rejected duplicate', REMOVE_ID);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
