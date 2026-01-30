const mongoose = require('mongoose');
require('dotenv').config();

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

/**
 * Connects to the configured MongoDB instance and removes all documents from a predefined list of transactional collections while leaving core configuration data intact.
 *
 * Performs the full cleanup run: establishes the database connection, iterates the target collections to delete their documents, logs per-collection outcomes, and finally disconnects from MongoDB and exits the process.
 */
async function runCleanup() {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoURI);
        console.log('Connected successfully.\n');

        console.log('--- STARTING DATABASE CLEANUP ---');
        console.log('Targeting transactional data while preserving core configuration.\n');

        const db = mongoose.connection.db;
        const results = {};

        for (const colName of collectionsToClear) {
            try {
                const collection = db.collection(colName);
                const countBefore = await collection.countDocuments();

                if (countBefore > 0) {
                    const deleteResult = await collection.deleteMany({});
                    results[colName] = deleteResult.deletedCount;
                    console.log(`[CLEANED] ${colName.padEnd(30)}: Deleted ${deleteResult.deletedCount} records.`);
                } else {
                    console.log(`[SKIPPED] ${colName.padEnd(30)}: Already empty.`);
                }
            } catch (err) {
                console.error(`[ERROR]   Failed to clear ${colName}:`, err.message);
            }
        }

        console.log('\n--- CLEANUP COMPLETE ---');
        console.log('System reset successful. Core configuration (Employees, Depts, etc.) is intact.');

    } catch (error) {
        console.error('Critical Error:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

runCleanup();