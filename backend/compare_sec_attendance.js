const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const Division = require('./departments/model/Division');
const Department = require('./departments/model/Department');
const AttendanceDaily = require('./attendance/model/AttendanceDaily');
const Employee = require('./employees/model/Employee');

async function compareSecAttendance() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/li-hrms';
    await mongoose.connect(mongoUri);
    console.log('Connected to DB');

    const empNos = ['1717', '2140', '1951', '111181', '2159', '2160', '2249', '111189', '2118'];

    const dates = [];
    // Aug 26 to Aug 31
    for (let d = 26; d <= 31; d++) dates.push(`2026-08-${d}`);
    // Sep 01 to Sep 25
    for (let d = 1; d <= 25; d++) dates.push(`2026-09-${d < 10 ? '0' + d : d}`);

    const emps = await Employee.find({ emp_no: { $in: empNos } }).populate('division_id').populate('department_id');

    for (const empNo of empNos) {
      const emp = emps.find(e => e.emp_no === empNo);
      console.log(`\n======================================================`);
      console.log(`EmpNo: ${empNo} | Name: ${emp?.employee_name} | Division: ${emp?.division_id?.name} | Dept: ${emp?.department_id?.name}`);
      console.log(`======================================================`);

      const dbRecords = await AttendanceDaily.find({
        employeeNumber: empNo,
        date: { $in: dates }
      }).sort({ date: 1 });

      const dbRecordMap = {};
      dbRecords.forEach(r => { dbRecordMap[r.date] = r; });

      let presentCount = 0;
      let absentCount = 0;
      let leaveCount = 0;
      let missingCount = 0;

      dates.forEach(date => {
        const rec = dbRecordMap[date];
        if (!rec) {
          missingCount++;
          console.log(`  ${date}: MISSING IN DB`);
        } else {
          const shiftName = rec.shifts?.[0]?.shiftName || rec.shifts?.[0]?.name || 'N/A';
          const status = rec.status;
          if (status === 'PRESENT') presentCount++;
          else if (status === 'ABSENT') absentCount++;
          else if (status === 'LEAVE' || status === 'OD') leaveCount++;

          console.log(`  ${date}: Status=${status} | ShiftsCount=${rec.shifts?.length || 0} | ShiftName=${shiftName} | WorkingHrs=${rec.totalWorkingHours} | PayableShifts=${rec.payableShifts}`);
        }
      });

      console.log(`Summary for ${empNo}: Total Dates=${dates.length}, Present=${presentCount}, Absent=${absentCount}, Missing=${missingCount}`);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

compareSecAttendance();
