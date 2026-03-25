const mongoose = require('mongoose');
require('dotenv').config();

const Settings = require('../settings/model/Settings');
const dateCycleService = require('../leaves/services/dateCycleService');
const { extractISTComponents, createISTDate } = require('../shared/utils/dateUtils');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const keys = ['payroll_cycle_start_day', 'payroll_cycle_end_day'];
  const vals = await Settings.find({ category: 'payroll', key: { $in: keys } }).lean();

  console.log('payroll settings:', vals);

  const now = new Date();
  const period = await dateCycleService.getPeriodInfo(now);
  const end = period.payrollCycle.endDate;
  const nowIST = extractISTComponents(now).dateStr;
  const endIST = extractISTComponents(end).dateStr;
  const runAt = createISTDate(endIST, '23:55');

  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        nowIST,
        payrollCycle: period.payrollCycle,
        cycleEnd: end.toISOString(),
        cycleEndIST: endIST,
        suggestedRunAtIST: runAt.toISOString(),
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

