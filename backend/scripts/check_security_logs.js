const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const SecurityLog = require('../security/model/SecurityLog');
require('../employees/model/Employee');
require('../users/model/User');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkLogs() {
    if (!process.env.MONGODB_URI) {
        // Fallback for script if .env issue
        console.error('No MONGODB_URI');
        // Try hardcoded if needed, but robust script worked so env is likely fine.
    }
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/li-hrms-db');

    const logs = await SecurityLog.find().sort({ timestamp: -1 }).limit(10).populate('verifiedBy', 'name');
    console.log(`Found ${logs.length} Security Logs.`);
    logs.forEach(log => {
        console.log(`[${log.timestamp.toISOString()}] ${log.actionType} - Status: ${log.status} - By: ${log.verifiedBy ? log.verifiedBy.name : 'Unknown'}`);
        console.log(`   Details: ${log.details}`);
    });

    await mongoose.disconnect();
}

checkLogs();
