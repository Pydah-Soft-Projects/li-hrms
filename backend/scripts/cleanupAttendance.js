/**
 * ============================================================
 * ATTENDANCE DATA CLEANUP SCRIPT
 * ============================================================
 * DELETES ALL AttendanceDaily and AttendanceRawLog records.
 * 
 * Usage:
 *   node scripts/cleanupAttendance.js
 * ============================================================
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function main() {
    console.log('\n🗑️ Starting Attendance Data Cleanup\n');

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to HRMS database');

        const AttendanceDaily = mongoose.connection.collection('attendancedailies');
        const AttendanceRawLog = mongoose.connection.collection('attendancerawlogs');

        // Optional: Also clear monthly summaries if needed, 
        // but re-syncing logs will trigger recalculation anyway.
        const MonthlyAttendanceSummary = mongoose.connection.collection('monthlyattendancesummaries');

        console.log('⏳ Deleting AttendanceDaily records...');
        const dailyResult = await AttendanceDaily.deleteMany({});
        console.log(`✅ Deleted ${dailyResult.deletedCount} daily records`);

        console.log('⏳ Deleting AttendanceRawLog records...');
        const rawResult = await AttendanceRawLog.deleteMany({});
        console.log(`✅ Deleted ${rawResult.deletedCount} raw log records`);

        console.log('⏳ Deleting MonthlyAttendanceSummary records...');
        const summaryResult = await MonthlyAttendanceSummary.deleteMany({});
        console.log(`✅ Deleted ${summaryResult.deletedCount} summary records`);

        console.log('\n✨ Database cleanup complete!');
    } catch (err) {
        console.error('❌ Cleanup failed:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected.');
    }
}

main();
