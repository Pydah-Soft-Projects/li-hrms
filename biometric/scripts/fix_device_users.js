const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB...');

        const DeviceUser = require('../src/models/DeviceUser');

        const result = await DeviceUser.updateMany(
            { lastDeviceId: { $exists: false } },
            { $set: { lastDeviceId: 'BJ2C230360121' } }
        );

        console.log(`Successfully linked ${result.modifiedCount} users to device BJ2C230360121`);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

run();
