const mongoose = require('mongoose');
const PayrollRecord = require('../payroll/model/PayrollRecord');
const PayrollBatch = require('../payroll/model/PayrollBatch');
const PayrollTransaction = require('../payroll/model/PayrollTransaction');

async function runDelete() {
    try {
        console.log('--- Deleting Payroll Data for January 2026 ---');

        // 1. Connect to DB
        await mongoose.connect('mongodb://localhost:27017/hrms');
        console.log('✅ Connected to Database (hrms)');

        const month = '2026-01';

        // 2. Delete Payroll Records (Payslips)
        const prDelete = await PayrollRecord.deleteMany({ month });
        console.log(`🗑️ Deleted ${prDelete.deletedCount} Payroll Records (Payslips) for ${month}`);

        // 3. Delete Payroll Batches
        const batchDelete = await PayrollBatch.deleteMany({ month });
        console.log(`🗑️ Deleted ${batchDelete.deletedCount} Payroll Batches for ${month}`);

        // 4. Delete associated Transactions (usually they share target month or linked via recordId)
        // Check if transactions have month field or need to be filtered by records
        const txDelete = await PayrollTransaction.deleteMany({ month });
        console.log(`🗑️ Deleted ${txDelete.deletedCount} Payroll Transactions for ${month}`);

        console.log('\n--- Cleanup Complete ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Deletion failed:', err);
        process.exit(1);
    }
}

runDelete();
