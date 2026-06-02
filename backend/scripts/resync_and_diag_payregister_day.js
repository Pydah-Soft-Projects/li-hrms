require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const Employee = require('../employees/model/Employee');
const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
const { manualSyncPayRegister } = require('../pay-register/services/autoSyncService');

const DATE = process.argv[2] || '2026-05-19';
const MONTH = process.argv[3] || '2026-05';
const EMP_NOS = process.argv.slice(4); // e.g. 1823 1832 13

async function readDay(empId) {
  const pr = await PayRegisterSummary.findOne({ employeeId: empId, month: MONTH })
    .select('summaryLocked editHistory dailyRecords month')
    .lean();
  const day = pr?.dailyRecords?.find((r) => r.date === DATE) || null;
  const editsForDate = Array.isArray(pr?.editHistory)
    ? pr.editHistory.filter((e) => e && e.date === DATE)
    : [];
  return { pr, day, editsForDate };
}

async function runForEmp(empNoRaw) {
  const empNo = String(empNoRaw || '').trim().toUpperCase();
  const emp = await Employee.findOne({ emp_no: empNo }).select('_id emp_no employee_name').lean();
  if (!emp) {
    console.log(`\n[${empNo}] Employee not found`);
    return;
  }

  const before = await readDay(emp._id);
  console.log(`\n==================== BEFORE SYNC ${empNo} (${emp.employee_name || '-'}) ====================`);
  console.log(`locked=${Boolean(before.pr?.summaryLocked)} editsForDate=${before.editsForDate.length}`);
  console.log(before.day ? { firstHalf: before.day.firstHalf, secondHalf: before.day.secondHalf, isSplit: before.day.isSplit, status: before.day.status } : '(no day)');

  // Try normal sync first; if summaryLocked, it will skip unless force=true.
  try {
    await manualSyncPayRegister(String(emp._id), MONTH, { force: false });
  } catch (e) {
    console.log(`[${empNo}] normal sync error: ${e?.message || e}`);
  }

  const afterNormal = await readDay(emp._id);
  console.log(`\n---- AFTER NORMAL SYNC ${empNo} ----`);
  console.log(`locked=${Boolean(afterNormal.pr?.summaryLocked)} editsForDate=${afterNormal.editsForDate.length}`);
  console.log(afterNormal.day ? { firstHalf: afterNormal.day.firstHalf, secondHalf: afterNormal.day.secondHalf, isSplit: afterNormal.day.isSplit, status: afterNormal.day.status } : '(no day)');

  // Force sync (should override unless date is protected by manual edits logic).
  try {
    await manualSyncPayRegister(String(emp._id), MONTH, { force: true });
  } catch (e) {
    console.log(`[${empNo}] force sync error: ${e?.message || e}`);
  }

  const afterForce = await readDay(emp._id);
  console.log(`\n---- AFTER FORCE SYNC ${empNo} ----`);
  console.log(`locked=${Boolean(afterForce.pr?.summaryLocked)} editsForDate=${afterForce.editsForDate.length}`);
  console.log(afterForce.day ? { firstHalf: afterForce.day.firstHalf, secondHalf: afterForce.day.secondHalf, isSplit: afterForce.day.isSplit, status: afterForce.day.status } : '(no day)');
}

async function main() {
  if (EMP_NOS.length === 0) {
    console.log('Usage: node scripts/resync_and_diag_payregister_day.js YYYY-MM-DD YYYY-MM EMP_NO [EMP_NO...]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  for (const empNo of EMP_NOS) {
    // eslint-disable-next-line no-await-in-loop
    await runForEmp(empNo);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

