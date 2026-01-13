const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Shift = require('../shifts/model/Shift');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const { calculateMonthlySummary } = require('../attendance/services/summaryCalculationService');

async function seedAttendance() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const employees = await Employee.find({ is_active: true }).select('emp_no');
        if (employees.length === 0) {
            console.error('No active employees found. Run seed-performance-data.js first.');
            process.exit(1);
        }

        const shift8 = await Shift.findOne({ name: 'General Shift (8h)' });
        const shift10 = await Shift.findOne({ name: 'Night Shift (10h)' });

        if (!shift8 || !shift10) {
            console.error('Shifts not found. Run seed-performance-data.js first.');
            process.exit(1);
        }

        const months = [
            { year: 2026, month: 1, days: 31 },
            { year: 2026, month: 2, days: 28 }
        ];

        console.log(`Seeding attendance for ${employees.length} employees for Jan and Feb 2026...`);

        const batchSize = 1000;
        let currentBatch = [];

        for (const monthInfo of months) {
            console.log(`Processing ${monthInfo.month}/2026...`);
            for (let day = 1; day <= monthInfo.days; day++) {
                const dateStr = `${monthInfo.year}-${monthInfo.month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

                for (let i = 0; i < employees.length; i++) {
                    const emp = employees[i];
                    const rand = Math.random();

                    let status = 'PRESENT';
                    let inTime = null;
                    let outTime = null;
                    let shiftId = i % 10 === 0 ? shift10._id : shift8._id;
                    let isLateIn = false;
                    let lateInMinutes = 0;

                    if (rand < 0.1) {
                        status = 'ABSENT';
                    } else if (rand < 0.15) {
                        status = 'PARTIAL'; // Half day simulator
                        inTime = new Date(`${dateStr}T09:00:00`);
                        outTime = new Date(`${dateStr}T13:00:00`);
                    } else {
                        // Normal Present
                        inTime = new Date(`${dateStr}T09:00:00`);
                        // Random late in (5%)
                        if (Math.random() < 0.05) {
                            inTime.setMinutes(20 + Math.floor(Math.random() * 30));
                            isLateIn = true;
                            lateInMinutes = inTime.getMinutes();
                        }
                        outTime = new Date(`${dateStr}T17:00:00`);
                        if (i % 10 === 0) {
                            // Night shift
                            inTime = new Date(`${dateStr}T20:00:00`);
                            outTime = new Date(new Date(`${dateStr}T06:00:00`).getTime() + 24 * 60 * 60 * 1000);
                        }
                    }

                    currentBatch.push({
                        employeeNumber: emp.emp_no,
                        date: dateStr,
                        status,
                        inTime,
                        outTime,
                        shiftId,
                        isLateIn,
                        lateInMinutes,
                        source: ['manual']
                    });

                    if (currentBatch.length >= batchSize) {
                        await AttendanceDaily.insertMany(currentBatch, { ordered: false }).catch(err => {
                            // Ignore duplicate errors if re-running
                            if (err.code !== 11000) console.error(err);
                        });
                        currentBatch = [];
                    }
                }
                if (day % 5 === 0) console.log(`  Date ${dateStr} completed...`);
            }
        }

        if (currentBatch.length > 0) {
            await AttendanceDaily.insertMany(currentBatch, { ordered: false }).catch(e => { });
        }

        console.log('Attendance records inserted. Now calculating monthly summaries...');

        // Calculate summaries
        for (const monthInfo of months) {
            console.log(`Calculating summaries for ${monthInfo.month}/2026...`);
            for (let i = 0; i < employees.length; i++) {
                const emp = employees[i];
                await calculateMonthlySummary(emp._id, emp.emp_no, monthInfo.year, monthInfo.month);
                if ((i + 1) % 100 === 0) console.log(`  Progress: ${i + 1}/${employees.length}`);
            }
        }

        console.log('Attendance seeding and summary calculation completed.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding attendance:', error);
        process.exit(1);
    }
}

seedAttendance();
