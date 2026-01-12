const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

const envPath = path.join(__dirname, '../../backend/.env'); // Trying explicit path adjustment if needed, but let's stick to relative first but with debug
// actually previous was ../.env from backend/scripts which is backend/.env. 
// Let's rely on absolute path resolution from CWD if possible or just debug first.

const resolvedPath = path.resolve(__dirname, '../.env');
console.log('Attempting to load .env from:', resolvedPath);
const result = dotenv.config({ path: resolvedPath });

if (result.error) {
    console.error('Error loading .env:', result.error);
}
console.log('MONGO_URI status:', process.env.MONGO_URI ? 'Found' : 'Missing');

// Load env vars
// dotenv.config({ path: path.join(__dirname, '../.env') });

// Load Models
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Designation = require('../departments/model/Designation');
// We don't need Shift model for the migration, just the IDs

// Hardcoded fallback based on user provided env
const FALLBACK_URI = 'mongodb://localhost:27017/hrms';

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || FALLBACK_URI;
        console.log(`Connecting to MongoDB at: ${uri}`);
        await mongoose.connect(uri);
        console.log(`MongoDB Connected: ${mongoose.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const transformShifts = (shiftsArray) => {
    if (!shiftsArray || shiftsArray.length === 0) return [];

    // Check if already migrated (first item is object with shiftId)
    if (shiftsArray[0] && shiftsArray[0].shiftId) {
        return shiftsArray; // Already migrated
    }

    // Assume it's an array of ObjectIds (strings or Objects)
    return shiftsArray.map(id => ({
        shiftId: id,
        gender: 'All'
    }));
};

const migrateDivisions = async () => {
    console.log('--- Migrating Divisions ---');
    const divisions = await Division.find({});
    let count = 0;
    for (const div of divisions) {
        let modified = false;
        if (div.shifts && div.shifts.length > 0 && !div.shifts[0].shiftId) {
            div.shifts = transformShifts(div.shifts);
            modified = true;
        }

        if (modified) {
            await div.save();
            count++;
            console.log(`Migrated Division: ${div.name}`);
        }
    }
    console.log(`Migrated ${count} Divisions.`);
};

const migrateDepartments = async () => {
    console.log('--- Migrating Departments ---');
    const departments = await Department.find({});
    let count = 0;
    for (const dept of departments) {
        let modified = false;

        // 1. Root shifts
        if (dept.shifts && dept.shifts.length > 0 && !dept.shifts[0].shiftId) {
            dept.shifts = transformShifts(dept.shifts);
            modified = true;
        }

        // 2. Division Defaults
        if (dept.divisionDefaults && dept.divisionDefaults.length > 0) {
            for (const item of dept.divisionDefaults) {
                if (item.shifts && item.shifts.length > 0 && !item.shifts[0].shiftId) {
                    item.shifts = transformShifts(item.shifts);
                    modified = true;
                }
            }
        }

        if (modified) {
            await dept.save();
            count++;
            console.log(`Migrated Department: ${dept.name}`);
        }
    }
    console.log(`Migrated ${count} Departments.`);
};

const migrateDesignations = async () => {
    console.log('--- Migrating Designations ---');
    const designations = await Designation.find({});
    let count = 0;
    for (const desig of designations) {
        let modified = false;

        // 1. Root shifts
        if (desig.shifts && desig.shifts.length > 0 && !desig.shifts[0].shiftId) {
            desig.shifts = transformShifts(desig.shifts);
            modified = true;
        }

        // 2. Division Defaults
        if (desig.divisionDefaults && desig.divisionDefaults.length > 0) {
            for (const item of desig.divisionDefaults) {
                if (item.shifts && item.shifts.length > 0 && !item.shifts[0].shiftId) {
                    item.shifts = transformShifts(item.shifts);
                    modified = true;
                }
            }
        }

        // 3. Department Shifts
        if (desig.departmentShifts && desig.departmentShifts.length > 0) {
            for (const item of desig.departmentShifts) {
                if (item.shifts && item.shifts.length > 0 && !item.shifts[0].shiftId) {
                    item.shifts = transformShifts(item.shifts);
                    modified = true;
                }
            }
        }

        if (modified) {
            await desig.save();
            count++;
            console.log(`Migrated Designation: ${desig.name}`);
        }
    }
    console.log(`Migrated ${count} Designations.`);
};

const runMigration = async () => {
    await connectDB();
    await migrateDivisions();
    await migrateDepartments();
    await migrateDesignations();
    console.log('All migrations completed.');
    process.exit();
};

runMigration();
