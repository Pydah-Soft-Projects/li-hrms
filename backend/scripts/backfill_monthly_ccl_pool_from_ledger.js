const mongoose = require('mongoose');
require('dotenv').config();

const Employee = require('../employees/model/Employee');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const leaveRegisterYearMonthlyApplyService = require('../leaves/services/leaveRegisterYearMonthlyApplyService');

function roundHalf(x) {
  const n = Number(x) || 0;
  if (n <= 0) return 0;
  return Math.round(n * 2) / 2;
}

function sumCclCreditDaysInSlot(slot) {
  const txs = slot?.transactions || [];
  let s = 0;
  for (const t of txs) {
    if (String(t.leaveType || '').toUpperCase() !== 'CCL') continue;
    if (String(t.transactionType || '').toUpperCase() !== 'CREDIT') continue;
    s += Number(t.days) || 0;
  }
  return roundHalf(s);
}

async function main() {
  const empNo = String(process.argv[2] || '').trim();
  if (!empNo) throw new Error('Usage: node backfill_monthly_ccl_pool_from_ledger.js <empNo>');

  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const emp = await Employee.findOne({ emp_no: empNo }).select('_id emp_no employee_name').lean();
  if (!emp) throw new Error(`Employee not found for emp_no=${empNo}`);

  const docs = await LeaveRegisterYear.find({ employeeId: emp._id }).sort({ financialYearStart: 1 });
  if (!docs.length) throw new Error(`No LeaveRegisterYear docs for emp_no=${empNo}`);

  let updatedSlots = 0;

  for (const doc of docs) {
    let changed = false;
    for (let i = 0; i < (doc.months || []).length; i++) {
      const slot = doc.months[i];
      const carryIn = roundHalf(Number(slot.poolCarryForwardIn?.ccl) || 0);
      const earned = sumCclCreditDaysInSlot(slot);
      const computedPool = roundHalf(carryIn + earned);
      const currentPool = roundHalf(Number(slot.compensatoryOffs) || 0);

      // Only increase via backfill (safe). We do not reduce a slot that was already manually adjusted.
      if (computedPool > currentPool) {
        slot.compensatoryOffs = computedPool;
        doc.markModified(`months.${i}`);
        changed = true;
        updatedSlots++;
      }
    }

    if (changed) {
      await doc.save();
      // Sync cached monthly apply fields for all slots that exist (use payPeriodStart as anchor date).
      for (const m of doc.months || []) {
        if (m?.payPeriodStart) {
          await leaveRegisterYearMonthlyApplyService.syncStoredMonthApplyFieldsForEmployeeDate(
            doc.employeeId,
            m.payPeriodStart
          );
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        empNo,
        employeeId: String(emp._id),
        updatedSlots,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

