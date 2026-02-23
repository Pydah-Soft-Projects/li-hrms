require('dotenv').config();
const mongoose = require('mongoose');
const AttendanceLog = require('../models/AttendanceLog');
const Device = require('../models/Device');
const DeviceUser = require('../models/DeviceUser');
const logger = require('../utils/logger');

/**
 * Script to add dummy attendance data for testing the export excel feature
 * This creates realistic attendance logs for multiple employees over a date range
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';

// Dummy employee IDs
const EMPLOYEES = [
  { id: 'EMP001', name: 'John Doe' },
  { id: 'EMP002', name: 'Jane Smith' },
  { id: 'EMP003', name: 'Robert Johnson' },
  { id: 'EMP004', name: 'Emily Davis' },
  { id: 'EMP005', name: 'Michael Wilson' },
  { id: 'EMP006', name: 'Sarah Brown' },
  { id: 'EMP007', name: 'David Lee' },
  { id: 'EMP008', name: 'Lisa Taylor' },
  { id: 'EMP009', name: 'James Anderson' },
  { id: 'EMP010', name: 'Maria Martinez' }
];

// Device info
const DEVICE = {
  id: 'DEVICE001',
  name: 'Main Gate Device'
};

/**
 * Generate a random time within a range
 */
function randomTime(baseHour, baseMinute, varianceMinutes = 30) {
  const variance = Math.floor(Math.random() * varianceMinutes * 2) - varianceMinutes;
  const totalMinutes = baseHour * 60 + baseMinute + variance;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes };
}

/**
 * Create attendance logs for a single employee on a single day
 */
function createDayLogs(employeeId, date, pattern = 'normal') {
  const logs = [];
  const dateObj = new Date(date);

  if (pattern === 'normal') {
    // Normal single shift: CHECK-IN around 9 AM, CHECK-OUT around 6 PM
    const checkIn = randomTime(9, 0, 30);
    const checkOut = randomTime(18, 0, 30);

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(checkIn.hours, checkIn.minutes, 0, 0)),
      logType: 'CHECK-IN',
      rawType: 0,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 0 }
    });

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(checkOut.hours, checkOut.minutes, 0, 0)),
      logType: 'CHECK-OUT',
      rawType: 1,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 1 }
    });
  } else if (pattern === 'with-break') {
    // Shift with break: CHECK-IN, BREAK-OUT, BREAK-IN, CHECK-OUT
    const checkIn = randomTime(9, 0, 30);
    const breakOut = randomTime(13, 0, 15);
    const breakIn = randomTime(14, 0, 15);
    const checkOut = randomTime(18, 30, 30);

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(checkIn.hours, checkIn.minutes, 0, 0)),
      logType: 'CHECK-IN',
      rawType: 0,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 0 }
    });

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(breakOut.hours, breakOut.minutes, 0, 0)),
      logType: 'BREAK-OUT',
      rawType: 3,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 3 }
    });

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(breakIn.hours, breakIn.minutes, 0, 0)),
      logType: 'BREAK-IN',
      rawType: 2,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 2 }
    });

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(checkOut.hours, checkOut.minutes, 0, 0)),
      logType: 'CHECK-OUT',
      rawType: 1,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 1 }
    });
  } else if (pattern === 'overtime') {
    // Normal shift + overtime
    const checkIn = randomTime(9, 0, 30);
    const checkOut = randomTime(18, 0, 15);
    const overtimeIn = randomTime(19, 0, 15);
    const overtimeOut = randomTime(22, 0, 30);

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(checkIn.hours, checkIn.minutes, 0, 0)),
      logType: 'CHECK-IN',
      rawType: 0,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 0 }
    });

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(checkOut.hours, checkOut.minutes, 0, 0)),
      logType: 'CHECK-OUT',
      rawType: 1,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 1 }
    });

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(overtimeIn.hours, overtimeIn.minutes, 0, 0)),
      logType: 'OVERTIME-IN',
      rawType: 4,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 4 }
    });

    logs.push({
      employeeId,
      timestamp: new Date(dateObj.setHours(overtimeOut.hours, overtimeOut.minutes, 0, 0)),
      logType: 'OVERTIME-OUT',
      rawType: 5,
      deviceId: DEVICE.id,
      deviceName: DEVICE.name,
      rawData: { employeeId, type: 5 }
    });
  }

  return logs;
}

/**
 * Generate dummy data for the last 30 days
 */
