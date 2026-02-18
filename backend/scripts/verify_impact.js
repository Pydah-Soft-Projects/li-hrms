/**
 * Verification script to dump specific AttendanceDetail records
 * Used to compare Before/After state of reprocessing.
 */
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function dump() {
    await mongoose.connect(MONGO_URI);
    const AttendanceDaily = require('../attendance/model/AttendanceDaily');

    // Pick specific candidates for comparison
    const candidates = [
        { emp: '7003', date: '2025-02-10' },
        { emp: '7005', date: '2025-02-11' },
        { emp: '7012', date: '2025-02-15' },
        { emp: '7015', date: '2025-02-18' }
    ];

    console.log('\n--- ATTENDANCE DATA DUMP ---');
    for (const cand of candidates) {
        const record = await AttendanceDaily.findOne({ employeeNumber: cand.emp, date: cand.date }).lean();
        if (record) {
            console.log(`\n👤 EMP: ${cand.emp} | 📅 DATE: ${cand.date}`);
            console.log(`   Status: ${record.status}`);
            console.log(`   Total Working: ${record.totalWorkingHours}h`);
            console.log(`   Total LateIn: ${record.totalLateInMinutes}m`);
            console.log(`   Total EarlyOut: ${record.totalEarlyOutMinutes}m`);

            if (record.shifts && record.shifts.length > 0) {
                record.shifts.forEach((s, i) => {
                    console.log(`   Shift ${i + 1}: ${s.shiftName} (${s.shiftStartTime}-${s.shiftEndTime})`);
                    console.log(`      Punches: ${s.inTime?.toISOString()} -> ${s.outTime?.toISOString()}`);
                    console.log(`      Late: ${s.lateInMinutes}m | Early: ${s.earlyOutMinutes}m | Status: ${s.status}`);
                });
            } else {
                console.log('   No shifts recorded.');
            }
        } else {
            console.log(`\n❌ No record found for ${cand.emp} on ${cand.date}`);
        }
    }

    await mongoose.disconnect();
}

dump();
