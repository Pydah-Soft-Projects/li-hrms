const mongoose = require('mongoose');
require('dotenv').config();

const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const month = Number(process.argv[2]);
  const year = Number(process.argv[3]);
  if (!month || !year) throw new Error('Usage: node check_monthly_pool_carry_done.js <month> <year>');

  const doc = await LeaveRegisterYear.findOne({
    months: {
      $elemMatch: {
        payrollCycleMonth: month,
        payrollCycleYear: year,
        poolCarryForwardOutAt: { $exists: true, $ne: null },
      },
    },
  }).lean();

  console.log('poolCarryForwardOutAtExists=', !!doc);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

