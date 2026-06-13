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
                value: { activeModules: ['DASHBOARD:read', 'LEAVE_OD:read', 'ATTENDANCE:read', 'PROFILE:read', 'PAYSLIPS:read', 'PROMOTIONS_TRANSFERS:read'] },
                description: 'Active modules for Employee role',
                category: 'feature_control',
            },
            {
                key: 'feature_control_hod',
                value: { activeModules: ['DASHBOARD:read', 'LEAVE_OD:read', 'LEAVE_REGISTER:read', 'ATTENDANCE:read', 'PROFILE:read', 'PAYSLIPS:read', 'PAYSLIPS:write', 'PAYSLIPS:release', 'REPORTS:read', 'PROMOTIONS_TRANSFERS:read'] },
                description: 'Active modules for HOD role',
                category: 'feature_control',
            },
            {
                key: 'feature_control_hr',
                value: { activeModules: ['DASHBOARD:read', 'LEAVE_OD:read', 'LEAVE_REGISTER:read', 'ATTENDANCE:read', 'PROFILE:read', 'PAYSLIPS:read', 'PAYSLIPS:write', 'PAYSLIPS:release', 'EMPLOYEES:read', 'REPORTS:read', 'PROMOTIONS_TRANSFERS:read'] },
                description: 'Active modules for HR role',
                category: 'feature_control',
            },
            {
                key: 'feature_control_manager',
                value: { activeModules: ['DASHBOARD:read', 'LEAVE_OD:read', 'LEAVE_REGISTER:read', 'ATTENDANCE:read', 'PROFILE:read', 'PAYSLIPS:read', 'PAYSLIPS:write', 'PAYSLIPS:release', 'REPORTS:read', 'PROMOTIONS_TRANSFERS:read'] },
                description: 'Active modules for Manager role',
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
            const existing = await Settings.findOne({ key: s.key }).lean();
            if (existing) {
                console.log(`Skipped (already exists): ${s.key}`);
                continue;
            }
            await Settings.create(s);
            console.log(`Created setting: ${s.key}`);
        }

        console.log('Successfully seeded missing settings only (existing rows unchanged)');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding settings:', error);
        if(process.env.NODE_ENV !== "test") process.exit(1);
    }
};

seedSettings();
