/**
 * ============================================================
 * ATTENDANCE CLEAN SLATE RESET SCRIPT
 * ============================================================
 * Wipes AttendanceDaily and MonthlyAttendanceSummary records.
 * Use this BEFORE reprocess_attendance.js to ensure a fresh state.
 * 
 * Usage:
 *   node scripts/clean_slate_reset.js --from 2024-01-01 --to 2024-05-31
 *   node scripts/clean_slate_reset.js --employee EMP001
 *   node scripts/clean_slate_reset.js --all (WIPE EVERYTHING - CAUTION)
 * ============================================================
 */

require('dotenv').config();
const mongoose = require('mongoose');

// ── CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
};
const FROM_DATE = getArg('--from');
const TO_DATE = getArg('--to');
const EMP_FILTER = getArg('--employee');
const WIPE_ALL = args.includes('--all');

const MONGO_URI = 'mongodb://localhost:27017/li-hrms';

async function main() {
    console.log('\n🔥 ATTENDANCE CLEAN SLATE RESET 🔥\n');

    if (!FROM_DATE && !EMP_FILTER && !WIPE_ALL) {
        console.log('❌ Error: Please specify --from/--to, --employee, or --all');
        console.log('Example: node scripts/clean_slate_reset.js --from 2025-02-01 --to 2025-02-28');
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const AttendanceDaily = require('../attendance/model/AttendanceDaily');
    const MonthlySummary = require('../attendance/model/MonthlyAttendanceSummary');

    const dailyQuery = {};
    const summaryQuery = {};

    if (FROM_DATE || TO_DATE) {
        dailyQuery.date = {};
        if (FROM_DATE) dailyQuery.date.$gte = FROM_DATE;
        if (TO_DATE) dailyQuery.date.$lte = TO_DATE;

        if (FROM_DATE) {
            const [y, m] = FROM_DATE.split('-');
            summaryQuery.month = { $gte: `${y}-${m}` };
        }
        if (TO_DATE) {
            const [y, m] = TO_DATE.split('-');
            summaryQuery.month = { ...summaryQuery.month, $lte: `${y}-${m}` };
        }
    }

    if (EMP_FILTER) {
        dailyQuery.employeeNumber = EMP_FILTER.toUpperCase();
        summaryQuery.employeeNumber = EMP_FILTER.toUpperCase();
    }

    console.log('Target Query (Daily):', JSON.stringify(dailyQuery, null, 2));
    console.log('Target Query (Summary):', JSON.stringify(summaryQuery, null, 2));

    const dailyCount = await AttendanceDaily.countDocuments(dailyQuery);
    const summaryCount = await MonthlySummary.countDocuments(summaryQuery);

    if (dailyCount === 0 && summaryCount === 0) {
        console.log('\n✨ No records found to delete. Clean slate! ✨');
        await mongoose.disconnect();
        return;
    }

    console.log(`\n⚠️  WARNING: About to delete ${dailyCount} daily records and ${summaryCount} monthly summaries.`);
    console.log('Continuing in 5 seconds... (Ctrl+C to abort)');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const dailyResult = await AttendanceDaily.deleteMany(dailyQuery);
    const summaryResult = await MonthlySummary.deleteMany(summaryQuery);

    console.log(`\n✅ Deleted ${dailyResult.deletedCount} daily records.`);
    console.log(`✅ Deleted ${summaryResult.deletedCount} monthly summaries.`);

    console.log('\n✨ Reset complete. You can now run reprocess_attendance.js ✨\n');

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('\n❌ Fatal error:', err);
    mongoose.disconnect();
    process.exit(1);
});
