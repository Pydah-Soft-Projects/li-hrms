/**
 * Security Attendance Service
 * Handles Security Group shift comparison, missing attendance detection,
 * division-wise & department-wise shift mapping, and database updating
 * based on physical attendance sheet records.
 */

const mongoose = require('mongoose');
const AttendanceDaily = require('../model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');
const Division = require('../../departments/model/Division');
const Shift = require('../../shifts/model/Shift');

/**
 * Hardcoded parsed roster data from the physical attendance sheet
 * Period: 2026-08-26 to 2026-09-25 (31 days)
 */
const SECURITY_SHEET_ROSTER = {
  // 1717 - DANGETI RAMBABU (D. Ram Babu)
  '1717': [
    'A','B','A','A','C','C', // Aug 26-31
    'B','B','A','A','C','C','B','B','A','A','C','C','B','B','A','A','C','C','B','B','A','A','C','C','B' // Sep 1-25
  ],
  // 2140 - YALLA VENKATESWARA RAO (Y. Venkateswara Rao)
  '2140': [
    'B','B','A','A','C','C', // Aug 26-31
    'B','B','A','A','C','C','B','B','A','A','C','C','L','B','A','A','C','C','B','B','A','A','C','C','B' // Sep 1-25
  ],
  // 1951 - D.R.K.B.T SATYA PRASAD (D. Satya Prasad)
  '1951': [
    'B','A','A','C','C','B', // Aug 26-31
    'B','A','A','B','C','B','B','A','A','B','C','B','B','A','A','C','B','B','B','A','A','C','B','B','A','A' // Sep 1-25
  ],
  // 111181 - KALIPALLI MADHUSUDANA RAO (K. Madhu)
  '111181': [
    'B','A','C','A','B','A', // Aug 26-31
    'A','C','B','B','A','A','L','C','C','B','B','A','A','C','B','B','B','A','C','A','C','C','B','B','A' // Sep 1-25
  ],
  // 2159 - BEERA SRINIVAS (B. Srinivas)
  '2159': [
    'C','C','B','B','A','A', // Aug 26-31
    'C','C','B','B','A','A','C','C','B','B','A','A','L','L','L','L','L','L','C','C','B','B','A','A','C' // Sep 1-25
  ],
  // 2160 - CHINTA CHANTIBABU (CH. Chantibabu)
  '2160': [
    'C','C','B','B','A','A', // Aug 26-31
    'C','C','B','B','A','A','C','C','B','B','A','A','L','L','L','L','L','L','L','L','L','L','A','C','C' // Sep 1-25
  ],
  // 2249 - POLAVARAPU SRINU (P. Srinu)
  '2249': [
    'A','G','L','G','A','L', // Aug 26-31
    'L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','L','G','L','L' // Sep 1-25
  ],
  // 111189 - MEDAPATI RAJAKUMAR (M. Raja Kumar)
  '111189': [
    'B','A','G','G','L','G', // Aug 26-31
    'G','G','A','G','B','G','A','G','G','A','L','C','B','B','A','A','A','C','B','B','A','A','C','L','L' // Sep 1-25
  ],
  // 2118 - PALIKA RAJU (P. Raju - Hostel)
  '2118': [
    'C','L','C','C','C','C', // Aug 26-31
    'C','C','L','C','C','C','C','C','C','C','C','C','C','C','C','C','C','C','C','C','C','C','C','C','C' // Sep 1-25
  ]
};

const DATES_LIST = [
  '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31',
  '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06',
  '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12',
  '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
  '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'
];

/**
 * Get Division-wise and Department-wise Shift details for Security Group
 */
