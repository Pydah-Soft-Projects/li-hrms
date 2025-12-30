/**
 * Migration Script: Onboard Division Layer
 * 
 * Usage: node scripts/migrate_divisions.js
 * 
 * This script ensures the system is ready for the Division layer by:
 * 1. Creating a "Default Division" if none exists.
 * 2. Assigning all employees without a division to this default division.
 * 3. Linking all orphan departments to the default division.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

// Load Models
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');

const migrate = async () => {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // 1. Ensure Default Division Exists
        let defaultDivision = await Division.findOne({ code: 'DEFAULT' });
        if (!defaultDivision) {
            console.log('Default Division not found. Creating...');
            // Find a superadmin to assign as manager (fallback)
            const superAdmin = await User.findOne({ role: 'super_admin' });

            defaultDivision = await Division.create({
                name: 'Default Division',
                code: 'DEFAULT',
                description: 'System default division for legacy data',
                manager: superAdmin ? superAdmin._id : null
            });
            console.log(`Created Default Division: ${defaultDivision._id}`);
        } else {
            console.log(`Found Default Division: ${defaultDivision._id}`);
        }

        // 2. Assign Default Division to Orphan Employees
        // Using updateMany for efficiency
        const employeeResult = await Employee.updateMany(
            { $or: [{ division_id: { $exists: false } }, { division_id: null }] },
            { $set: { division_id: defaultDivision._id } }
        );
        console.log(`Updated ${employeeResult.modifiedCount} employees with default division.`);

        // 3. Link Orphan Departments to Default Division
        // Find departments that have no divisions array or empty divisions array
        const departmentResult = await Department.updateMany(
            { $or: [{ divisions: { $exists: false } }, { divisions: { $size: 0 } }] },
            { $addToSet: { divisions: defaultDivision._id } }
        );
        console.log(`Updated ${departmentResult.modifiedCount} departments linked to default division.`);

        // 4. Update Default Division with these Departments
        // This is necessary for the bidirectional link (if logic relies on it)
        const allDepts = await Department.find({ divisions: defaultDivision._id }).select('_id');
        const deptIds = allDepts.map(d => d._id);

        await Division.findByIdAndUpdate(defaultDivision._id, {
            $addToSet: { departments: { $each: deptIds } }
        });
        console.log('Synced Default Division department list.');

        console.log('Migration Complete!');
        process.exit(0);

    } catch (error) {
        console.error('Migration Failed:', error);
        process.exit(1);
    }
};

migrate();
