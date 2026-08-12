/**
 * Patch script: Add COMPLAINTS:read and COMPLAINTS:write to existing feature_control settings.
 * This safely adds the permissions only if they are not already present.
 * Run: node backend/scripts/patch_feature_control_add_complaints.js
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Settings = require('../settings/model/Settings');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

const COMPLAINTS_PERMISSIONS = ['COMPLAINTS:read', 'COMPLAINTS:write'];

const ROLE_KEYS = [
    'feature_control_employee',
    'feature_control_hod',
    'feature_control_hr',
    'feature_control_manager',
];

const patch = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        for (const key of ROLE_KEYS) {
            const setting = await Settings.findOne({ key });
            if (!setting) {
                console.log(`Not found (skipping): ${key}`);
                continue;
            }

            const activeModules = setting.value?.activeModules || [];
            const missing = COMPLAINTS_PERMISSIONS.filter(p => !activeModules.includes(p));

            if (missing.length === 0) {
                console.log(`Already has complaints permissions (skipping): ${key}`);
                continue;
            }

            setting.value = {
                ...setting.value,
                activeModules: [...activeModules, ...missing],
            };
            setting.markModified('value');
            await setting.save();
            console.log(`✅ Updated ${key}: added ${missing.join(', ')}`);
        }

        console.log('\nPatch complete.');
        process.exit(0);
    } catch (error) {
        console.error('Error patching settings:', error);
        process.exit(1);
    }
};

patch();
