const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function check() {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const coll = db.collection('attendancerawlogs');

    const counts = await coll.aggregate([
        {
            $project: {
                year: { $year: "$timestamp" }
            }
        },
        {
            $group: {
                _id: "$year",
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: -1 } }
    ]).toArray();

    console.log('YEARLY DISTRIBUTION:', JSON.stringify(counts, null, 2));
    await mongoose.disconnect();
}

check();
