require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const { populatePayRegisterFromSources } = require('../pay-register/services/autoPopulationService');

const EMP_NO = String(process.argv[2] || '').trim().toUpperCase();
const MONTH = process.argv[3] || '2026-05';
const DATE = process.argv[4] || '2026-05-19';

async function main() {
  if (!EMP_NO) {
    console.log('Usage: node scripts/diag_populate_payregister_sources_day.js EMP_NO [YYYY-MM] [YYYY-MM-DD]');
    process.exit(1);
  }
  const [year, monthNum] = MONTH.split('-').map(Number);
  await mongoose.connect(process.env.MONGODB_URI);
  const emp = await Employee.findOne({ emp_no: EMP_NO }).select('_id emp_no').lean();
  if (!emp) {
    console.log('Employee not found:', EMP_NO);
    process.exit(1);
  }
  const dailyRecords = await populatePayRegisterFromSources(String(emp._id), EMP_NO, year, monthNum);
  const dr = dailyRecords.find((r) => r.date === DATE);
  console.log({ EMP_NO, MONTH, DATE });
  console.log(dr ? { firstHalf: dr.firstHalf, secondHalf: dr.secondHalf, status: dr.status, isSplit: dr.isSplit } : 'No daily record for date');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