async function getSecurityGroupShiftDetails() {
  const securityDept = await Department.findOne({ name: /SECURITY/i })
    .populate('shifts.shiftId')
    .populate('divisionDefaults.shifts.shiftId');

  const divisions = await Division.find({
    $or: [{ name: /SECURITY/i }, { name: /ENGINEERING/i }]
  }).populate('shifts.shiftId');

  const shiftsMaster = await Shift.find({
    $or: [
      { name: /SECURITY/i },
      { name: /NTS-GENERAL/i }
    ]
  });

  const divisionShifts = divisions.map(div => ({
    divisionId: div._id,
    divisionName: div.name,
    divisionCode: div.code,
    shifts: (div.shifts || []).map(s => ({
      shiftId: s.shiftId?._id,
      name: s.shiftId?.name,
      startTime: s.shiftId?.startTime,
      endTime: s.shiftId?.endTime,
      duration: s.shiftId?.duration,
      payableShifts: s.shiftId?.payableShifts
    }))
  }));

  const departmentShifts = {
    departmentId: securityDept?._id,
    departmentName: securityDept?.name,
    departmentCode: securityDept?.code,
    directShifts: (securityDept?.shifts || []).map(s => ({
      shiftId: s.shiftId?._id,
      name: s.shiftId?.name,
      startTime: s.shiftId?.startTime,
      endTime: s.shiftId?.endTime
    })),
    divisionDefaults: (securityDept?.divisionDefaults || []).map(dd => ({
      divisionId: dd.division,
      shifts: (dd.shifts || []).map(s => ({
        shiftId: s.shiftId?._id,
        name: s.shiftId?.name,
        startTime: s.shiftId?.startTime,
        endTime: s.shiftId?.endTime
      }))
    }))
  };

  return {
    masterShifts: shiftsMaster,
    divisionShifts,
    departmentShifts
  };
}

/**
 * Find missing attendance or discrepancy report between DB and Physical Sheet
 */
async function findMissingSecurityAttendance() {
  const empNos = Object.keys(SECURITY_SHEET_ROSTER);
  const emps = await Employee.find({ emp_no: { $in: empNos } })
    .populate('department_id')
    .populate('division_id');

  const dbRecords = await AttendanceDaily.find({
    employeeNumber: { $in: empNos },
    date: { $in: DATES_LIST }
  });

  const dbMap = {};
  dbRecords.forEach(r => {
    dbMap[`${r.employeeNumber}_${r.date}`] = r;
  });

  const missingReport = [];

  for (const empNo of empNos) {
    const emp = emps.find(e => e.emp_no === empNo);
    const sheetCodes = SECURITY_SHEET_ROSTER[empNo];

    DATES_LIST.forEach((date, idx) => {
      const sheetCode = sheetCodes[idx] || '-';
      const key = `${empNo}_${date}`;
      const rec = dbMap[key];

      const expectedStatus = (sheetCode === 'L' || sheetCode === '-') ? 'LEAVE' : 'PRESENT';
      const currentStatus = rec ? rec.status : 'MISSING';

      if (!rec || currentStatus !== expectedStatus) {
        missingReport.push({
          empNo,
          employeeName: emp?.employee_name,
          date,
          sheetCode,
          expectedStatus,
          currentDbStatus: currentStatus,
          currentDbWorkingHours: rec?.totalWorkingHours || 0,
          currentDbPayableShifts: rec?.payableShifts || 0,
          issue: !rec ? 'Missing Record' : `Discrepancy: DB is ${currentStatus}, Sheet is ${expectedStatus} (${sheetCode})`
        });
      }
    });
  }

  return missingReport;
}

/**
 * Update Security Group Attendance on Local Database based on physical attendance sheet
 */
