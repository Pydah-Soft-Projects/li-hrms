/**
 * Generate Test Data for Live Attendance Reports
 * Creates attendance records for today and yesterday with various scenarios
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Shift = require('../shifts/model/Shift');

// Helper to format date as YYYY-MM-DD
const formatDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to create a datetime from date and time string
const createDateTime = (dateStr, timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(dateStr);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

// Helper to add random minutes variation
const addRandomMinutes = (dateTime, min, max) => {
  const variation = Math.floor(Math.random() * (max - min + 1)) + min;
  const newDateTime = new Date(dateTime);
  newDateTime.setMinutes(newDateTime.getMinutes() + variation);
  return newDateTime;
};

async function generateTestData() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
    await mongoose.connect(mongoUri, {
      maxPoolSize: 50,
      minPoolSize: 1,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB');

    // Get dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = formatDate(today);
    const yesterdayStr = formatDate(yesterday);

    console.log(`📅 Today: ${todayStr}`);
    console.log(`📅 Yesterday: ${yesterdayStr}`);

    // Get active employees
    console.log('\n📋 Fetching employees...');
    const employees = await Employee.find({ is_active: { $ne: false } })
      .limit(30)
      .lean();

    if (employees.length === 0) {
      console.log('❌ No employees found. Please create some employees first.');
      return;
    }

    console.log(`✅ Found ${employees.length} employees`);

    // Get shifts to assign to employees
    console.log('\n📋 Fetching shifts...');
    const shifts = await Shift.find({ isActive: true }).lean();

    if (shifts.length === 0) {
      console.log('❌ No shifts found. Please create some shifts first.');
      return;
    }

    console.log(`✅ Found ${shifts.length} shifts`);

    // Clear existing test data for today and yesterday
    console.log('\n🗑️  Clearing existing attendance data...');
    await AttendanceDaily.deleteMany({
      date: { $in: [todayStr, yesterdayStr] }
    });
    console.log('✅ Cleared existing data');

    // Generate attendance records
    console.log('\n✨ Generating test data...');

    let todayCurrentlyWorking = 0;
    let todayCompleted = 0;
    let yesterdayCompleted = 0;

    const attendanceRecords = [];

    for (let i = 0; i < employees.length; i++) {
      const employee = employees[i];
      // Assign shift round-robin from available shifts
      const shift = shifts[i % shifts.length];

      if (!shift) {
        console.log(`⚠️  Skipping ${employee.emp_no} - no shift available`);
        continue;
      }

      // Determine shift times (support camelCase fields)
      const shiftStart = shift.startTime || shift.start_time || '09:00';
      const shiftEnd = shift.endTime || shift.end_time || '18:00';
      const [startHour, startMin] = shiftStart.split(':').map(Number);
      const [endHour, endMin] = shiftEnd.split(':').map(Number);
      let startMinutes = startHour * 60 + startMin;
      let endMinutes = endHour * 60 + endMin;
      if (endMinutes <= startMinutes) endMinutes += 24 * 60; // handle overnight
      const shiftDurationHours = (endMinutes - startMinutes) / 60;

      // ==================== YESTERDAY'S DATA ====================
      // All employees completed their shift yesterday
      const yesterdayInTime = createDateTime(yesterdayStr, shiftStart);
      const yesterdayOutTime = createDateTime(yesterdayStr, shiftEnd);

      // Add variations
      const actualYesterdayIn = addRandomMinutes(yesterdayInTime, -5, 20); // -5 to +20 mins
      const actualYesterdayOut = addRandomMinutes(yesterdayOutTime, -30, 60); // -30 to +60 mins

      // Calculate late/early
      const yesterdayLateMinutes = Math.max(0, Math.floor((actualYesterdayIn - yesterdayInTime) / (1000 * 60)));
      const yesterdayEarlyMinutes = Math.max(0, Math.floor((yesterdayOutTime - actualYesterdayOut) / (1000 * 60)));

      const actualWorkHours = (actualYesterdayOut - actualYesterdayIn) / (1000 * 60 * 60);
      const yesterdayOTHours = Math.max(0, actualWorkHours - shiftDurationHours);

      yesterdayCompleted++;

      attendanceRecords.push({
        employeeNumber: employee.emp_no,
        date: yesterdayStr,
        inTime: actualYesterdayIn,
        outTime: actualYesterdayOut,
        totalHours: actualWorkHours,
        status: 'PRESENT',
        shiftId: shift._id,
        expectedHours: shiftDurationHours,
        lateInMinutes: yesterdayLateMinutes > 0 ? yesterdayLateMinutes : null,
        earlyOutMinutes: yesterdayEarlyMinutes > 10 ? yesterdayEarlyMinutes : null,
        isLateIn: yesterdayLateMinutes > 0,
        isEarlyOut: yesterdayEarlyMinutes > 10,
        otHours: yesterdayOTHours > 0.5 ? Math.round(yesterdayOTHours * 10) / 10 : 0,
        extraHours: 0,
        payableShifts: 1,
        source: ['mssql'],
        lastSyncedAt: new Date(),
      });

      // ==================== TODAY'S DATA ====================
      const todayInTime = createDateTime(todayStr, shiftStart);
      const todayOutTime = createDateTime(todayStr, shiftEnd);

      // Scenario distribution:
      // 40% - Currently working (no out time)
      // 40% - Completed shift (both in and out)
      // 20% - Skip (not yet started or absent)

      const scenario = Math.random();

      if (scenario < 0.4) {
        // Currently Working - No OUT time
        const actualTodayIn = addRandomMinutes(todayInTime, -5, 20);
        const todayLateMinutes = Math.max(0, Math.floor((actualTodayIn - todayInTime) / (1000 * 60)));

        todayCurrentlyWorking++;

        attendanceRecords.push({
          employeeNumber: employee.emp_no,
          date: todayStr,
          inTime: actualTodayIn,
          outTime: null, // Still working
          totalHours: null,
          status: 'PARTIAL',
          shiftId: shift._id,
          expectedHours: shiftDurationHours,
          lateInMinutes: todayLateMinutes > 0 ? todayLateMinutes : null,
          earlyOutMinutes: null,
          isLateIn: todayLateMinutes > 0,
          isEarlyOut: false,
          otHours: 0,
          extraHours: 0,
          payableShifts: 0,
          source: ['biometric-realtime'],
          lastSyncedAt: new Date(),
        });

      } else if (scenario < 0.8) {
        // Completed Shift
        const actualTodayIn = addRandomMinutes(todayInTime, -5, 20);
        const actualTodayOut = addRandomMinutes(todayOutTime, -30, 60);

        const todayLateMinutes = Math.max(0, Math.floor((actualTodayIn - todayInTime) / (1000 * 60)));
        const todayEarlyMinutes = Math.max(0, Math.floor((todayOutTime - actualTodayOut) / (1000 * 60)));

        const todayActualWorkHours = (actualTodayOut - actualTodayIn) / (1000 * 60 * 60);
        const todayOTHours = Math.max(0, todayActualWorkHours - shiftDurationHours);

        todayCompleted++;

        attendanceRecords.push({
          employeeNumber: employee.emp_no,
          date: todayStr,
          inTime: actualTodayIn,
          outTime: actualTodayOut,
          totalHours: todayActualWorkHours,
          status: 'PRESENT',
          shiftId: shift._id,
          expectedHours: shiftDurationHours,
          lateInMinutes: todayLateMinutes > 0 ? todayLateMinutes : null,
          earlyOutMinutes: todayEarlyMinutes > 10 ? todayEarlyMinutes : null,
          isLateIn: todayLateMinutes > 0,
          isEarlyOut: todayEarlyMinutes > 10,
          otHours: todayOTHours > 0.5 ? Math.round(todayOTHours * 10) / 10 : 0,
          extraHours: 0,
          payableShifts: 1,
          source: ['biometric-realtime'],
          lastSyncedAt: new Date(),
        });
      }
      // else: Skip this employee (not started yet or absent)
    }

    // Insert all records
    console.log(`\n💾 Inserting ${attendanceRecords.length} attendance records...`);
    await AttendanceDaily.insertMany(attendanceRecords);

    console.log('\n✅ Test data generated successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Today (${todayStr}):`);
    console.log(`   - Currently Working: ${todayCurrentlyWorking}`);
    console.log(`   - Completed Shift: ${todayCompleted}`);
    console.log(`   - Total: ${todayCurrentlyWorking + todayCompleted}`);
    console.log(`\n   Yesterday (${yesterdayStr}):`);
    console.log(`   - Completed Shift: ${yesterdayCompleted}`);
    console.log(`   - Total: ${yesterdayCompleted}`);

    console.log('\n🎉 Done! You can now test the Live Attendance page.');

  } catch (error) {
    console.error('❌ Error generating test data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run the script
generateTestData();
