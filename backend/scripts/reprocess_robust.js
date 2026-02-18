/**
 * ============================================================
 * ROBUST ATTENDANCE REPROCESSING SCRIPT (Clean Slate)
 * ============================================================
 * Handles multiple schemas for AttendanceRawLog.
 */

require('dotenv').config();
const mongoose = require('mongoose');

// CLI args
const args = process.argv.slice(2);
const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
};
const FROM_DATE = getArg('--from');   // YYYY-MM-DD
const TO_DATE = getArg('--to');     // YYYY-MM-DD
const EMP_FILTER = getArg('--employee');
const BATCH_SIZE = parseInt(getArg('--batch') || '20');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function main() {
    console.log('\n🚀 Starting Robust Reprocessing...\n');

    await mongoose.connect(MONGO_URI);

    const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
    const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');
    const Settings = require('../settings/model/Settings');
    const db = mongoose.connection.db;
    const RawLogsColl = db.collection('attendancerawlogs');

    const generalConfig = await Settings.getSettingsByCategory('general');

    // 1. Build Query (Time range based)
    const query = {
        timestamp: { $gte: new Date('2020-01-01') }
    };

    if (FROM_DATE) {
        // Approximate range: starting slightly before FROM_DATE to catch overnight shifts
        const start = new Date(`${FROM_DATE}T00:00:00Z`);
        start.setHours(start.getHours() - 6); // Offset IST
        query.timestamp.$gte = start;
    }
    if (TO_DATE) {
        const end = new Date(`${TO_DATE}T23:59:59Z`);
        query.timestamp.$lte = end;
    }

    if (EMP_FILTER) {
        query.$or = [
            { employeeNumber: EMP_FILTER.toUpperCase() },
            { employeeId: EMP_FILTER.toUpperCase() }
        ];
    }

    // 2. Find All Employees
    console.log('🔍 Scanning raw logs for employees...');
    const distinctNumbers = await RawLogsColl.distinct('employeeNumber', query);
    const distinctIds = await RawLogsColl.distinct('employeeId', query);
    const allEmps = [...new Set([...distinctNumbers, ...distinctIds])].filter(Boolean);

    console.log(`📊 Found ${allEmps.length} employees.\n`);

    const stats = { processed: 0, succeeded: 0, errors: 0 };

    for (let i = 0; i < allEmps.length; i += BATCH_SIZE) {
        const batch = allEmps.slice(i, i + BATCH_SIZE);

        for (const empNo of batch) {
            try {
                // Fetch all logs for this employee in the range
                const empQuery = {
                    $and: [
                        { $or: [{ employeeNumber: empNo }, { employeeId: empNo }] },
                        query
                    ]
                };
                const logs = await RawLogsColl.find(empQuery).sort({ timestamp: 1 }).toArray();

                if (logs.length === 0) continue;

                // Normalize and compute "Date" from IST-shifted timestamp
                const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
                const normalizedLogs = logs.map(l => {
                    const istTime = new Date(new Date(l.timestamp).getTime() + IST_OFFSET_MS);
                    const dateStr = istTime.toISOString().slice(0, 10);

                    // Punch identification
                    let type = l.type || l.logType || l.status || (l.punch_state === 0 ? 'IN' : l.punch_state === 1 ? 'OUT' : null);
                    if (typeof type === 'string') {
                        if (type.toUpperCase().includes('IN')) type = 'IN';
                        else if (type.toUpperCase().includes('OUT')) type = 'OUT';
                    }

                    return {
                        _id: l._id,
                        timestamp: new Date(l.timestamp), // Keep raw UTC, processMultiShift handles shifting
                        date: dateStr,
                        type: type
                    };
                }).filter(l => l.type === 'IN' || l.type === 'OUT');

                const dates = [...new Set(normalizedLogs.map(l => l.date))].sort();
                if (FROM_DATE) {
                    // Filter dates to the requested range
                    const filteredDates = dates.filter(d => d >= FROM_DATE && (!TO_DATE || d <= TO_DATE));
                    if (filteredDates.length === 0) continue;

                    console.log(`👤 ${empNo} — Processing ${filteredDates.length} dates...`);
                    for (const d of filteredDates) {
                        const result = await processMultiShiftAttendance(empNo, d, normalizedLogs, generalConfig);
                        if (result.success) {
                            stats.succeeded++;
                            await recalculateOnAttendanceUpdate(empNo, d);
                        } else {
                            stats.errors++;
                        }
                    }
                } else {
                    console.log(`👤 ${empNo} — Processing ${dates.length} dates...`);
                    for (const d of dates) {
                        const result = await processMultiShiftAttendance(empNo, d, normalizedLogs, generalConfig);
                        if (result.success) {
                            stats.succeeded++;
                            await recalculateOnAttendanceUpdate(empNo, d);
                        } else {
                            stats.errors++;
                        }
                    }
                }
                stats.processed++;
            } catch (err) {
                console.error(`❌ Error processing ${empNo}:`, err.message);
                stats.errors++;
            }
        }
    }

    console.log(`\n✅ Reprocessing Complete!`);
    console.log(`   Employees: ${stats.processed}`);
    console.log(`   Days:      ${stats.succeeded}`);
    console.log(`   Errors:    ${stats.errors}`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
