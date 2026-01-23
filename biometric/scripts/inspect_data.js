const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const AdmsRawLog = require('../src/models/AdmsRawLog');
        const DeviceUser = require('../src/models/DeviceUser');

        console.log('--- LATEST USERINFO RAW LOG ---');
        const log = await AdmsRawLog.findOne({ table: { $in: ['USERINFO', 'USER'] } }).sort({ receivedAt: -1 });
        if (log) {
            console.log(`SN: ${log.serialNumber}, Table: ${log.table}`);
            console.log('Body:', log.body);
        } else {
            console.log('No USERINFO logs found.');
        }

        console.log('\n--- LATEST PARSED USERS ---');
        const users = await DeviceUser.find().sort({ updatedAt: -1 }).limit(3);
        console.log(JSON.stringify(users, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
