const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const collectionsToClear = [
    // 1. Attendance & Roster
    'attendance_dailies',
    'monthly_attendance_summaries',
    'attendance_raw_logs',
    'pre_scheduled_shifts',
    'roster_metas',
    'confused_shifts',

    // 2. Payroll & Pay Register
    'pay_register_summaries',
    'payroll_batches',
    'payroll_records',
    'payroll_transactions',

    // 3. Applications & Requests
    'leaves',
    'leave_splits',
    'monthly_leave_records',
    'ods',
    'ots',

    // 4. Financial Items
    'arrears_requests',
    'bonus_batches',
    'bonus_records',
    'loans'
];

function maskUri(uri) {
    if (!uri || typeof uri !== 'string') return '(missing)';
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
}

async function runCleanup() {
    try {
        if (!process.env.MONGODB_URI) {
            console.error('Missing MONGODB_URI. Set it in .env and try again.');
            process.exit(1);
        }
        const mongoURI = process.env.MONGODB_URI;

        if (process.env.NODE_ENV === 'production' && process.env.FORCE_CLEANUP !== 'true') {
            console.error('Refusing to run destructive cleanup in production without FORCE_CLEANUP=true');
            process.exit(1);
        }

        const readline = require('readline').promises;
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const masked = maskUri(mongoURI);
        console.log('Target MongoDB URI (masked):', masked);
        const answer = await rl.question('Type YES to proceed with cleanup: ');
        rl.close();
        if (answer.trim() !== 'YES') {
            console.log('Aborted. No changes made.');
            process.exit(0);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoURI);
        console.log('Connected successfully.\n');

        console.log('--- STARTING DATABASE CLEANUP ---');
        console.log('Targeting transactional data while preserving core configuration.\n');

        const db = mongoose.connection.db;
        const results = {};
        const failedCollections = [];

        for (const colName of collectionsToClear) {
            try {
                const collection = db.collection(colName);
                const countBefore = await collection.countDocuments();

                if (countBefore > 0) {
                    const deleteResult = await collection.deleteMany({});
                    results[colName] = deleteResult.deletedCount;
                    console.log(`[CLEANED] ${colName.padEnd(30)}: Deleted ${deleteResult.deletedCount} records.`);
                } else {
                    results[colName] = 0;
                    console.log(`[SKIPPED] ${colName.padEnd(30)}: Already empty.`);
                }
            } catch (err) {
                console.error(`[ERROR]   Failed to clear ${colName}:`, err.message);
                results[colName] = { error: err.message };
                failedCollections.push(colName);
            }
        }

        const totalDeleted = Object.values(results).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
        const cleaned = Object.entries(results).filter(([, v]) => typeof v === 'number' && v > 0).map(([k]) => k);
        const skipped = Object.entries(results).filter(([, v]) => v === 0).map(([k]) => k);
        console.log('\n--- CLEANUP COMPLETE ---');
        console.log('Summary:', JSON.stringify({ totalDeleted, cleanedCount: cleaned.length, skippedCount: skipped.length, failedCollections }, null, 2));
        console.log('System reset successful. Core configuration (Employees, Depts, etc.) is intact.');

    } catch (error) {
        console.error('Critical Error:', error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        process.exit(process.exitCode ?? 0);
    }
}

runCleanup();
