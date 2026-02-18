const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function debug() {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const coll = db.collection('attendancerawlogs');

    const total = await coll.countDocuments();
    const withId = await coll.countDocuments({ employeeId: { $exists: true } });
    const withNum = await coll.countDocuments({ employeeNumber: { $exists: true } });

    console.log(`Total Logs: ${total}`);
    console.log(`Logs with employeeId: ${withId}`);
    console.log(`Logs with employeeNumber: ${withNum}`);

    if (withId > 0) {
        const sample = await coll.findOne({ employeeId: { $exists: true } });
        console.log('Sample Log with employeeId:', JSON.stringify(sample, null, 2));
    }

    await mongoose.disconnect();
}

debug();
