const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import models
const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms-leave-5';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Check if employee 2146 exists
    console.log('🔄 Step 1: Checking for employee 2146...');
    const employee = await Employee.findOne({ emp_no: '2146' }).lean();
    
    if (!employee) {
      console.log('❌ Employee 2146 not found. Getting sample employee numbers...\n');
      const samples = await Employee.find({}).select('emp_no employee_name').limit(5).lean();
      console.log('📊 Sample employees:');
      samples.forEach(e => console.log(`  - ${e.emp_no}: ${e.employee_name}`));
      
      await mongoose.disconnect();
      console.log('\nPlease update the sync logs to use a valid employee number from above.');
      process.exit(0);
    }
    
    console.log(`✅ Found employee: ${employee.emp_no} - ${employee.employee_name}\n`);

    // Step 2: Check for existing raw logs
    console.log('🔄 Step 2: Checking for existing raw logs on June 13th...');
    const existingRawLogs = await AttendanceRawLog.find({
      employeeId: '2146',
      timestamp: {
        $gte: new Date('2026-06-13T00:00:00Z'),
        $lt: new Date('2026-06-14T00:00:00Z')
      }
    }).lean();
    console.log(`Found ${existingRawLogs.length} existing raw logs\n`);

    // Step 3: Check for attendance daily record
    console.log('🔄 Step 3: Checking for attendance daily record on June 13th...');
    const existingDaily = await AttendanceDaily.findOne({
      employeeNumber: '2146',
      date: new Date('2026-06-13')
    }).lean();

    if (!existingDaily) {
      console.log('❌ No attendance daily record found\n');
    } else {
      console.log('✅ Found attendance daily record:');
      console.log(JSON.stringify({
        employeeNumber: existingDaily.employeeNumber,
        date: existingDaily.date,
        status: existingDaily.status,
        inTime: existingDaily.inTime,
        outTime: existingDaily.outTime,
        hoursWorked: existingDaily.hoursWorked
      }, null, 2));
      console.log();
    }

    // Step 4: Show instructions for syncing
    console.log('📋 NEXT STEPS:');
    console.log('1. Run the sync script: node backend/scripts/sync_and_retrieve.js');
    console.log('   This will send the logs to /api/internal/attendance/sync');
    console.log('\n2. Run this script again to verify the attendance daily record was created');

    await mongoose.disconnect();
    console.log('\n✅ MongoDB disconnected');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
