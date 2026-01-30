const mongoose = require('mongoose');
require('dotenv').config();
const Settings = require('../settings/model/Settings');
const { getPayrollDateRange, getAllDatesInRange } = require('../shared/utils/dateUtils');

/**
 * Runs a suite of payroll date-range tests by updating settings and validating computed ranges.
 *
 * For each predefined test case this function sets payroll cycle boundaries in the Settings collection,
 * invokes getPayrollDateRange for the target year/month, compares the generated start/end dates and
 * total days against expected values, and logs pass/fail results. After all cases it restores default
 * payroll cycle settings.
 *
 * Side effects: connects to MongoDB, updates documents in the Settings collection, writes test logs,
 * and terminates the process with exit code 0 on overall success or 1 on error.
 */
async function testDynamicPayrollRange() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/li-hrms';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const testCases = [
            { year: 2026, month: 2, startDay: 1, endDay: 31, expectedStart: '2026-02-01', expectedEnd: '2026-02-28', expectedDays: 28 },
            { year: 2026, month: 2, startDay: 26, endDay: 25, expectedStart: '2026-01-26', expectedEnd: '2026-02-25', expectedDays: 31 },
            { year: 2026, month: 2, startDay: 26, endDay: 26, expectedStart: '2026-01-26', expectedEnd: '2026-02-26', expectedDays: 32 },
            { year: 2026, month: 3, startDay: 26, endDay: 25, expectedStart: '2026-02-26', expectedEnd: '2026-03-25', expectedDays: 28 },
            { year: 2024, month: 3, startDay: 26, endDay: 25, expectedStart: '2024-02-26', expectedEnd: '2024-03-25', expectedDays: 29 },
            { year: 2026, month: 1, startDay: 1, endDay: 15, expectedStart: '2026-01-01', expectedEnd: '2026-01-15', expectedDays: 15 },
        ];

        for (const tc of testCases) {
            console.log(`\nTesting Case: Year=${tc.year}, Month=${tc.month}, Start=${tc.startDay}, End=${tc.endDay}`);

            await Settings.findOneAndUpdate({ key: 'payroll_cycle_start_day' }, { value: tc.startDay }, { upsert: true });
            await Settings.findOneAndUpdate({ key: 'payroll_cycle_end_day' }, { value: tc.endDay }, { upsert: true });

            const range = await getPayrollDateRange(tc.year, tc.month);
            console.log(`Generated Range: ${range.startDate} to ${range.endDate} (${range.totalDays} days)`);

            const success = range.startDate === tc.expectedStart &&
                range.endDate === tc.expectedEnd &&
                range.totalDays === tc.expectedDays;

            if (success) {
                console.log('✅ TEST PASSED');
            } else {
                console.error('❌ TEST FAILED');
                console.error(`Expected: ${tc.expectedStart} to ${tc.expectedEnd} (${tc.expectedDays} days)`);
            }
        }

        // Reset defaults
        await Settings.findOneAndUpdate({ key: 'payroll_cycle_start_day' }, { value: 1 });
        await Settings.findOneAndUpdate({ key: 'payroll_cycle_end_day' }, { value: 31 });
        console.log('\nReset defaults');

        process.exit(0);
    } catch (error) {
        console.error('Error in test:', error);
        process.exit(1);
    }
}

testDynamicPayrollRange();