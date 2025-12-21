const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Settings = require('../settings/model/Settings');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

const seedSettings = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const settingsToSeed = [
            {
                key: 'feature_control_employee',
                value: { activeModules: ['DASHBOARD', 'LEAVE', 'OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS'] },
                description: 'Active modules for Employee role',
                category: 'feature_control',
            },
            {
                key: 'feature_control_hod',
                value: { activeModules: ['DASHBOARD', 'LEAVE', 'OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS', 'REPORTS'] },
                description: 'Active modules for HOD role',
                category: 'feature_control',
            },
            {
                key: 'feature_control_hr',
                value: { activeModules: ['DASHBOARD', 'LEAVE', 'OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS', 'EMPLOYEES', 'REPORTS'] },
                description: 'Active modules for HR role',
                category: 'feature_control',
            },
            {
                key: 'payslip_release_required',
                value: true,
                description: 'Whether payslips must be explicitly released before employees can view them',
                category: 'payroll',
            },
            {
                key: 'payslip_history_months',
                value: 6,
                description: 'Number of previous months of payslips visible to employees',
                category: 'payroll',
            },
            {
                key: 'payslip_download_limit',
                value: 5,
                description: 'Maximum number of times an employee can download a single payslip',
                category: 'payroll',
            },
        ];

        for (const s of settingsToSeed) {
            await Settings.findOneAndUpdate(
                { key: s.key },
                s,
                { upsert: true, new: true }
            );
            console.log(`Updated setting: ${s.key}`);
        }

        console.log('Successfully seeded all settings');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding settings:', error);
        process.exit(1);
    }
};

seedSettings();
