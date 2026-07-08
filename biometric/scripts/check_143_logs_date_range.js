require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

/**
 * ============================================================
 * CHECK LOGS DATE RANGE — Thumb 143 / Device NFZ8244504974
 * ============================================================
 * Shows total log count, earliest date, latest date, and a
 * month-wise breakdown for employee 143 from device NFZ8244504974.
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

    const SOURCE_THUMB_ID = "143";
    const DEVICE_ID       = "NFZ8244504974";

    console.log('\n🔍 Checking log date range for thumb 143 / device NFZ8244504974...\n');
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoURI);
    console.log('✅ Connected.\n');

    const query = { employeeId: SOURCE_THUMB_ID, deviceId: DEVICE_ID };

    // ── Total count ──────────────────────────────────────────────────────────
    const totalCount = await AttendanceLog.countDocuments(query);

    if (totalCount === 0) {
        console.log('❌ No logs found for thumb 143 on device NFZ8244504974.');
        await mongoose.disconnect();
        return;
    }

    // ── Earliest & latest log ────────────────────────────────────────────────
    const earliest = await AttendanceLog.findOne(query).sort({ timestamp: 1 }).select('timestamp logType').lean();
    const latest   = await AttendanceLog.findOne(query).sort({ timestamp: -1 }).select('timestamp logType').lean();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Thumb ID  : ${SOURCE_THUMB_ID}`);
    console.log(`  Device    : ${DEVICE_ID}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Total logs : ${totalCount}`);
    console.log(`  From       : ${earliest.timestamp.toISOString().slice(0, 10)}  (${earliest.logType})`);
    console.log(`  To         : ${latest.timestamp.toISOString().slice(0, 10)}  (${latest.logType})`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // ── Month-wise breakdown ─────────────────────────────────────────────────
    const monthBreakdown = await AttendanceLog.aggregate([
        { $match: query },
        {
            $group: {
                _id: {
                    year:  { $year: '$timestamp' },
                    month: { $month: '$timestamp' },
                },
                count: { $sum: 1 },
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
