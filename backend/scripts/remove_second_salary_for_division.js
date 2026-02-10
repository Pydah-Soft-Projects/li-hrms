/**
 * REMOVE REGULAR PAYROLL + SECOND SALARY FOR A SPECIFIC DIVISION
 *
 * PRODUCTION DATABASE - USE WITH EXTREME CAUTION
 *
 * Targets Division ID: 6957b10390c14ea32bbe4fb7
 *
 * Regular Payroll:
 *   - PayrollTransaction (linked to records)
 *   - PayrollRecord (payslips)
 *   - PayrollBatch (batches)
 *
 * Second Salary:
 *   - SecondSalaryRecord (payslips)
 *   - SecondSalaryBatch (batches)
 *
 * Safety features:
 *   - DRY_RUN by default: shows what would be deleted, NO actual deletion
 *   - Actual deletion requires: DRY_RUN=false or --delete flag
 *   - Deletes in correct referential order (transactions/records first, then batches)
 *
 * How to run:
 *   1. DRY RUN (recommended first):
 *      node scripts/remove_second_salary_for_division.js
 *      node scripts/remove_second_salary_for_division.js --dry-run
 *      $env:DRY_RUN="true"; node scripts/remove_second_salary_for_division.js   (PowerShell)
 *
 *   2. ACTUAL DELETION (after verifying dry-run output):
 *      node scripts/remove_second_salary_for_division.js --delete
 *      $env:DRY_RUN="false"; node scripts/remove_second_salary_for_division.js  (PowerShell)
 *
 * Prerequisites:
 *   - MongoDB connection URL in .env as MONGODB_URI, OR pass via env
 *   - Verify division ID is correct before running
 */

const mongoose = require('mongoose');
const path = require('path');

// Load .env from backend root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SecondSalaryBatch = require('../payroll/model/SecondSalaryBatch');
const SecondSalaryRecord = require('../payroll/model/SecondSalaryRecord');
const PayrollBatch = require('../payroll/model/PayrollBatch');
const PayrollRecord = require('../payroll/model/PayrollRecord');
const PayrollTransaction = require('../payroll/model/PayrollTransaction');

const DIVISION_ID = '6957b10390c14ea32bbe4fb7';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://teampydah:aslkdjlksdkjf@teampydah.y4zj6wh.mongodb.net/';

// --delete flag = live deletion
const args = process.argv.slice(2);
const forceDelete = args.includes('--delete');
const isDryRun = !forceDelete && process.env.DRY_RUN !== 'false';

// Validate ObjectId format (24 hex chars)
function isValidObjectId(str) {
    return /^[a-f0-9]{24}$/i.test(str);
}

