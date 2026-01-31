const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const dayjs = require('dayjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Employee = require('../employees/model/Employee');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

const generateExcels = async () => {
    await connectDB();

    try {
        const employees = await Employee.find({ is_active: true });
        console.log(`Found ${employees.length} active employees.`);

        if (employees.length === 0) {
            console.log('No employees found. Please seed employees first.');
            return;
        }

        // --- Generate Legacy Template (Jan 2026) ---
        // Format: SNo (0), EmpNo (1), Dummy, Dummy, Dummy, Date (5), In1 (6), Out1 (7), In2 (8), Out2 (9)
        const legacyData = [
            ['S.No', 'Emp Code', 'Name', 'Department', 'Shift', 'Date', 'In Time', 'Out Time', 'In Time', 'Out Time'] // Header Row
        ];

        // Header is index 0. Service starts reading from headerIdx + 1.
        // So legacy parser will start from row index 1 (0-based) if headerIdx is 0.
        // Wait, parser says `for (let i = headerIdx + 1; ...)`
        // If I pass headerIdx as argument to parser (which controller likely does), it depends on where it finds "S.No".
        // Usually controller scans for "S.No" or "SNo".
        // Let's assume standard starts at row 0 (headers).

        let sno = 1;
        const janDays = 31;
        for (const emp of employees) {
            for (let d = 1; d <= janDays; d++) {
                // Skip Sundays or randomized leave? Let's just fill all for now, maybe skip Sundays.
                const date = dayjs(`2026-01-${d}`);
                if (date.day() === 0) continue; // Skip Sundays

                const dateStr = date.format('YYYY-MM-DD');

                // Random variation in time
                const inHour = 9 + (Math.random() < 0.1 ? 1 : 0); // 10% late
                const inMin = Math.floor(Math.random() * 30);
                const outHour = 18 + (Math.random() < 0.1 ? -1 : 0); // 10% early
                const outMin = Math.floor(Math.random() * 30);

                const inTime = `${String(inHour).padStart(2, '0')}:${String(inMin).padStart(2, '0')}`;
                const outTime = `${String(outHour).padStart(2, '0')}:${String(outMin).padStart(2, '0')}`;

                legacyData.push([
                    sno++,              // 0: SNo
                    emp.emp_no,         // 1: EmpNo
                    emp.employee_name,  // 2: Name
                    '',                 // 3: Dept
                    '',                 // 4: Shift
                    dateStr,            // 5: Date
                    inTime,             // 6: In1
                    outTime,            // 7: Out1
                    '',                 // 8: In2
                    ''                  // 9: Out2
                ]);
            }
        }

        const legacyWs = XLSX.utils.aoa_to_sheet(legacyData);
        const legacyWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(legacyWb, legacyWs, 'Attendance');
        XLSX.writeFile(legacyWb, path.join(__dirname, '../uploads/legacy_attendance_jan_2026.xlsx'));
        console.log('Generated: uploads/legacy_attendance_jan_2026.xlsx');


        // --- Generate New Template (Feb 2026) ---
        // Headers: Employee Number, In Time, Out Time
        const newData = [];

        const febDays = 28;
        for (const emp of employees) {
            for (let d = 1; d <= febDays; d++) {
                const date = dayjs(`2026-02-${d}`);
                if (date.day() === 0) continue; // Skip Sundays

                const dateStr = date.format('YYYY-MM-DD');

                // Random variation
                const inHour = 9;
                const inMin = Math.floor(Math.random() * 15);
                const outHour = 18;
                const outMin = Math.floor(Math.random() * 15);

                const inTime = `${dateStr} ${String(inHour).padStart(2, '0')}:${String(inMin).padStart(2, '0')}:00`;
                const outTime = `${dateStr} ${String(outHour).padStart(2, '0')}:${String(outMin).padStart(2, '0')}:00`;

                newData.push({
                    'Employee Number': emp.emp_no,
                    'In Time': inTime,
                    'Out Time': outTime
                });
            }
        }

        const newWs = XLSX.utils.json_to_sheet(newData);
        const newWb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWb, newWs, 'Sheet1');
        XLSX.writeFile(newWb, path.join(__dirname, '../uploads/new_attendance_feb_2026.xlsx'));
        console.log('Generated: uploads/new_attendance_feb_2026.xlsx');

    } catch (error) {
        console.error('Error generating Excel files:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

generateExcels();
