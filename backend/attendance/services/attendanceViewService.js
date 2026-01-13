const AttendanceDaily = require('../model/AttendanceDaily');
const AttendanceRawLog = require('../model/AttendanceRawLog');
const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const { calculateMonthlySummary } = require('./summaryCalculationService');

/**
 * Get attendance data for calendar view (Single Employee)
 */
exports.getCalendarViewData = async (employee, year, month) => {
  const targetYear = parseInt(year);
  const targetMonth = parseInt(month);

  // Calculate date range for the month
  const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const endDate = new Date(targetYear, targetMonth, 0); // Last day of month
  const endDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

  // Fetch attendance records for the month
  const records = await AttendanceDaily.find({
    employeeNumber: employee.emp_no,
    date: { $gte: startDate, $lte: endDateStr },
  })
    .populate('shiftId', 'name startTime endTime duration payableShifts')
    .sort({ date: 1 });

  // Fetch approved leaves and ODs
  const startDateObj = new Date(targetYear, targetMonth - 1, 1);
  const endDateObj = new Date(targetYear, targetMonth, 0);

  const approvedLeaves = await Leave.find({
    employeeId: employee._id,
    status: 'approved',
    $or: [
      { fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } },
    ],
    isActive: true,
  })
    .populate('approvals.final.approvedBy', 'name email')
    .populate('approvals.hr.approvedBy', 'name email')
    .populate('approvals.hod.approvedBy', 'name email')
    .populate('appliedBy', 'name email');

  const approvedODs = await OD.find({
    employeeId: employee._id,
    status: 'approved',
    $or: [
      { fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } },
    ],
    isActive: true,
  })
    .populate('approvals.final.approvedBy', 'name email')
    .populate('approvals.hr.approvedBy', 'name email')
    .populate('approvals.hod.approvedBy', 'name email')
    .populate('appliedBy', 'name email');

  // Create maps for leaves and ODs by date
  const leaveMap = {};
  approvedLeaves.forEach(leave => {
    const leaveStart = new Date(leave.fromDate);
    const leaveEnd = new Date(leave.toDate);
    leaveStart.setHours(0, 0, 0, 0);
    leaveEnd.setHours(23, 59, 59, 999);

    let currentDate = new Date(leaveStart);
    let dayCounter = 1;
    while (currentDate <= leaveEnd) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      if (dateStr >= startDate && dateStr <= endDateStr) {
        let approvedBy = null;
        let approvedAt = null;
        if (leave.approvals?.final?.status === 'approved' && leave.approvals.final.approvedBy) {
          approvedBy = leave.approvals.final.approvedBy;
          approvedAt = leave.approvals.final.approvedAt;
        } else if (leave.approvals?.hr?.status === 'approved' && leave.approvals.hr.approvedBy) {
          approvedBy = leave.approvals.hr.approvedBy;
          approvedAt = leave.approvals.hr.approvedAt;
        } else if (leave.approvals?.hod?.status === 'approved' && leave.approvals.hod.approvedBy) {
          approvedBy = leave.approvals.hod.approvedBy;
          approvedAt = leave.approvals.hod.approvedAt;
        }

        leaveMap[dateStr] = {
          leaveId: leave._id,
          leaveType: leave.leaveType,
          isHalfDay: leave.isHalfDay,
          halfDayType: leave.halfDayType,
          purpose: leave.purpose,
          fromDate: leave.fromDate,
          toDate: leave.toDate,
          numberOfDays: leave.numberOfDays,
          dayInLeave: dayCounter,
          appliedAt: leave.appliedAt || leave.createdAt,
          approvedBy: approvedBy ? {
            name: approvedBy.name || approvedBy.email,
            email: approvedBy.email
          } : null,
          approvedAt: approvedAt,
        };
      }
      currentDate.setDate(currentDate.getDate() + 1);
      dayCounter++;
    }
  });

  const odMap = {};
  approvedODs.forEach(od => {
    const odStart = new Date(od.fromDate);
    const odEnd = new Date(od.toDate);
    odStart.setHours(0, 0, 0, 0);
    odEnd.setHours(23, 59, 59, 999);

    let currentDate = new Date(odStart);
    let dayCounter = 1;
    while (currentDate <= odEnd) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      if (dateStr >= startDate && dateStr <= endDateStr) {
        let approvedBy = null;
        let approvedAt = null;
        if (od.approvals?.final?.status === 'approved' && od.approvals.final.approvedBy) {
          approvedBy = od.approvals.final.approvedBy;
          approvedAt = od.approvals.final.approvedAt;
        } else if (od.approvals?.hr?.status === 'approved' && od.approvals.hr.approvedBy) {
          approvedBy = od.approvals.hr.approvedBy;
          approvedAt = od.approvals.hr.approvedAt;
        } else if (od.approvals?.hod?.status === 'approved' && od.approvals.hod.approvedBy) {
          approvedBy = od.approvals.hod.approvedBy;
          approvedAt = od.approvals.hod.approvedAt;
        }

        odMap[dateStr] = {
          odId: od._id,
          odType: od.odType,
          odType_extended: od.odType_extended,
          isHalfDay: od.isHalfDay,
          halfDayType: od.halfDayType,
          purpose: od.purpose,
          placeVisited: od.placeVisited,
          fromDate: od.fromDate,
          toDate: od.toDate,
          numberOfDays: od.numberOfDays,
          durationHours: od.durationHours,
          odStartTime: od.odStartTime,
          odEndTime: od.odEndTime,
          dayInOD: dayCounter,
          appliedAt: od.appliedAt || od.createdAt,
          approvedBy: approvedBy ? {
            name: approvedBy.name || approvedBy.email,
            email: approvedBy.email
          } : null,
          approvedAt: approvedAt,
        };
      }
      currentDate.setDate(currentDate.getDate() + 1);
      dayCounter++;
    }
  });

  // Create merged attendance map
  const attendanceMap = {};
  records.forEach(record => {
    const hasLeave = !!leaveMap[record.date];
    const odInfo = odMap[record.date];
    const hasOD = !!odInfo;
    const hasAttendance = record.status === 'PRESENT' || record.status === 'PARTIAL';
    const odIsHourBased = odInfo?.odType_extended === 'hours';
    const odIsHalfDay = odInfo?.odType_extended === 'half_day' || odInfo?.isHalfDay;
    const isConflict = (hasLeave || (hasOD && !odIsHourBased && !odIsHalfDay)) && hasAttendance;

    attendanceMap[record.date] = {
      date: record.date,
      inTime: record.inTime,
      outTime: record.outTime,
      totalHours: record.totalHours,
      status: record.status,
      shiftId: record.shiftId,
      isLateIn: record.isLateIn || false,
      isEarlyOut: record.isEarlyOut || false,
      lateInMinutes: record.lateInMinutes || null,
      earlyOutMinutes: record.earlyOutMinutes || null,
      earlyOutDeduction: record.earlyOutDeduction || null,
      expectedHours: record.expectedHours || null,
      otHours: record.otHours || 0,
      extraHours: record.extraHours || 0,
      permissionHours: record.permissionHours || 0,
      permissionCount: record.permissionCount || 0,
      hasLeave: hasLeave,
      leaveInfo: leaveMap[record.date] || null,
      hasOD: hasOD,
      odInfo: odMap[record.date] || null,
      isConflict: isConflict,
    };
  });

  // Fill in missing dates with Leave/OD info
  Object.keys(leaveMap).forEach(dateStr => {
    if (!attendanceMap[dateStr]) {
      attendanceMap[dateStr] = {
        date: dateStr,
        status: 'LEAVE',
        hasLeave: true,
        leaveInfo: leaveMap[dateStr],
        hasOD: !!odMap[dateStr],
        odInfo: odMap[dateStr] || null,
        isConflict: false,
      };
    }
  });

  Object.keys(odMap).forEach(dateStr => {
    if (!attendanceMap[dateStr]) {
      attendanceMap[dateStr] = {
        date: dateStr,
        status: 'OD',
        hasLeave: !!leaveMap[dateStr],
        leaveInfo: leaveMap[dateStr] || null,
        hasOD: true,
        odInfo: odMap[dateStr],
        isConflict: false,
      };
    }
  });

  return attendanceMap;
};

