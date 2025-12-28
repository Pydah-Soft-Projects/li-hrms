const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Device = require('./src/models/Device');

dotenv.config();

async function checkSync() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';
        await mongoose.connect(MONGODB_URI);

        const devices = await Device.find({});
        console.log('--- DEVICE SYNC STATUS ---');
        devices.forEach(d => {
            console.log(`- ${d.name} (${d.deviceId}):`);
            console.log(`  Last Sync At: ${d.lastSyncAt}`);
            console.log(`  Last Sync Status: ${d.lastSyncStatus}`);
            console.log(`  Last Log Timestamp: ${d.lastLogTimestamp ? d.lastLogTimestamp.toISOString() : 'N/A'}`);
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkSync();