async function updateSecurityGroupAttendanceInDB() {
  const empNos = Object.keys(SECURITY_SHEET_ROSTER);
  const emps = await Employee.find({ emp_no: { $in: empNos } });
  const empMap = {};
  emps.forEach(e => { empMap[e.emp_no] = e; });

  // Get master shifts
  const shifts = await Shift.find({
    name: { $in: ['A-SECURITY', 'B-SECURITY', 'C-SECURITY', '12HRS-SECURITY', 'NTS-GENERAL'] }
  });

  const shiftMap = {};
  shifts.forEach(s => { shiftMap[s.name] = s; });

  // Default shift mappings
  const codeToShiftName = {
    'A': 'A-SECURITY',
    'B': 'B-SECURITY',
    'C': 'C-SECURITY',
    'G': 'NTS-GENERAL'
  };

  const results = {
    updated: 0,
    created: 0,
    errors: []
  };

  for (const empNo of empNos) {
    const emp = empMap[empNo];
    if (!emp) {
      results.errors.push(`Employee ${empNo} not found in DB`);
      continue;
    }

    const sheetCodes = SECURITY_SHEET_ROSTER[empNo];

    for (let i = 0; i < DATES_LIST.length; i++) {
      const date = DATES_LIST[i];
      const sheetCode = sheetCodes[i];

      const isLeave = (sheetCode === 'L' || sheetCode === '-');
      const shiftName = codeToShiftName[sheetCode] || 'A-SECURITY';
      const shiftObj = shiftMap[shiftName];

      const startTimeStr = shiftObj?.startTime || '09:00';
      const endTimeStr = shiftObj?.endTime || '17:30';
      const durationHrs = shiftObj?.duration || 8;
      const payableVal = isLeave ? 0 : (shiftObj?.payableShifts || 1);

      // Create IN and OUT Date timestamps for shift
      let inTimeDate = null;
      let outTimeDate = null;

      if (!isLeave) {
        const [sH, sM] = startTimeStr.split(':').map(Number);
        const [eH, eM] = endTimeStr.split(':').map(Number);

        inTimeDate = new Date(`${date}T${startTimeStr}:00.000Z`);
        outTimeDate = new Date(`${date}T${endTimeStr}:00.000Z`);
        if (eH < sH) {
          // Night shift crossing midnight
          const nextDay = new Date(inTimeDate);
          nextDay.setDate(nextDay.getDate() + 1);
          const nextDayStr = nextDay.toISOString().split('T')[0];
          outTimeDate = new Date(`${nextDayStr}T${endTimeStr}:00.000Z`);
        }
      }

      const shiftData = isLeave ? [] : [{
        shiftNumber: 1,
        inTime: inTimeDate,
        outTime: outTimeDate,
        duration: durationHrs * 60,
        workingHours: durationHrs,
        punchHours: durationHrs,
        odHours: 0,
        edgePermissionHours: 0,
        otHours: 0,
        shiftId: shiftObj?._id || null,
        shiftName: shiftObj?.name || shiftName,
        shiftStartTime: startTimeStr,
        shiftEndTime: endTimeStr,
        lateInMinutes: 0,
        earlyOutMinutes: 0,
        isLateIn: false,
        isEarlyOut: false,
        status: 'PRESENT',
        payableShift: payableVal,
        basePayable: payableVal,
        expectedHours: durationHrs,
        extraHours: 0
      }];

      const updatePayload = {
        employee_id: emp._id,
        employeeNumber: empNo,
        date,
        shifts: shiftData,
        totalShifts: isLeave ? 0 : 1,
        totalWorkingHours: isLeave ? 0 : durationHrs,
        totalOTHours: 0,
        payableShifts: payableVal,
        totalLateInMinutes: 0,
        totalEarlyOutMinutes: 0,
        totalExpectedHours: isLeave ? 0 : durationHrs,
        status: isLeave ? 'LEAVE' : 'PRESENT',
        isEdited: true,
        source: ['manual-paper-sheet'],
        lastSyncedAt: new Date(),
        notes: `Updated from Security Guards Duty Attendance Sheet (Sep 26) - Sheet Code: ${sheetCode}`
      };

      const existing = await AttendanceDaily.findOne({ employeeNumber: empNo, date });
      if (existing) {
        await AttendanceDaily.updateOne({ _id: existing._id }, { $set: updatePayload });
        results.updated++;
      } else {
        await AttendanceDaily.create(updatePayload);
        results.created++;
      }
    }
  }

  return results;
}

module.exports = {
  SECURITY_SHEET_ROSTER,
  DATES_LIST,
  getSecurityGroupShiftDetails,
  findMissingSecurityAttendance,
  updateSecurityGroupAttendanceInDB
};
