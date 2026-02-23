/**
 * Roster script: Jan 26 holiday for all + Jan 27–31 from first week of Feb (by weekday)
 *
 * 1. Declare Jan 26 as holiday (HOL) for all employees in roster.
 * 2. Get roster for first week of February (Feb 1–7).
 * 3. For Jan 27–31, set each day’s roster from the same weekday in that Feb week
 *    (e.g. Jan 27 Mon → Feb 3 Mon, Jan 28 Tue → Feb 4 Tue, …).
 *
 * Run from backend: node scripts/roster_jan26_holiday_and_copy_feb_week1.js
 * Optional: YEAR=2026 node scripts/roster_jan26_holiday_and_copy_feb_week1.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');

const YEAR = parseInt(process.env.YEAR || '2026', 10);

const JAN_26 = `${YEAR}-01-26`;
const JAN_27_TO_31 = ['27', '28', '29', '30', '31'].map(d => `${YEAR}-01-${d}`);
const FEB_1_TO_7 = [1, 2, 3, 4, 5, 6, 7].map(d => `${YEAR}-02-${String(d).padStart(2, '0')}`);

function getWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0 = Sun, 1 = Mon, ...
}

async function run() {
  try {
    console.log('Connecting to MongoDB...', process.env.MONGODB_URI);
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not set in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    const superAdmin = await User.findOne({ role: 'super_admin' }).select('_id');
    if (!superAdmin) {
      throw new Error('No super_admin user found. Create one or set scheduledBy manually.');
    }
    const scheduledBy = superAdmin._id;

    const employees = await Employee.find({ is_active: true, leftDate: null }).select('emp_no').lean();
    const empNos = employees.map(e => String(e.emp_no || '').toUpperCase()).filter(Boolean);
    if (empNos.length === 0) {
      console.log('No active employees found.');
      process.exit(0);
    }
    console.log(`Found ${empNos.length} active employees.\n`);

    // --- Step 1: Jan 26 = holiday for all ---
    console.log(`[1] Setting Jan 26 (${JAN_26}) as HOLIDAY for all employees...`);
    let jan26Count = 0;
    for (const empNo of empNos) {
      await PreScheduledShift.findOneAndUpdate(
        { employeeNumber: empNo, date: JAN_26 },
        {
          $set: {
            status: 'HOL',
            shiftId: null,
            notes: 'Republic Day / Script',
            scheduledBy,
          },
        },
        { upsert: true }
      );
      jan26Count++;
    }
    console.log(`    Done: ${jan26Count} roster entries (HOL) for ${JAN_26}.\n`);

    // --- Step 2: Roster for first week of Feb (Feb 1–7) ---
    console.log(`[2] Loading roster for first week of Feb (${FEB_1_TO_7[0]} to ${FEB_1_TO_7[6]})...`);
    const febRoster = await PreScheduledShift.find({
      date: { $in: FEB_1_TO_7 },
      employeeNumber: { $in: empNos },
    })
      .select('employeeNumber date shiftId status notes')
      .lean();

    const febByEmpAndDate = new Map();
    febRoster.forEach((r) => {
      const key = `${r.employeeNumber}|${r.date}`;
      febByEmpAndDate.set(key, {
        shiftId: r.shiftId || null,
        status: r.status || null,
        notes: r.notes || null,
      });
    });
    console.log(`    Loaded ${febRoster.length} roster entries for Feb 1–7.\n`);

    // --- Step 3: Jan 27–31 = same weekday from Feb 1–7 ---
    console.log('[3] Copying roster by weekday: Jan 27–31 from first week Feb...');
    let jan27to31Count = 0;
    for (const janDate of JAN_27_TO_31) {
      const weekday = getWeekday(janDate);
      const febDate = FEB_1_TO_7.find((d) => getWeekday(d) === weekday);
      if (!febDate) {
        console.warn(`    No matching weekday ${weekday} in Feb 1–7 for ${janDate}; skip.`);
        continue;
      }
      for (const empNo of empNos) {
        const key = `${empNo}|${febDate}`;
        const source = febByEmpAndDate.get(key);
        const payload = {
          date: janDate,
          scheduledBy,
        };
        if (source && (source.status === 'WO' || source.status === 'HOL')) {
          payload.shiftId = null;
          payload.status = source.status;
          payload.notes = source.notes || (source.status === 'WO' ? 'Week Off' : 'Holiday');
        } else if (source && source.shiftId) {
          payload.shiftId = source.shiftId;
          payload.status = null;
          payload.notes = null;
        } else {
          continue;
        }
        await PreScheduledShift.findOneAndUpdate(
          { employeeNumber: empNo, date: janDate },
          { $set: payload },
          { upsert: true }
        );
        jan27to31Count++;
      }
    }
    console.log(`    Done: ${jan27to31Count} roster entries for Jan 27–31 (by weekday from Feb 1–7).\n`);

    console.log('Summary:');
    console.log(`  - ${JAN_26}: HOL for ${jan26Count} employees`);
    console.log(`  - Jan 27–31: ${jan27to31Count} entries copied from first week of Feb (same weekday)`);
    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
}

run();