async function generateDummyData() {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');

    // First, ensure the device exists in the database
    const deviceData = {
      deviceId: DEVICE.id,
      name: DEVICE.name,
      ip: '192.168.1.100',
      port: 4370,
      enabled: true,
      location: 'Main Gate',
      lastSeenAt: new Date(),
      status: {
        userCount: EMPLOYEES.length,
        fingerCount: 0,
        attCount: 0,
        faceCount: 0,
        firmware: 'Dummy Device v1.0',
        platform: 'Test Platform'
      },
      capabilities: {
        hasFingerprint: true,
        hasFace: false,
        hasPalm: false,
        hasCard: true,
        fpVersion: '10',
        maxUsers: 1000,
        maxFingers: 10000,
        maxAttLogs: 100000
      }
    };

    // Upsert device (create if doesn't exist, update if exists)
    await Device.findOneAndUpdate(
      { deviceId: DEVICE.id },
      deviceData,
      { upsert: true, new: true }
    );
    logger.info(`✓ Device registered: ${DEVICE.name} (${DEVICE.id})`);

    // Clear existing dummy data (optional - comment out if you want to keep existing data)
    await AttendanceLog.deleteMany({ deviceId: DEVICE.id });
    await DeviceUser.deleteMany({}); // Clear existing users
    logger.info(`✓ Cleared existing logs and users for ${DEVICE.name}`);

    const allLogs = [];
    const userRecords = [];
    const today = new Date();

    // Create DeviceUser records
    const DEPARTMENTS = ['Engineering', 'HR', 'Sales', 'Marketing', 'Operations'];
    const DIVISIONS = ['North', 'South', 'East', 'West', 'HQ'];

    for (const emp of EMPLOYEES) {
      userRecords.push({
        userId: emp.id,
        name: emp.name,
        card: Math.floor(10000000 + Math.random() * 90000000).toString(), // Random 8-digit card
        role: 0, // User
        password: '',
        department: DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)],
        division: DIVISIONS[Math.floor(Math.random() * DIVISIONS.length)],
        lastDeviceId: DEVICE.id,
        lastSyncedAt: new Date()
      });
    }

    if (userRecords.length > 0) {
      await DeviceUser.insertMany(userRecords);
      logger.info(`✓ Created ${userRecords.length} user records`);
    }

    // Generate data for the last 30 days
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const currentDate = new Date(today);
      currentDate.setDate(currentDate.getDate() - dayOffset);

      // Skip weekends (Saturday = 6, Sunday = 0)
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue;
      }

      // Randomly assign patterns to employees
      for (const employee of EMPLOYEES) {
        // 10% chance of no attendance (absent)
        if (Math.random() < 0.1) {
          continue;
        }

        // Determine pattern for this day
        const rand = Math.random();
        let pattern;
        if (rand < 0.6) {
          pattern = 'normal'; // 60% normal shift
        } else if (rand < 0.9) {
          pattern = 'with-break'; // 30% with break
        } else {
          pattern = 'overtime'; // 10% overtime
        }

        const dayLogs = createDayLogs(employee.id, new Date(currentDate), pattern);
        allLogs.push(...dayLogs);
      }
    }

    // Insert all logs in bulk
    if (allLogs.length > 0) {
      await AttendanceLog.insertMany(allLogs, { ordered: false });

      // Update device's attendance log count
      await Device.findOneAndUpdate(
        { deviceId: DEVICE.id },
        {
          'status.attCount': allLogs.length,
          lastLogTimestamp: new Date()
        }
      );

      logger.info(`✅ Successfully inserted ${allLogs.length} dummy attendance logs`);
      logger.info(`📊 Data for ${EMPLOYEES.length} employees over ~30 working days`);
      logger.info(`📅 Date range: ${new Date(today.setDate(today.getDate() - 29)).toDateString()} to ${new Date().toDateString()}`);
      logger.info('');
      logger.info('✅ The device is now visible in the dashboard!');
      logger.info('   📱 Open http://localhost:4000/dashboard.html');
      logger.info('   👉 Click on "Main Gate Device" in the left sidebar');
      logger.info('   📊 View attendance logs, user info, and export data');
      logger.info('');
      logger.info('You can test the export feature with:');
      logger.info(`  - Employee IDs: ${EMPLOYEES.map(e => e.id).join(', ')}`);
      logger.info(`  - Start Date: ${new Date(today.setDate(today.getDate() - 29)).toISOString().split('T')[0]}`);
      logger.info(`  - End Date: ${new Date().toISOString().split('T')[0]}`);
    }

    await mongoose.connection.close();
    logger.info('Connection closed');
    process.exit(0);

  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key errors are expected when re-running the script
      logger.info('⚠️  Some duplicate logs were skipped (this is normal when re-running the script)');
      await mongoose.connection.close();
      process.exit(0);
    } else {
      logger.error('Error generating dummy data:', error);
      await mongoose.connection.close();
      process.exit(1);
    }
  }
}

// Run the script
generateDummyData();
