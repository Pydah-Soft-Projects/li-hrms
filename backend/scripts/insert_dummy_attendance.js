const mongoose = require('mongoose');
const dotenv = require('dotenv');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Shift = require('../shifts/model/Shift');
const Employee = require('../employees/model/Employee');

dotenv.config();

const insertDummyAttendance = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI env var not found');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find John Snow
    let employee = await Employee.findOne({
      employee_name: { $regex: 'John Snow', $options: 'i' }
    });

    if (!employee) {
      console.error('Employee "John Snow" not found');
      // Fallback to finding any employee if John Snow doesn't exist to not block testing
      const anyEmployee = await Employee.findOne();
      if (anyEmployee) {
        console.log(`Falling back to ${anyEmployee.employee_name} (${anyEmployee.emp_no})`);
        employee = anyEmployee;
      } else {
        process.exit(1);
      }
    }

    await createRecordForEmployee(employee);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
};

async function createRecordForEmployee(employee) {
  const empNo = employee.emp_no;
  const date = new Date().toISOString().split('T')[0]; // Today

  console.log(`Creating attendance for ${employee.employee_name} (${empNo}) on ${date}`);

  // Fetch shift logic - try to find assigned shift or default
  // For now, simpler to just pick a shift
  let shift = await Shift.findOne({ name: 'General Shift' });
  if (!shift) shift = await Shift.findOne(); // Any shift

  if (!shift) {
    console.error('No shifts found in DB');
    process.exit(1);
  }

  // Create a Late In record
  // Shift starts 09:30, let's say they punched in at 10:00 (30 mins late)
  // We need to parse shift start time to get the correct hour for "late"
  // Assuming shift.startTime is "09:30"
  const [startHour, startMin] = shift.startTime.split(':').map(Number);

  const inTime = new Date();
  inTime.setHours(startHour + 1, startMin, 0, 0); // 1 hour late

  // Delete existing record for today to avoid duplicates
  await AttendanceDaily.deleteOne({ employeeNumber: empNo, date: date });

  const record = new AttendanceDaily({
    employeeNumber: empNo,
    date: date,
    shifts: [{
      shiftNumber: 1,
      inTime: inTime,
      shiftId: shift._id,
      shiftName: shift.name,
      shiftStartTime: shift.startTime,
      shiftEndTime: shift.endTime,
      duration: shift.duration,
      lateInMinutes: 60,
      isLateIn: true,
      status: 'incomplete'
    }],
    totalLateInMinutes: 60,
    status: 'PARTIAL',
    source: ['manual']
  });

  await record.save();
  console.log(`Successfully inserted dummy late attendance for ${employee.employee_name}`);
}

insertDummyAttendance();
