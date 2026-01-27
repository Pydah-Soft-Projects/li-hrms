const mongoose = require('mongoose');
require('dotenv').config();
const Settings = require('../settings/model/Settings');

/**
 * Ensure payroll cycle settings exist in the database.
 *
 * Connects to MongoDB, creates `payroll_cycle_start_day` and `payroll_cycle_end_day` settings if they are missing,
 * logs whether each setting was created or already existed, and exits the process with code 0 on success or 1 on error.
 */
async function seedPayrollCycle() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/li-hrms';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const settings = [
            {
                key: 'payroll_cycle_start_day',
                value: 1,
                description: 'The day of the month when the payroll cycle starts. Default is 1.',
                category: 'payroll'
            },
            {
                key: 'payroll_cycle_end_day',
                value: 31,
                description: 'The day of the month when the payroll cycle ends. Default is 31 (end of month).',
                category: 'payroll'
            }
        ];

        for (const setting of settings) {
            const existing = await Settings.findOne({ key: setting.key });
            if (!existing) {
                await Settings.create(setting);
                console.log(`Setting ${setting.key} created with value ${setting.value}`);
            } else {
                console.log(`Setting ${setting.key} already exists with value ${existing.value}`);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error seeding payroll cycle:', error);
        process.exit(1);
    }
}

seedPayrollCycle();