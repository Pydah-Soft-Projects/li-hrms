require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const OD = require('../leaves/model/OD');
const Employee = require('../employees/model/Employee');
const { extractISTComponents, createISTDate } = require('../shared/utils/dateUtils');

const EMP_NO = String(process.argv[2] || '').trim().toUpperCase();
const DATE = process.argv[3] || '2026-05-19';
const startDate = process.argv[4] || '2026-04-26';
const endDate = process.argv[5] || '2026-05-25';

async function main() {
  if (!EMP_NO) {
    console.log('Usage: node scripts/diag_od_map_key.js EMP_NO [YYYY-MM-DD] [startDate] [endDate]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const emp = await Employee.findOne({ emp_no: EMP_NO }).select('_id emp_no').lean();
  if (!emp) {
    console.log('Employee not found:', EMP_NO);
    process.exit(1);
  }

  const start = createISTDate(startDate, '00:00');
  const end = createISTDate(endDate, '23:59');
  const ods = await OD.find({
    employeeId: emp._id,
    status: { $in: ['approved', 'hr_approved', 'hod_approved'] },
    isActive: true,
    $or: [{ fromDate: { $lte: end }, toDate: { $gte: start } }],
  })
    .select('fromDate toDate isHalfDay halfDayType odType')
    .lean();

  console.log('ods count:', ods.length);
  const odMap = {};
  for (const od of ods) {
    let currentDate = new Date(od.fromDate);
    const to = new Date(od.toDate);
    let steps = 0;
    while (currentDate <= to && steps < 40) {
      const k = extractISTComponents(currentDate).dateStr;
      if (!odMap[k]) {
        odMap[k] = {
          isHalfDay: od.isHalfDay,
          halfDayType: od.halfDayType,
          odType: od.odType,
          fromDate: od.fromDate,
          toDate: od.toDate,
        };
      }
      currentDate.setDate(currentDate.getDate() + 1);
      steps += 1;
    }
  }

  console.log('odMap has DATE:', DATE, Boolean(odMap[DATE]));
  console.log('odMap[DATE]:', odMap[DATE] || null);
  console.log('odMap keys (first 20):', Object.keys(odMap).slice(0, 20));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

