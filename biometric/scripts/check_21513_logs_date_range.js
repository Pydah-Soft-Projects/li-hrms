require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

/**
 * ============================================================
 * CHECK LOGS DATE RANGE — Employee 21513
 * ============================================================
 * Shows total log count, earliest date, latest date, and a
 * month-wise breakdown for employee 21513 across all devices.
 * ============================================================
 */

const attendanceLogSchema = new mongoose.Schema({
    employeeId: String,
    timestamp: Date,
    logType: String,
    rawType: Number,
    deviceId: String,
    deviceName: String,
}, { timestamps: true });

const AttendanceLog =
    mongoose.models.AttendanceLog ||
    mongoose.model('AttendanceLog', attendanceLogSchema);

async function main() {
    const mongoURI = 'mongodb+srv://teampydah:TeamPydah@teampydah.y4zj6wh.mongodb.net/biometric_logs';

    const TARGET_EMP_ID = "21513";

    console.log(`\n🔍 Checking all biometric logs for employee ${TARGET_EMP_ID}...\n`);
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected.\n');

    const query = { employeeId: TARGET_EMP_ID };

    // ── Total count ──────────────────────────────────────────────────────────
    const totalCount = await AttendanceLog.countDocuments(query);

    if (totalCount === 0) {
        console.log(`❌ No logs found for employee ${TARGET_EMP_ID} in biometric_logs.`);
        await mongoose.disconnect();
        return;
    }

    // ── Earliest & latest log ────────────────────────────────────────────────
    const earliest = await AttendanceLog.findOne(query).sort({ timestamp: 1 }).select('timestamp logType deviceId deviceName').lean();
    const latest   = await AttendanceLog.findOne(query).sort({ timestamp: -1 }).select('timestamp logType deviceId deviceName').lean();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Employee   : ${TARGET_EMP_ID}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Total logs : ${totalCount}`);
    console.log(`  From       : ${earliest.timestamp.toISOString().slice(0, 10)}  (${earliest.logType} | device: ${earliest.deviceId || 'N/A'})`);
    console.log(`  To         : ${latest.timestamp.toISOString().slice(0, 10)}  (${latest.logType} | device: ${latest.deviceId || 'N/A'})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // ── Device-wise breakdown ────────────────────────────────────────────────
    const deviceBreakdown = await AttendanceLog.aggregate([
        { $match: query },
        {
            $group: {
                _id: '$deviceId',
                deviceName: { $first: '$deviceName' },
                count:      { $sum: 1 },
                firstLog:   { $min: '$timestamp' },
                lastLog:    { $max: '$timestamp' },
            },
        },
        { $sort: { firstLog: 1 } },
    ]);

    console.log('\n  Device-wise breakdown:\n');
    console.log('  Device ID        | Device Name         | Count | First Date  | Last Date');
    console.log('  -----------------|---------------------|-------|-------------|------------');
    for (const d of deviceBreakdown) {
        const devId   = (d._id || 'N/A').padEnd(17);
        const devName = (d.deviceName || 'N/A').padEnd(20);
        const first   = d.firstLog.toISOString().slice(0, 10);
        const last    = d.lastLog.toISOString().slice(0, 10);
        console.log(`  ${devId}| ${devName}| ${String(d.count).padEnd(6)}| ${first}  | ${last}`);
    }

    // ── Month-wise breakdown ─────────────────────────────────────────────────
    const monthBreakdown = await AttendanceLog.aggregate([
        { $match: query },
        {
            $group: {
                _id: {
                    year:  { $year: '$timestamp' },
                    month: { $month: '$timestamp' },
                },
                count:    { $sum: 1 },
                firstLog: { $min: '$timestamp' },
                lastLog:  { $max: '$timestamp' },
            },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    console.log('\n  Month-wise breakdown:\n');
    console.log('  Month        | Count | First Date  | Last Date');
    console.log('  -------------|-------|-------------|------------');
    for (const m of monthBreakdown) {
        const label = `${m._id.year}-${String(m._id.month).padStart(2, '0')}`;
        const first = m.firstLog.toISOString().slice(0, 10);
        const last  = m.lastLog.toISOString().slice(0, 10);
        console.log(`  ${label.padEnd(13)}| ${String(m.count).padEnd(6)}| ${first}  | ${last}`);
    }

    console.log('\n✅ Done.\n');
    await mongoose.disconnect();
    console.log('🏁 Disconnected.');
}

main().catch(err => {
    console.error('❌ Script failed:', err.message);
    process.exit(1);
});
