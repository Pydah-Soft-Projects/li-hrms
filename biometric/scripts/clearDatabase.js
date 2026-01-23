require('dotenv').config();
const mongoose = require('mongoose');
const AttendanceLog = require('../src/models/AttendanceLog');
const Device = require('../src/models/Device');
const AdmsRawLog = require('../src/models/AdmsRawLog');
const DeviceUser = require('../src/models/DeviceUser');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';

async function clearDatabase() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to:', MONGODB_URI);

        console.log('\n--- STARTING CLEANUP ---');

        // Delete all attendance logs
        const attLogsResult = await AttendanceLog.deleteMany({});
        console.log(`✅ Cleared AttendanceLog: ${attLogsResult.deletedCount} records removed.`);

        // Delete all devices
        const deviceResult = await Device.deleteMany({});
        console.log(`✅ Cleared Devices: ${deviceResult.deletedCount} records removed.`);

        // Delete all raw ADMS logs
        const admsRawResult = await AdmsRawLog.deleteMany({});
        console.log(`✅ Cleared AdmsRawLog: ${admsRawResult.deletedCount} records removed.`);

        // Delete all device users
        const deviceUserResult = await DeviceUser.deleteMany({});
        console.log(`✅ Cleared DeviceUser: ${deviceUserResult.deletedCount} records removed.`);

        console.log('--- CLEANUP COMPLETED ---\n');

        console.log('Database is now clean.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    }
}

// Security confirmation check could be added here if needed, 
// but for now we follow user's direct instruction.
clearDatabase();
