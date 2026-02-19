
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Employee = require('../employees/model/Employee');
const Shift = require('../shifts/model/Shift');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { calculateLateIn } = require('../shifts/services/shiftDetectionService');

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check Timezone (retained from original for context, though not directly used in new logic)
    console.log(`System Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

    // Check Settings (retained from original as globalLateInGrace is used)
    const Settings = require('../settings/model/Settings');

    const allGeneral = await Settings.find({ category: 'general' });
    const config = {};
    allGeneral.forEach(s => config[s.key] = s.value);
    const globalLateInGrace = config.late_in_grace_time ?? null;
    console.log('Global Late In Grace (Resolved):', globalLateInGrace);


    // Get last 5 records
    const records = await AttendanceDaily.find({
      "shifts.0": { $exists: true }
    }).sort({ date: -1 }).limit(5).populate('shifts.shiftId');

    const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');

    const OD = require('../leaves/model/OD');

    for (const record of records) {
      console.log(`\nProcessing Record for: ${record.employeeNumber} on ${record.date}`);
      console.log(`  Daily Source: ${record.source}`);

      // Check Raw Logs
      const rawLogs = await AttendanceRawLog.find({
        employeeNumber: record.employeeNumber,
        date: record.date
      });
      console.log(`  Raw Logs Found: ${rawLogs.length}`);
      rawLogs.forEach(log => console.log(`    Log: ${log.timestamp} - Type: ${log.type} - Source: ${log.source}`));

      // Check for OD
      const employee = await Employee.findOne({ emp_no: record.employeeNumber }).select('_id');
      if (employee) {
        const startOfDay = new Date(record.date + 'T00:00:00.000Z');
        const endOfDay = new Date(record.date + 'T23:59:59.999Z');

        const ods = await OD.find({
          employeeId: employee._id,
          $or: [
            { fromDate: { $lte: endOfDay }, toDate: { $gte: startOfDay } }
          ]
        });
        console.log(`  ODs found: ${ods.length}`);
        ods.forEach(od => console.log(`    OD: ${od.odType} (${od.status}) - ${od.fromDate} to ${od.toDate}`));
      }

      record.shifts.forEach((shift, index) => {
        console.log(`  Shift ${index + 1}: In=${shift.inTime}, Late=${shift.isLateIn}`);
        if (shift.inTime && shift.shiftStartTime) {
          const lateIn = calculateLateIn(
            shift.inTime,
            shift.shiftStartTime,
            shift.shiftId?.gracePeriod || 15,
            record.date,
            globalLateInGrace
          );
          console.log(`  Calculated Late In: ${lateIn}`);
        }
      });
    }

    if (records.length === 0) {
      console.log('No attendance records found.');
      // return; // Removed return to allow finally block to execute
    }

    process.exit(0); // This will exit the process, preventing finally from running if successful

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // This block will only run if process.exit(0) is not called in try block
    // or if an error occurs.
    await mongoose.disconnect();
  }
};

run();
