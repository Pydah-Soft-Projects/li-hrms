
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';
        console.log('Connecting to:', uri.replace(/:([^:@]{1,})@/, ':****@')); // Mask password
        await mongoose.connect(uri);
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('Connection Error:', error);
        process.exit(1);
    }
};

const run = async () => {
    await connectDB();

    // Load models
    require('./users/model/User');
    require('./departments/model/Department');
    require('./departments/model/Designation');
    require('./settings/model/Settings');
    const Settings = require('./employee-applications/model/EmployeeApplicationFormSettings');
    const Employee = require('./employees/model/Employee');
    const { resolveQualificationLabels } = require('./employee-applications/services/fieldMappingService');

    try {
        const activeSettings = await Settings.getActiveSettings();
        console.log('\n--- Active Settings ---');
        if (activeSettings) {
            console.log('Fields:', JSON.stringify(activeSettings.qualifications.fields, null, 2));
        } else {
            console.log('No active settings found.');
        }

        const employee = await Employee.findOne({ 'qualifications.0': { $exists: true } }).sort({ updated_at: -1 });
        console.log('\n--- Sample Employee ---');
        if (employee) {
            console.log('Name:', employee.employee_name);
            console.log('Current Qualifications:', JSON.stringify(employee.qualifications, null, 2));

            // Test Resolution
            const resolved = resolveQualificationLabels(employee.qualifications, activeSettings);
            console.log('\n--- Resolution Result ---');
            console.log(JSON.stringify(resolved, null, 2));
        } else {
            console.log('No employee with qualifications found.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
};

run();
