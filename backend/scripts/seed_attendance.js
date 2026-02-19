
require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Shift = require('../shifts/model/Shift');
const Employee = require('../employees/model/Employee');

const seedAttendance = async () => {
  try {
    console.log('Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const today = new Date();
    // Set time to start of day for DATE field string consistency?
    // Model says 'YYYY-MM-DD' string.
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    console.log(`Seeding attendance for date: ${dateStr}`);

    // Get all active employees
    const employees = await Employee.find({ is_active: true });
    console.log(`Found ${employees.length} active employees.`);

    if (employees.length === 0) {
      console.log('No active employees found.');
      process.exit(0);
    }

    // Get all active shifts
    const shifts = await Shift.f
    ind({ isActive: true });
    console.log(`Found ${shifts.length} active shifts.`);

    if (shifts.length === 0) {
      console.log('No active shifts found. Creating a default shift if needed?');
      // process.exit(1); 
      // Should we continue? Without shift, logic is tricky.
      console.warn('Cannot proceed without shifts.');
      process.exit(1);
    }

    let usersProcessed = 0;
    let usersSkipped = 0;

    for (const emp of employees) {
      // Check if attendance exists
      const existing = await AttendanceDaily.findOne({
        employeeNumber: emp.emp_no,
        date: dateStr
      });

      if (existing) {
        console.log(`Attendance already exists for ${emp.emp_no} (${emp.employee_name}). Skipping.`);
        usersSkipped++;
        continue;
      }

      // Assign a random shift
      const shift = shifts[Math.floor(Math.random() * shifts.length)];

      // Calculate IN time
      // Parse shift start time HH:MM
      const [startH, startM] = shift.startTime.split(':').map(Number);

      const inTime = new Date(today);
      inTime.setHours(startH, startM, 0, 0);

      // Randomize inTime (-15 to +45 mins) - slightly biased to late
      const randomOffset = Math.floor(Math.random() * 60) - 15;
      inTime.setMinutes(inTime.getMinutes() + randomOffset);

      // Determine OUT time?
      // If current time < shift end time, no OUT punch.
      // If current time > shift end time + buffer, MAYBE OUT punch.
      // Let's keep it simple: just IN punch to verify "working" status and allow OT application for "today".
      // OT is usually applied for:
      // 1. Future (planned)
      // 2. Today (working late) - needs IN punch
      // 3. Past (forgot) - needs full attendance

      // So IN punch is sufficient for testing "Today's OT".

      // Calculate Late In
      const { calculateLateIn } = require('../shifts/services/shiftDetectionService');
      const lateInMinutes = calculateLateIn(inTime, shift.startTime, shift.gracePeriod || 15, dateStr);
      const isLateIn = lateInMinutes > 0;

      // Create attendance record
      const att = new AttendanceDaily({
        employeeNumber: emp.emp_no,
        date: dateStr,
        shifts: [{
          shiftNumber: 1,
          inTime: inTime,
          outTime: null, // Open attendance
          shiftId: shift._id,
          shiftName: shift.name,
          shiftStartTime: shift.startTime,
          shiftEndTime: shift.endTime,
          status: 'incomplete', // Currently working
          workingHours: 0,
          punchHours: 0,
          isLateIn: isLateIn,
          lateInMinutes: lateInMinutes
        }],
        totalShifts: 1,
        status: 'PARTIAL', // Indicates day started but not finished
        source: ['manual']
      });

      await att.save();
      console.log(`Created attendance for ${emp.emp_no} [Shift: ${shift.name}] [In: ${inTime.toLocaleTimeString()}]`);
      usersProcessed++;
    }

    console.log(`Seeding complete. Created: ${usersProcessed}, Skipped: ${usersSkipped}.`);
    process.exit(0);

  } catch (err) {
    console.error('Error seeding attendance:', err);
    process.exit(1);
  }
};

seedAttendance();
