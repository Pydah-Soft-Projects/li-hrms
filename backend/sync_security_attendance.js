const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { detectAndPairShifts } = require('./attendance/services/multiShiftDetectionService');
const { SECURITY_SHEET_ROSTER, DATES_LIST } = require('./attendance/services/securityAttendanceService');
const { resolveDynamicShiftMap } = require('./attendance/services/dynamicRosterService');

async function runDynamicBiometricSync() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    console.log('Connecting to Mongo URI:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected to DB successfully!');

    const Employee = mongoose.models.Employee || mongoose.model('Employee', new mongoose.Schema({}, { strict: false }));
    const AttendanceRawLog = mongoose.models.AttendanceRawLog || mongoose.model('AttendanceRawLog', new mongoose.Schema({}, { strict: false }));
    const AttendanceDaily = mongoose.models.AttendanceDaily || mongoose.model('AttendanceDaily', new mongoose.Schema({}, { strict: false }));
    const PreScheduledShift = mongoose.models.PreScheduledShift || mongoose.model('PreScheduledShift', new mongoose.Schema({}, { strict: false }));

    const masterShiftMap = await resolveDynamicShiftMap({
      'A': 'A-SECURITY',
      'B': 'B-SECURITY',
      'C': 'C-SECURITY',
      'G': 'NTS-GENERAL'
    });

    console.log('\n--- Running Dynamic Biometric + Paper Roster Attendance Engine ---');

    let totalProcessed = 0;
    let totalDailyUpdated = 0;

    for (const [empNo, scheduleCodes] of Object.entries(SECURITY_SHEET_ROSTER)) {
      const emp = await Employee.findOne({
        $or: [{ emp_no: empNo }, { employeeNumber: empNo }, { customId: empNo }]
      });

      if (!emp) {
        console.log(`[Warning] Employee not found for empNo: ${empNo}`);
        continue;
      }

      console.log(`\nProcessing Emp: ${empNo} (${emp.employee_name || emp.displayName || emp.name})...`);

      // Get all raw logs for this employee over the entire 31-day cycle (Aug 25 to Sep 26 UTC)
      const rawLogs = await AttendanceRawLog.find({
        $or: [{ employeeNumber: empNo }, { biometricId: empNo }],
        timestamp: { $gte: new Date('2026-08-25T00:00:00Z'), $lte: new Date('2026-09-26T23:59:59Z') }
      }).sort({ timestamp: 1 });

      console.log(`Found ${rawLogs.length} raw punches for emp ${empNo}`);

      for (let i = 0; i < DATES_LIST.length; i++) {
        const date = DATES_LIST[i];
        const rawCode = String(scheduleCodes[i] || '').trim().toUpperCase();

        totalProcessed++;

        const isLeave = (rawCode === 'L' || rawCode === 'LEAVE');
        const isWeekOff = (rawCode === 'WO' || rawCode === 'WEEK_OFF');
        const isHoliday = (rawCode === 'HOL' || rawCode === 'HOLIDAY');
        const isAbsent = (rawCode === 'A' && !masterShiftMap['A'] && !masterShiftMap['A-SECURITY']);

        const matchedShift = masterShiftMap[rawCode] || null;

        // 1. Sync PreScheduledShift
        await PreScheduledShift.findOneAndUpdate(
          { employeeNumber: empNo, date },
          {
            $set: {
              employeeNumber: empNo,
              date,
              shiftId: matchedShift ? matchedShift._id : null,
              status: isLeave ? 'L' : (isWeekOff ? 'WO' : (isHoliday ? 'HOL' : null)),
              scheduledBy: emp._id,
              notes: `Dynamic Security Roster - Code: ${rawCode}`
            }
          },
          { upsert: true, new: true, runValidators: false }
        );

        // 2. Pair real biometric shifts for this date
        const realShifts = detectAndPairShifts(rawLogs, date, 3);

        let finalStatus = 'PRESENT';
        if (isLeave) finalStatus = 'LEAVE';
        else if (isWeekOff) finalStatus = 'WEEK_OFF';
        else if (isHoliday) finalStatus = 'HOLIDAY';
        else if (isAbsent || (!matchedShift && rawCode === '-')) finalStatus = 'ABSENT';

        let shiftData = [];

        if (realShifts && realShifts.length > 0) {
          shiftData = realShifts.map((rs, idx) => {
            const duration = rs.duration || 0;
            const wHours = rs.workingHours || (Math.round((duration / 60) * 100) / 100);
            const expHours = matchedShift?.duration || 8;
            const extra = Math.max(0, Math.round((wHours - expHours) * 100) / 100);

            return {
              shiftNumber: idx + 1,
              inTime: rs.inTime,
              outTime: rs.outTime,
              duration,
              workingHours: wHours,
              punchHours: wHours,
              odHours: 0,
              edgePermissionHours: 0,
              otHours: 0,
              shiftId: matchedShift?._id || null,
              shiftName: matchedShift?.name || 'SECURITY',
              shiftStartTime: matchedShift?.startTime || '09:00',
              shiftEndTime: matchedShift?.endTime || '17:30',
              lateInMinutes: 0,
              earlyOutMinutes: 0,
              isLateIn: false,
              isEarlyOut: false,
              status: finalStatus,
              payableShift: 1,
              basePayable: 1,
              expectedHours: expHours,
              extraHours: extra
            };
          });
        } else if (finalStatus === 'PRESENT' && matchedShift) {
          // Fallback if no punches found on scheduled duty day
          const startTimeStr = matchedShift.startTime || '09:00';
          const endTimeStr = matchedShift.endTime || '17:30';
          const durationHrs = matchedShift.duration || 8;

          const inTimeDate = new Date(`${date}T${startTimeStr}:00.000Z`);
          let outTimeDate = new Date(`${date}T${endTimeStr}:00.000Z`);
          const [sH] = startTimeStr.split(':').map(Number);
          const [eH] = endTimeStr.split(':').map(Number);
          if (eH < sH) {
            const nextDay = new Date(inTimeDate);
            nextDay.setDate(nextDay.getDate() + 1);
            outTimeDate = new Date(`${nextDay.toISOString().split('T')[0]}T${endTimeStr}:00.000Z`);
          }

          shiftData = [{
            shiftNumber: 1,
            inTime: inTimeDate,
            outTime: outTimeDate,
            duration: durationHrs * 60,
            workingHours: durationHrs,
            punchHours: durationHrs,
            odHours: 0,
            edgePermissionHours: 0,
            otHours: 0,
            shiftId: matchedShift._id,
            shiftName: matchedShift.name,
            shiftStartTime: startTimeStr,
            shiftEndTime: endTimeStr,
            lateInMinutes: 0,
            earlyOutMinutes: 0,
            isLateIn: false,
            isEarlyOut: false,
            status: 'PRESENT',
            payableShift: 1,
            basePayable: 1,
            expectedHours: durationHrs,
            extraHours: 0
          }];
        }

        const totalWork = shiftData.reduce((acc, s) => acc + (s.workingHours || 0), 0);
        const totalExp = shiftData.reduce((acc, s) => acc + (s.expectedHours || 8), 0);

        const attendancePayload = {
          employee_id: emp._id,
          employeeNumber: empNo,
          date,
          shifts: shiftData,
          totalShifts: shiftData.length,
          totalWorkingHours: Math.round(totalWork * 100) / 100,
          totalOTHours: 0,
          payableShifts: finalStatus === 'PRESENT' ? (shiftData.length || 1) : 0,
          totalLateInMinutes: 0,
          totalEarlyOutMinutes: 0,
          totalExpectedHours: finalStatus === 'PRESENT' ? totalExp : 0,
          status: finalStatus,
          isEdited: false,
          source: ['dynamic-roster-import', 'biometric-realtime'],
          lastSyncedAt: new Date(),
          notes: `Dynamic Security Roster Sync - Code: ${rawCode}`
        };

        await AttendanceDaily.findOneAndUpdate(
          { employeeNumber: empNo, date },
          { $set: attendancePayload },
          { upsert: true, new: true }
        );

        totalDailyUpdated++;
      }
    }

    console.log(`\n================ DYNAMIC SYNC COMPLETE ================`);
    console.log(`Total Schedule Entries Processed: ${totalProcessed}`);
    console.log(`AttendanceDaily Records Upserted: ${totalDailyUpdated}`);

    process.exit(0);
  } catch (err) {
    console.error('Error during dynamic sync:', err);
    process.exit(1);
  }
}

runDynamicBiometricSync();
