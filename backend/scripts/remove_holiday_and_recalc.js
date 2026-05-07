const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const readline = require('readline');
const { connectMongoDB } = require('../config/database');

// Models
const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const Holiday = require('../holidays/model/Holiday');
const HolidayGroup = require('../holidays/model/HolidayGroup');
const Employee = require('../employees/model/Employee');
const PreScheduledShift = require('../shifts/model/PreScheduledShift');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function run() {
    try {
        console.log('🚀 Connecting to MongoDB...');
        await connectMongoDB();

        // 1. Selection: Division
        const divisions = await Division.find({ isActive: true }).select('name code').lean();
        console.log('\n--- Divisions ---');
        console.log('0. All Divisions');
        divisions.forEach((div, i) => console.log(`${i + 1}. ${div.name} (${div.code})`));

        const divIdx = await question('\nSelect Division (number): ');
        let selectedDivisionId = null;
        if (divIdx !== '0') {
            const idx = parseInt(divIdx) - 1;
            if (divisions[idx]) {
                selectedDivisionId = divisions[idx]._id;
                console.log(`Selected: ${divisions[idx].name}`);
            } else {
                console.log('Invalid selection. Exiting.');
                process.exit(0);
            }
        } else {
            console.log('Selected: All Divisions');
        }

        // 2. Selection: Department
        let selectedDepartmentId = null;
        if (selectedDivisionId) {
            const departments = await Department.find({ 
                isActive: true, 
                divisions: selectedDivisionId 
            }).select('name code').lean();

            console.log('\n--- Departments ---');
            console.log('0. All Departments');
            departments.forEach((dept, i) => console.log(`${i + 1}. ${dept.name} (${dept.code})`));

            const deptIdx = await question('\nSelect Department (number): ');
            if (deptIdx !== '0') {
                const idx = parseInt(deptIdx) - 1;
                if (departments[idx]) {
                    selectedDepartmentId = departments[idx]._id;
                    console.log(`Selected: ${departments[idx].name}`);
                } else {
                    console.log('Invalid selection. Exiting.');
                    process.exit(0);
                }
            } else {
                console.log('Selected: All Departments in this Division');
            }
        }

        // 3. Find Holidays
        // Holidays are linked via HolidayGroup -> divisionMapping
        let groupQuery = {};
        if (selectedDivisionId) {
            groupQuery['divisionMapping.division'] = selectedDivisionId;
            if (selectedDepartmentId) {
                // Mapping can be for specific department or ALL departments in division (empty departments array)
                groupQuery['$or'] = [
                    { 'divisionMapping.departments': selectedDepartmentId },
                    { 'divisionMapping.departments': { $size: 0 } }
                ];
            }
        }

        const holidayGroups = await HolidayGroup.find(groupQuery).select('_id name').lean();
        const groupIds = holidayGroups.map(g => g._id);

        // Fetch holidays that are GLOBAL or belong to these groups
        const holidays = await Holiday.find({
            $or: [
                { scope: 'GLOBAL' },
                { groupId: { $in: groupIds } }
            ]
        }).sort({ date: 1 }).lean();

        if (holidays.length === 0) {
            console.log('No holidays found for this selection. Exiting.');
            process.exit(0);
        }

        console.log('\n--- Holidays Found ---');
        holidays.forEach((h, i) => {
            const dateStr = new Date(h.date).toISOString().split('T')[0];
            console.log(`${i + 1}. [${dateStr}] ${h.name} (${h.scope})`);
        });

        const holidaySelection = await question('\nSelect Holidays (indices like 1,2 or "all"): ');
        let selectedHolidays = [];
        if (holidaySelection.toLowerCase() === 'all') {
            selectedHolidays = holidays;
        } else {
            const indices = holidaySelection.split(',').map(s => parseInt(s.trim()) - 1);
            selectedHolidays = indices.map(i => holidays[i]).filter(h => !!h);
        }

        if (selectedHolidays.length === 0) {
            console.log('No valid holidays selected. Exiting.');
            process.exit(0);
        }

        const selectedDates = selectedHolidays.map(h => new Date(h.date).toISOString().split('T')[0]);
        console.log(`Selected Dates: ${selectedDates.join(', ')}`);

        // 4. Find Employees
        let empQuery = { is_active: true };
        if (selectedDivisionId) empQuery.division_id = selectedDivisionId;
        if (selectedDepartmentId) empQuery.department_id = selectedDepartmentId;

        const employees = await Employee.find(empQuery).select('emp_no employee_name').lean();
        console.log(`\nFound ${employees.length} active employees in the selected scope.`);

        const confirm = await question(`\nProceed to remove holiday status and recalculate for ${employees.length} employees on ${selectedDates.length} days? (y/n): `);
        if (confirm.toLowerCase() !== 'y') {
            console.log('Aborted.');
            process.exit(0);
        }

        // 5. Execute
        console.log('\n--- Processing ---');
        let totalUpdated = 0;
        for (const date of selectedDates) {
            console.log(`Processing Date: ${date}...`);
            for (const emp of employees) {
                try {
                    // Update PreScheduledShift
                    const roster = await PreScheduledShift.findOne({
                        employeeNumber: emp.emp_no,
                        date: date,
                        status: 'HOL'
                    });

                    if (roster) {
                        roster.status = null;
                        await roster.save();
                    }

                    // Trigger AttendanceDaily Recalc
                    const daily = await AttendanceDaily.findOne({
                        employeeNumber: emp.emp_no,
                        date: date
                    });

                    if (daily) {
                        // Just saving it triggers the pre-save hook which re-evaluates status
                        // because rosterStatus will now be null for that date
                        await daily.save();
                        totalUpdated++;
                    }
                } catch (err) {
                    console.error(`Error processing ${emp.emp_no} on ${date}:`, err.message);
                }
            }
        }

        console.log(`\n✅ Completed! Updated ${totalUpdated} attendance records.`);
        process.exit(0);

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

run();
