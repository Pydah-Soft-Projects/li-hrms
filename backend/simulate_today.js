
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// Models
const AttendanceRawLog = require('./attendance/model/AttendanceRawLog');
const Employee = require('./employees/model/Employee');
const Shift = require('./shifts/model/Shift');
const Settings = require('./settings/model/Settings');

// Services
const { getShiftsForEmployee } = require('./shifts/services/shiftDetectionService');
const { processMultiShiftAttendance } = require('./attendance/services/multiShiftProcessingService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

async function simulate() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const targetDate = '2026-02-01';
        console.log(`Simulating logs for: ${targetDate}`);

        // Get 5 active employees
        const employees = await Employee.find({ is_active: { $ne: false } }).limit(5);
        if (employees.length === 0) {
            console.log('No active employees found');
            process.exit(0);
        }

        const generalConfig = await Settings.getSettingsByCategory('general');

        for (const emp of employees) {
            console.log(`\nProcessing Employee: ${emp.employee_name} (${emp.emp_no})`);

            // 1. Get shifts for today
            const shiftResult = await getShiftsForEmployee(emp.emp_no, targetDate);
            let shifts = shiftResult.shifts;

            if (shifts.length === 0) {
                console.log('No assigned shift found, using default General Shift');
                const defaultShift = await Shift.findOne({ isActive: true });
                if (defaultShift) shifts = [defaultShift];
            }

            for (const shift of shifts) {
                console.log(`- Shift: ${shift.name} (${shift.startTime} - ${shift.endTime})`);

                // Generate IN Punch
                const [inH, inM] = shift.startTime.split(':').map(Number);
                const inTimestamp = new Date(`${targetDate}T${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}:00`);
                // Add random jitter (-5 to +10 mins)
                inTimestamp.setMinutes(inTimestamp.getMinutes() + Math.floor(Math.random() * 15) - 5);

                // CREATE IN LOG
                await AttendanceRawLog.findOneAndUpdate(
                    { employeeNumber: emp.emp_no, timestamp: inTimestamp },
                    {
                        employeeNumber: emp.emp_no,
                        timestamp: inTimestamp,
                        type: 'IN',
                        subType: 'CHECK-IN',
                        source: 'biometric-realtime',
                        date: targetDate,
                        rawData: { simulated: true }
                    },
                    { upsert: true, new: true }
                );
                console.log(`  [OK] IN Punch created at ${inTimestamp.toLocaleTimeString()}`);

                // Decide if they also checked OUT (3 out of 5 will)
                if (Math.random() > 0.4) {
                    const [outH, outM] = shift.endTime.split(':').map(Number);
                    const outTimestamp = new Date(`${targetDate}T${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}:00`);
                    // Handle overnight shifts
                    if (outH < inH) outTimestamp.setDate(outTimestamp.getDate() + 1);

                    outTimestamp.setMinutes(outTimestamp.getMinutes() + Math.floor(Math.random() * 20) - 5);

                    // CREATE OUT LOG
                    await AttendanceRawLog.findOneAndUpdate(
                        { employeeNumber: emp.emp_no, timestamp: outTimestamp },
                        {
                            employeeNumber: emp.emp_no,
                            timestamp: outTimestamp,
                            type: 'OUT',
                            subType: 'CHECK-OUT',
                            source: 'biometric-realtime',
                            date: targetDate,
                            rawData: { simulated: true }
                        },
                        { upsert: true, new: true }
                    );
                    console.log(`  [OK] OUT Punch created at ${outTimestamp.toLocaleTimeString()}`);
                } else {
                    console.log(`  [..] Remaining "Working" (No OUT punch)`);
                }
            }

            // 2. Trigger processing for this employee
            // Need ALL logs for this employee around the target date
            const allLogs = await AttendanceRawLog.find({
                employeeNumber: emp.emp_no,
                date: { $gte: '2026-01-31', $lte: '2026-02-02' }
            }).sort({ timestamp: 1 }).lean();

            const processedLogs = allLogs.map(log => ({
                timestamp: new Date(log.timestamp),
                type: log.type,
                punch_state: log.type === 'IN' ? 0 : (log.type === 'OUT' ? 1 : null),
                _id: log._id
            }));

            await processMultiShiftAttendance(emp.emp_no, targetDate, processedLogs, generalConfig);
            console.log(`  [FINISH] Attendance processed for ${emp.emp_no}`);
        }

        console.log('\nSimulation completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error during simulation:', error);
        process.exit(1);
    }
}

simulate();
