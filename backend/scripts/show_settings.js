const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Settings = require('../settings/model/Settings');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

const run = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');
        const keys = [
            'feature_control_employee',
            'feature_control_hod',
            'feature_control_hr',
            'feature_control_manager',
        ];
        for (const key of keys) {
            const setting = await Settings.findOne({ key });
            console.log(`Key: ${key}`);
            console.log(JSON.stringify(setting?.value, null, 2));
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
run();
