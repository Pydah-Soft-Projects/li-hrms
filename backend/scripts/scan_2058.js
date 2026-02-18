const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function scan() {
    await mongoose.connect(MONGO_URI);
    const db = mongoose.connection.db;
    const coll = db.collection('attendancerawlogs');

    console.log('--- SCANNING FOR "2058" ---');

    // Scan with different field names
    const fields = ['employeeId', 'employeeNumber', 'emp_no', 'id', 'user_id', 'card_no'];
    for (const f of fields) {
        const count = await coll.countDocuments({ [f]: '2058' });
        console.log(`Field ${f.padEnd(15)}: ${count} docs`);
        if (count > 0) {
            const sample = await coll.findOne({ [f]: '2058' });
            console.log(`  Sample:`, JSON.stringify(sample, null, 2));
        }
    }

    // Also scan case-insensitive
    const ciCount = await coll.countDocuments({ employeeId: /2058/i });
    console.log(`EmployeeId CI     : ${ciCount} docs`);

    await mongoose.disconnect();
}

scan();