async function run() {
    console.log('\n========================================');
    console.log('REMOVE PAYROLL (REGULAR + SECOND) FOR DIVISION');
    console.log('========================================');
    console.log('Division ID:', DIVISION_ID);
    console.log('Mode:', isDryRun ? '🔍 DRY RUN (no deletion)' : '⚠️  LIVE DELETION');
    console.log('========================================\n');

    if (!isValidObjectId(DIVISION_ID)) {
        console.error('❌ Invalid Division ID. MongoDB ObjectIds must be 24 hex characters (0-9, a-f).');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected\n');

        const divisionObjId = new mongoose.Types.ObjectId(DIVISION_ID);
        const recordFilter = { division_id: divisionObjId };
        const batchFilter = { division: divisionObjId };

        // 1. Regular payroll: get record IDs for transactions
        const payrollRecordIds = await PayrollRecord.find(recordFilter).select('_id').lean();
        const payrollRecordIdList = payrollRecordIds.map(r => r._id);
        const txFilter = { payrollRecordId: { $in: payrollRecordIdList } };

        const [
            payrollTxCount,
            payrollRecordCount,
            payrollBatchCount,
            secondRecordCount,
            secondBatchCount,
        ] = await Promise.all([
            payrollRecordIdList.length ? PayrollTransaction.countDocuments(txFilter) : 0,
            PayrollRecord.countDocuments(recordFilter),
            PayrollBatch.countDocuments(batchFilter),
            SecondSalaryRecord.countDocuments(recordFilter),
            SecondSalaryBatch.countDocuments(batchFilter),
        ]);

        // 2. Sample data
        const [samplePayrollRecords, samplePayrollBatches, sampleSecondRecords, sampleSecondBatches] = await Promise.all([
            PayrollRecord.find(recordFilter).select('emp_no month').limit(3).lean(),
            PayrollBatch.find(batchFilter).select('batchNumber month status').limit(3).lean(),
            SecondSalaryRecord.find(recordFilter).select('emp_no month').limit(3).lean(),
            SecondSalaryBatch.find(batchFilter).select('batchNumber month status').limit(3).lean(),
        ]);

        // --- SUMMARY ---
        console.log('--- REGULAR PAYROLL ---');
        console.log('PayrollTransactions:', payrollTxCount);
        console.log('PayrollRecords (payslips):', payrollRecordCount);
        console.log('PayrollBatches:', payrollBatchCount);
        console.log('');
        console.log('--- SECOND SALARY ---');
        console.log('SecondSalaryRecords (payslips):', secondRecordCount);
        console.log('SecondSalaryBatches:', secondBatchCount);
        console.log('');

        const totalCount = payrollTxCount + payrollRecordCount + payrollBatchCount + secondRecordCount + secondBatchCount;
        if (totalCount === 0) {
            console.log('Nothing to delete for this division. Exiting.');
            await mongoose.disconnect();
            process.exit(0);
            return;
        }

        if (samplePayrollRecords.length > 0) {
            console.log('Sample regular records:', samplePayrollRecords.map(r => `${r.emp_no}/${r.month}`).join(', '));
        }
        if (samplePayrollBatches.length > 0) {
            console.log('Sample regular batches:', samplePayrollBatches.map(b => b.batchNumber).join(', '));
        }
        if (sampleSecondRecords.length > 0) {
            console.log('Sample second-salary records:', sampleSecondRecords.map(r => `${r.emp_no}/${r.month}`).join(', '));
        }
        if (sampleSecondBatches.length > 0) {
            console.log('Sample second-salary batches:', sampleSecondBatches.map(b => b.batchNumber).join(', '));
        }
        console.log('');

        // 3. Perform or simulate deletion
        if (isDryRun) {
            console.log('--- DRY RUN: No changes made ---');
            console.log('To perform actual deletion, run:');
            console.log('  node scripts/remove_second_salary_for_division.js --delete');
            console.log('  (or on PowerShell: $env:DRY_RUN="false"; node scripts/remove_second_salary_for_division.js)');
            console.log('');
        } else {
            console.log('--- DELETING ---');
            // Order: transactions -> records -> batches (regular); records -> batches (second)
            if (payrollRecordIdList.length) {
                const txResult = await PayrollTransaction.deleteMany(txFilter);
                console.log(`🗑️ Deleted ${txResult.deletedCount} PayrollTransactions`);
            }
            const prResult = await PayrollRecord.deleteMany(recordFilter);
            console.log(`🗑️ Deleted ${prResult.deletedCount} PayrollRecords`);

            const pbResult = await PayrollBatch.deleteMany(batchFilter);
            console.log(`🗑️ Deleted ${pbResult.deletedCount} PayrollBatches`);

            const srResult = await SecondSalaryRecord.deleteMany(recordFilter);
            console.log(`🗑️ Deleted ${srResult.deletedCount} SecondSalaryRecords`);

            const sbResult = await SecondSalaryBatch.deleteMany(batchFilter);
            console.log(`🗑️ Deleted ${sbResult.deletedCount} SecondSalaryBatches`);
            console.log('--- Done ---');
        }

        await mongoose.disconnect();
        console.log('\nDisconnected. Exiting.');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    }
}

run();
