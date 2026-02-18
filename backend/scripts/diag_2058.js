const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function diag() {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const Raw = db.collection('attendancerawlogs');

    const logs = await Raw.find({
        timestamp: { $gte: new Date('2024-05-01T00:00:00Z'), $lte: new Date('2024-05-01T23:59:59Z') }
    }).limit(2).toArray();

    console.log('SAMPLE MAY 2024:', JSON.stringify(logs, null, 2));

    // Check 2058 specifically
    const count2058 = await Raw.countDocuments({
        $or: [{ employeeId: '2058' }, { employeeNumber: '2058' }]
    });
    console.log('Count 2058 Total:', count2058);

    const sample2058 = await Raw.findOne({
        $or: [{ employeeId: '2058' }, { employeeNumber: '2058' }]
    });
    console.log('Sample 2058:', JSON.stringify(sample2058, null, 2));

    await mongoose.disconnect();
}

diag();