/**
 * Get attendance data for table view (Multiple Employees)
 */
exports.getMonthlyTableViewData = async (employees, year, month) => {
  const targetYear = parseInt(year);
  const targetMonth = parseInt(month);

  const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const endDate = new Date(targetYear, targetMonth, 0);
  const endDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  const daysInMonth = endDate.getDate();

  const startDateObj = new Date(targetYear, targetMonth - 1, 1);
  const endDateObj = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

  // Get all attendance records for the month
  const empNos = employees.map(e => e.emp_no);
  const attendanceRecords = await AttendanceDaily.find({
    employeeNumber: { $in: empNos },
    date: { $gte: startDate, $lte: endDateStr },
  })
    .populate('shiftId', 'name startTime endTime duration payableShifts')
    .sort({ employeeNumber: 1, date: 1 });

  // Get all approved leaves
  const empIds = employees.map(e => e._id);
  const allLeaves = await Leave.find({
    employeeId: { $in: empIds },
    status: 'approved',
    $or: [
      { fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } },
    ],
    isActive: true,
  }).populate('employeeId', 'emp_no');

  // Get all approved ODs
  const allODs = await OD.find({
    employeeId: { $in: empIds },
    status: 'approved',
    $or: [
      { fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } },
    ],
    isActive: true,
  }).populate('employeeId', 'emp_no');

  // Create Leave Map
  const leaveMapByEmployee = {};
  allLeaves.forEach(leave => {
    const empNo = leave.employeeId?.emp_no || leave.emp_no;
    if (!empNo) return;
    if (!leaveMapByEmployee[empNo]) leaveMapByEmployee[empNo] = {};

    const leaveStart = new Date(leave.fromDate);
    const leaveEnd = new Date(leave.toDate);
    leaveStart.setHours(0, 0, 0, 0);
    leaveEnd.setHours(23, 59, 59, 999);

    let currentDate = new Date(leaveStart);
    while (currentDate <= leaveEnd) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      if (dateStr >= startDate && dateStr <= endDateStr) {
        leaveMapByEmployee[empNo][dateStr] = {
          leaveId: leave._id,
          leaveType: leave.leaveType,
          isHalfDay: leave.isHalfDay,
          halfDayType: leave.halfDayType,
        };
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  });

  // Create OD Map
  const odMapByEmployee = {};
  allODs.forEach(od => {
    const empNo = od.employeeId?.emp_no || od.emp_no;
    if (!empNo) return;
    if (!odMapByEmployee[empNo]) odMapByEmployee[empNo] = {};

    const odStart = new Date(od.fromDate);
    const odEnd = new Date(od.toDate);
    odStart.setHours(0, 0, 0, 0);
    odEnd.setHours(23, 59, 59, 999);

    let currentDate = new Date(odStart);
    while (currentDate <= odEnd) {
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      if (dateStr >= startDate && dateStr <= endDateStr) {
        odMapByEmployee[empNo][dateStr] = {
          odId: od._id,
          odType: od.odType,
          odType_extended: od.odType_extended,
          isHalfDay: od.isHalfDay,
          halfDayType: od.halfDayType,
          odStartTime: od.odStartTime,
          odEndTime: od.odEndTime,
        };
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  });

  // Create Attendance Map
  const attendanceMap = {};
  attendanceRecords.forEach(record => {
    if (!attendanceMap[record.employeeNumber]) attendanceMap[record.employeeNumber] = {};
    attendanceMap[record.employeeNumber][record.date] = record;
  });

  // Recalculate Summaries (Verification Logic)
  const summaryMap = {};
  const summaryDataMap = {};

  const summaryPromises = employees.map(async (emp) => {
    try {
      const summary = await calculateMonthlySummary(emp._id, emp.emp_no, targetYear, targetMonth);

      // Verification logic (simplified for service - assuming core calculation is trusted or we can duplicate validation if critical)
      // For Controller Slimming, I'm keeping the complex validation logic here as it was in controller. 
      // It's "business logic" regarding data integrity.

      // ... [Insert the verification Logic from controller if needed, or trust summary] ...
      // Copying the validation logic as it seems critical for this system

      let verifiedLeaveDays = 0;
      const empLeaves = allLeaves.filter(l => {
        const empNo = l.employeeId?.emp_no || l.emp_no;
        return empNo === emp.emp_no;
      });

      for (const leave of empLeaves) {
        const leaveStart = new Date(leave.fromDate);
        const leaveEnd = new Date(leave.toDate);
        leaveStart.setHours(0, 0, 0, 0);
        leaveEnd.setHours(23, 59, 59, 999);
        let currentDate = new Date(leaveStart);
        while (currentDate <= leaveEnd) {
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth() + 1;
          if (currentYear === targetYear && currentMonth === targetMonth) {
            verifiedLeaveDays += leave.isHalfDay ? 0.5 : 1;
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      let verifiedODDays = 0;
      const empODs = allODs.filter(od => {
        const empNo = od.employeeId?.emp_no || od.emp_no;
        return empNo === emp.emp_no;
      });
      for (const od of empODs) {
        if (od.odType_extended === 'hours') continue;
        const odStart = new Date(od.fromDate);
        const odEnd = new Date(od.toDate);
        odStart.setHours(0, 0, 0, 0);
        odEnd.setHours(23, 59, 59, 999);
        let currentDate = new Date(odStart);
        while (currentDate <= odEnd) {
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth() + 1;
          if (currentYear === targetYear && currentMonth === targetMonth) {
            verifiedODDays += od.isHalfDay ? 0.5 : 1;
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      const verifiedLeaves = Math.round(verifiedLeaveDays * 10) / 10;
      const verifiedODs = Math.round(verifiedODDays * 10) / 10;

      if (Math.abs(summary.totalLeaves - verifiedLeaves) > 0.1 || Math.abs(summary.totalODs - verifiedODs) > 0.1) {
        summary.totalLeaves = verifiedLeaves;
        summary.totalODs = verifiedODs;
        let totalPayableShifts = 0;
        const presentDays = attendanceRecords.filter(
          r => r.employeeNumber === emp.emp_no && (r.status === 'PRESENT' || r.status === 'PARTIAL')
        );
        for (const record of presentDays) {
          if (record.shiftId && typeof record.shiftId === 'object' && record.shiftId.payableShifts !== undefined) {
            totalPayableShifts += Number(record.shiftId.payableShifts);
          } else {
            totalPayableShifts += 1;
          }
        }
        totalPayableShifts += verifiedODDays;
        summary.totalPayableShifts = Math.round(totalPayableShifts * 100) / 100;
        await summary.save();
      }

      return {
        emp_no: emp.emp_no,
        payableShifts: summary.totalPayableShifts,
        summary: summary
      };

    } catch (error) {
      console.error(`Error calculating summary for ${emp.emp_no}:`, error);
      return { emp_no: emp.emp_no, payableShifts: 0, summary: null };
    }
  });

  const summaryResults = await Promise.all(summaryPromises);
  summaryResults.forEach(result => {
    summaryMap[result.emp_no] = result.payableShifts;
    if (result.summary) {
      summaryDataMap[result.emp_no] = result.summary;
    }
  });

  // Build final response structure
  return employees.map(emp => {
    const dailyAttendance = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = attendanceMap[emp.emp_no]?.[dateStr] || null;
      const leaveInfo = leaveMapByEmployee[emp.emp_no]?.[dateStr] || null;
      const odInfo = odMapByEmployee[emp.emp_no]?.[dateStr] || null;
      const hasLeave = !!leaveInfo;
      const hasOD = !!odInfo;
      const hasAttendance = !!record && (record.status === 'PRESENT' || record.status === 'PARTIAL');
      const odIsHourBased = odInfo?.odType_extended === 'hours';
      const odIsHalfDay = odInfo?.odType_extended === 'half_day' || odInfo?.isHalfDay;
      const isConflict = (hasLeave || (hasOD && !odIsHourBased && !odIsHalfDay)) && hasAttendance;

      let status = 'ABSENT';
      if (record) status = record.status;
      else if (hasLeave) status = 'LEAVE';
      else if (hasOD) status = 'OD';
      else if (new Date(dateStr) > new Date()) status = '-';

      dailyAttendance[dateStr] = {
        date: dateStr,
        status: status,
        inTime: record?.inTime || null,
        outTime: record?.outTime || null,
        totalHours: record?.totalHours || null,
        lateInMinutes: record?.lateInMinutes || 0,
        earlyOutMinutes: record?.earlyOutMinutes || 0,
        isLateIn: record?.isLateIn || false,
        isEarlyOut: record?.isEarlyOut || false,
        shiftId: record?.shiftId || null,
        expectedHours: record?.expectedHours || 0,
        otHours: record?.otHours || 0,
        extraHours: record?.extraHours || 0,
        permissionHours: record?.permissionHours || 0,
        permissionCount: record?.permissionCount || 0,
        notes: record?.notes || '',
        earlyOutDeduction: record?.earlyOutDeduction || null,
        hasLeave,
        leaveInfo,
        hasOD,
        odInfo,
        isConflict
      };
    }

    return {
      _id: emp._id, // Keep for legacy if needed
      employee: emp,
      dailyAttendance: dailyAttendance,
      presentDays: summaryDataMap[emp.emp_no]?.totalPresentDays || 0,
      payableShifts: summaryMap[emp.emp_no] || 0,
      summary: summaryDataMap[emp.emp_no] || null
    };
  });
};
