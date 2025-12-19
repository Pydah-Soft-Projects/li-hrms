/**
 * Attendance Controller
 * Handles attendance data retrieval and display
 */

const AttendanceRawLog = require('../model/AttendanceRawLog');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const MonthlyAttendanceSummary = require('../model/MonthlyAttendanceSummary');
const { calculateMonthlySummary } = require('../services/summaryCalculationService');

/**
 * Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * @desc    Get attendance records for calendar view
 * @route   GET /api/attendance/calendar
 * @access  Private
 */
exports.getAttendanceCalendar = async (req, res) => {
  try {
    const { employeeNumber, year, month } = req.query;

    if (!employeeNumber) {
      return res.status(400).json({
        success: false,
        message: 'Employee number is required',
      });
    }

    // Default to current month if not provided
    const currentDate = new Date();
    const targetYear = parseInt(year) || currentDate.getFullYear();
    const targetMonth = parseInt(month) || (currentDate.getMonth() + 1);

    // Calculate date range for the month
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const endDate = new Date(targetYear, targetMonth, 0); // Last day of month
    const endDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    // Get employee to fetch leaves and ODs
    const employee = await Employee.findOne({ emp_no: employeeNumber.toUpperCase(), is_active: { $ne: false } });

    // Fetch attendance records for the month
    const records = await AttendanceDaily.find({
      employeeNumber: employeeNumber.toUpperCase(),
      date: { $gte: startDate, $lte: endDateStr },
    })
      .populate('shiftId', 'name startTime endTime duration payableShifts')
      .sort({ date: 1 });

    // Fetch approved leaves for this month with full details
    const startDateObj = new Date(targetYear, targetMonth - 1, 1);
    const endDateObj = new Date(targetYear, targetMonth, 0);
    const approvedLeaves = employee ? await Leave.find({
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
      .populate('appliedBy', 'name email') : [];

    // Fetch approved ODs for this month with full details
    const approvedODs = employee ? await OD.find({
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
      .populate('appliedBy', 'name email') : [];

    // Create maps for leaves and ODs by date with full details
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
          // Get final approver (who approved and when)
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
          // Get final approver (who approved and when)
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
            odType_extended: od.odType_extended, // NEW: Include OD type
            isHalfDay: od.isHalfDay,
            halfDayType: od.halfDayType,
            purpose: od.purpose,
            placeVisited: od.placeVisited,
            fromDate: od.fromDate,
            toDate: od.toDate,
            numberOfDays: od.numberOfDays,
            durationHours: od.durationHours, // NEW: Include duration in hours
            odStartTime: od.odStartTime, // NEW: Include start time
            odEndTime: od.odEndTime, // NEW: Include end time
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

    // Create a map for quick lookup
    const attendanceMap = {};
    records.forEach(record => {
      const hasLeave = !!leaveMap[record.date];
      const odInfo = odMap[record.date];
      const hasOD = !!odInfo;
      const hasAttendance = record.status === 'PRESENT' || record.status === 'PARTIAL';
      // Don't show conflict for hour-based OD or half-day OD (they can work and be on OD)
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

    // Also add leave/OD info for dates without attendance records
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

    res.status(200).json({
      success: true,
      data: attendanceMap,
      year: targetYear,
      month: targetMonth,
    });

  } catch (error) {
    console.error('Error fetching attendance calendar:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch attendance calendar',
    });
  }
};

/**
 * @desc    Get attendance records for list view
 * @route   GET /api/attendance/list
 * @access  Private
 */
exports.getAttendanceList = async (req, res) => {
  try {
    const { employeeNumber, startDate, endDate, page = 1, limit = 30 } = req.query;

    if (!employeeNumber) {
      return res.status(400).json({
        success: false,
        message: 'Employee number is required',
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }

    const query = {
      employeeNumber: employeeNumber.toUpperCase(),
      date: { $gte: startDate, $lte: endDate },
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const records = await AttendanceDaily.find(query)
      .populate('shiftId', 'name startTime endTime duration')
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AttendanceDaily.countDocuments(query);

    res.status(200).json({
      success: true,
      data: records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('Error fetching attendance list:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch attendance list',
    });
  }
};

/**
 * @desc    Get available shifts for an employee for a specific date
 * @route   GET /api/attendance/:employeeNumber/:date/available-shifts
 * @access  Private
 */
exports.getAvailableShifts = async (req, res) => {
  try {
    const { employeeNumber, date } = req.params;

    const { getShiftsForEmployee } = require('../../shifts/services/shiftDetectionService');
    const { shifts, source } = await getShiftsForEmployee(employeeNumber, date);

    res.status(200).json({
      success: true,
      data: shifts,
      source: source,
    });

  } catch (error) {
    console.error('Error fetching available shifts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available shifts',
      error: error.message,
    });
  }
};

/**
 * @desc    Get attendance detail for a specific date
 * @route   GET /api/attendance/detail
 * @access  Private
 */
exports.getAttendanceDetail = async (req, res) => {
  try {
    const { employeeNumber, date } = req.query;

    if (!employeeNumber || !date) {
      return res.status(400).json({
        success: false,
        message: 'Employee number and date are required',
      });
    }

    const record = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    })
      .populate('shiftId', 'name startTime endTime duration gracePeriod');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    // Also fetch raw logs for that day
    const rawLogs = await AttendanceRawLog.find({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).sort({ timestamp: 1 });

    res.status(200).json({
      success: true,
      data: {
        ...record.toObject(),
        rawLogs,
      },
    });

  } catch (error) {
    console.error('Error fetching attendance detail:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch attendance detail',
    });
  }
};

/**
 * @desc    Get all employees with their attendance summary
 * @route   GET /api/attendance/employees
 * @access  Private
 */
exports.getEmployeesWithAttendance = async (req, res) => {
  try {
    const { date } = req.query;

    // Get all employees
    const employees = await Employee.find({ is_active: { $ne: false } })
      .select('emp_no employee_name department_id designation_id')
      .populate('department_id', 'name')
      .populate('designation_id', 'name');

    // If date provided, get attendance for that date
    let attendanceMap = {};
    if (date) {
      const records = await AttendanceDaily.find({ date });
      records.forEach(record => {
        attendanceMap[record.employeeNumber] = record;
      });
    }

    const employeesWithAttendance = employees.map(emp => ({
      ...emp.toObject(),
      attendance: attendanceMap[emp.emp_no] || null,
    }));

    res.status(200).json({
      success: true,
      data: employeesWithAttendance,
    });

  } catch (error) {
    console.error('Error fetching employees with attendance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch employees with attendance',
    });
  }
};

/**
 * @desc    Get all employees attendance for a month (for table view)
 * @route   GET /api/attendance/monthly
 * @access  Private
 */
exports.getMonthlyAttendance = async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required',
      });
    }

    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(parseInt(year), parseInt(month), 0);
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    const daysInMonth = endDate.getDate();

    // Get all active employees
    const employees = await Employee.find({ is_active: { $ne: false } })
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .sort({ employee_name: 1 });

    // Get all attendance records for the month
    const attendanceRecords = await AttendanceDaily.find({
      date: { $gte: startDate, $lte: endDateStr },
    })
      .populate('shiftId', 'name startTime endTime duration payableShifts')
      .sort({ employeeNumber: 1, date: 1 });

    // Get all approved leaves for this month with full details
    const startDateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDateObj = new Date(parseInt(year), parseInt(month), 0);
    const allLeaves = await Leave.find({
      status: 'approved',
      $or: [
        { fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } },
      ],
      isActive: true,
    })
      .populate('employeeId', 'emp_no')
      .populate('approvals.final.approvedBy', 'name email')
      .populate('approvals.hr.approvedBy', 'name email')
      .populate('approvals.hod.approvedBy', 'name email')
      .populate('appliedBy', 'name email');

    // Get all approved ODs for this month with full details
    const allODs = await OD.find({
      status: 'approved',
      $or: [
        { fromDate: { $lte: endDateObj }, toDate: { $gte: startDateObj } },
      ],
      isActive: true,
    })
      .populate('employeeId', 'emp_no')
      .populate('approvals.final.approvedBy', 'name email')
      .populate('approvals.hr.approvedBy', 'name email')
      .populate('approvals.hod.approvedBy', 'name email')
      .populate('appliedBy', 'name email');

    // Create leave and OD maps by employee and date
    const leaveMapByEmployee = {};
    allLeaves.forEach(leave => {
      const empNo = leave.employeeId?.emp_no || leave.emp_no;
      if (!empNo) return;
      if (!leaveMapByEmployee[empNo]) {
        leaveMapByEmployee[empNo] = {};
      }
      const leaveStart = new Date(leave.fromDate);
      const leaveEnd = new Date(leave.toDate);
      // Reset time to avoid timezone issues
      leaveStart.setHours(0, 0, 0, 0);
      leaveEnd.setHours(23, 59, 59, 999);

      // Iterate through all dates in the leave range
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
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });

    const odMapByEmployee = {};
    allODs.forEach(od => {
      const empNo = od.employeeId?.emp_no || od.emp_no;
      if (!empNo) return;
      if (!odMapByEmployee[empNo]) {
        odMapByEmployee[empNo] = {};
      }
      const odStart = new Date(od.fromDate);
      const odEnd = new Date(od.toDate);
      // Reset time to avoid timezone issues
      odStart.setHours(0, 0, 0, 0);
      odEnd.setHours(23, 59, 59, 999);

      // Iterate through all dates in the OD range
      let currentDate = new Date(odStart);
      let dayCounter = 1;
      while (currentDate <= odEnd) {
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        if (dateStr >= startDate && dateStr <= endDateStr) {
          // Get final approver (who approved and when)
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

          odMapByEmployee[empNo][dateStr] = {
            odId: od._id,
            odType: od.odType,
            odType_extended: od.odType_extended, // NEW: Include OD type (full_day, half_day, hours)
            isHalfDay: od.isHalfDay,
            halfDayType: od.halfDayType,
            purpose: od.purpose,
            placeVisited: od.placeVisited,
            fromDate: od.fromDate,
            toDate: od.toDate,
            numberOfDays: od.numberOfDays,
            durationHours: od.durationHours, // NEW: Include duration in hours for hour-based OD
            odStartTime: od.odStartTime, // NEW: Include start time for hour-based OD
            odEndTime: od.odEndTime, // NEW: Include end time for hour-based OD
            dayInOD: dayCounter,
            appliedAt: od.appliedAt || od.createdAt,
            approvedBy: approvedBy ? {
              name: approvedBy.name || approvedBy.email,
              email: approvedBy.email
            } : null,
            approvedAt: approvedAt,
          };
        }
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
        dayCounter++;
      }
    });

    // Create a map: employeeNumber -> date -> record
    const attendanceMap = {};
    attendanceRecords.forEach(record => {
      if (!attendanceMap[record.employeeNumber]) {
        attendanceMap[record.employeeNumber] = {};
      }
      attendanceMap[record.employeeNumber][record.date] = record;
    });

    // Always recalculate and verify monthly summaries for all employees
    // This ensures real-time accuracy by cross-checking with actual leave/OD records
    const summaryMap = {};
    const summaryDataMap = {}; // Store full summary data for response

    // Recalculate summaries for all employees in parallel to ensure accuracy
    const summaryPromises = employees.map(async (emp) => {
      try {
        // Always recalculate to ensure it's up to date with latest leaves/ODs
        const summary = await calculateMonthlySummary(emp._id, emp.emp_no, parseInt(year), parseInt(month));

        // Verify the summary by cross-checking with actual leave/OD counts
        // Count leaves manually for verification
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
            if (currentYear === parseInt(year) && currentMonth === parseInt(month)) {
              verifiedLeaveDays += leave.isHalfDay ? 0.5 : 1;
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }
        }

        // Count ODs manually for verification
        // IMPORTANT: Exclude hour-based ODs (they don't count as days)
        let verifiedODDays = 0;
        const empODs = allODs.filter(od => {
          const empNo = od.employeeId?.emp_no || od.emp_no;
          return empNo === emp.emp_no;
        });
        for (const od of empODs) {
          // Skip hour-based ODs - they don't count as days
          if (od.odType_extended === 'hours') {
            continue;
          }

          const odStart = new Date(od.fromDate);
          const odEnd = new Date(od.toDate);
          odStart.setHours(0, 0, 0, 0);
          odEnd.setHours(23, 59, 59, 999);

          let currentDate = new Date(odStart);
          while (currentDate <= odEnd) {
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            if (currentYear === parseInt(year) && currentMonth === parseInt(month)) {
              verifiedODDays += od.isHalfDay ? 0.5 : 1;
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }
        }

        // If verification shows different numbers, recalculate
        const verifiedLeaves = Math.round(verifiedLeaveDays * 10) / 10;
        const verifiedODs = Math.round(verifiedODDays * 10) / 10;

        if (Math.abs(summary.totalLeaves - verifiedLeaves) > 0.1 || Math.abs(summary.totalODs - verifiedODs) > 0.1) {
          console.log(`Summary mismatch for ${emp.emp_no}: Recalculating...`);
          // Recalculate with verified counts
          summary.totalLeaves = verifiedLeaves;
          summary.totalODs = verifiedODs;
          // Recalculate payable shifts (ODs contribute to payable shifts)
          let totalPayableShifts = 0;
          const presentDays = attendanceRecords.filter(
            r => r.employeeNumber === emp.emp_no && (r.status === 'PRESENT' || r.status === 'PARTIAL')
          );
          for (const record of presentDays) {
            if (record.shiftId && typeof record.shiftId === 'object' && record.shiftId.payableShifts !== undefined && record.shiftId.payableShifts !== null) {
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

    // Build response with employees and their daily attendance
    const employeesWithAttendance = employees.map(emp => {
      const dailyAttendance = {};

      // Create entries for all days of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const record = attendanceMap[emp.emp_no]?.[dateStr] || null;
        const leaveInfo = leaveMapByEmployee[emp.emp_no]?.[dateStr] || null;
        const odInfo = odMapByEmployee[emp.emp_no]?.[dateStr] || null;
        const hasLeave = !!leaveInfo;
        const hasOD = !!odInfo;
        const hasAttendance = !!record && (record.status === 'PRESENT' || record.status === 'PARTIAL');
        // Don't show conflict for hour-based OD or half-day OD (they can work and be on OD)
        const odIsHourBased = odInfo?.odType_extended === 'hours';
        const odIsHalfDay = odInfo?.odType_extended === 'half_day' || odInfo?.isHalfDay;
        const isConflict = (hasLeave || (hasOD && !odIsHourBased && !odIsHalfDay)) && hasAttendance;

        dailyAttendance[dateStr] = record ? {
          date: record.date,
          status: record.status,
          inTime: record.inTime,
          outTime: record.outTime,
          totalHours: record.totalHours,
          shiftId: record.shiftId,
          isLateIn: record.isLateIn,
          isEarlyOut: record.isEarlyOut,
          lateInMinutes: record.lateInMinutes,
          earlyOutMinutes: record.earlyOutMinutes,
          otHours: record.otHours || 0,
          extraHours: record.extraHours || 0,
          permissionHours: record.permissionHours || 0,
          permissionCount: record.permissionCount || 0,
          hasLeave: hasLeave,
          leaveInfo: leaveInfo,
          hasOD: hasOD,
          odInfo: odInfo,
          isConflict: isConflict,
        } : {
          date: dateStr,
          status: hasLeave || hasOD ? (hasLeave ? 'LEAVE' : 'OD') : 'ABSENT',
          hasLeave: hasLeave,
          leaveInfo: leaveInfo,
          hasOD: hasOD,
          odInfo: odInfo,
          isConflict: false,
        };
      }

      // Calculate present days
      let presentDays = 0;
      Object.values(dailyAttendance).forEach(day => {
        if (day && (day.status === 'PRESENT' || day.status === 'PARTIAL')) {
          presentDays++;
        }
      });

      return {
        employee: {
          _id: emp._id,
          emp_no: emp.emp_no,
          employee_name: emp.employee_name,
          department: emp.department_id,
          designation: emp.designation_id,
        },
        dailyAttendance,
        presentDays,
        payableShifts: summaryMap[emp.emp_no] || 0,
        summary: summaryDataMap[emp.emp_no] || null, // Include full summary for modal
      };
    });

    res.status(200).json({
      success: true,
      data: employeesWithAttendance,
      month: parseInt(month),
      year: parseInt(year),
      daysInMonth,
    });

  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch monthly attendance',
    });
  }
};

/**
 * @desc    Update outTime for attendance record (for PARTIAL attendance)
 * @route   PUT /api/attendance/:employeeNumber/:date/outtime
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.updateOutTime = async (req, res) => {
  try {
    const { employeeNumber, date } = req.params;
    const { outTime } = req.body;

    const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
    const { detectAndAssignShift } = require('../../shifts/services/shiftDetectionService');

    if (!outTime) {
      return res.status(400).json({
        success: false,
        message: 'Out time is required',
      });
    }

    // Get attendance record
    const AttendanceDaily = require('../model/AttendanceDaily');
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shiftId');

    if (!attendanceRecord) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    if (!attendanceRecord.inTime) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record has no in-time',
      });
    }

    // Ensure outTime is a Date object
    let outTimeDate = outTime instanceof Date ? outTime : new Date(outTime);

    if (isNaN(outTimeDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid out time format',
      });
    }

    // Handle next-day scenario for overnight shifts
    // Check if the shift is overnight and adjust out-time accordingly
    const outTimeOnly = outTimeDate.getHours() * 60 + outTimeDate.getMinutes();
    const inTimeOnly = attendanceRecord.inTime.getHours() * 60 + attendanceRecord.inTime.getMinutes();
    const outTimeDateStr = outTimeDate.toDateString();
    const inTimeDateStr = attendanceRecord.inTime.toDateString();

    // Get shift to check if it's overnight
    let isOvernightShift = false;
    if (attendanceRecord.shiftId &&
      typeof attendanceRecord.shiftId === 'object' &&
      attendanceRecord.shiftId.startTime &&
      attendanceRecord.shiftId.endTime) {
      const [shiftStartHour] = attendanceRecord.shiftId.startTime.split(':').map(Number);
      const [shiftEndHour] = attendanceRecord.shiftId.endTime.split(':').map(Number);
      isOvernightShift = shiftStartHour >= 20 || (shiftEndHour < shiftStartHour);
    }

    // If shift is overnight or out-time is earlier than in-time and on same date, it's next day
    if (isOvernightShift || (outTimeOnly < inTimeOnly && outTimeDateStr === inTimeDateStr)) {
      // For overnight shifts, out-time on the next day is expected
      // Ensure out-time date is set correctly
      if (!isOvernightShift && outTimeDateStr === inTimeDateStr) {
        // Same date but out-time earlier - must be next day
        outTimeDate = new Date(outTimeDate);
        outTimeDate.setDate(outTimeDate.getDate() + 1);
      }
      // For overnight shifts, the out-time date might already be correct, just ensure it's preserved
    }

    // Update outTime
    attendanceRecord.outTime = outTimeDate;
    attendanceRecord.status = attendanceRecord.status === 'PARTIAL' ? 'PRESENT' : attendanceRecord.status;

    // Re-run shift detection with new outTime
    const detectionResult = await detectAndAssignShift(
      employeeNumber.toUpperCase(),
      date,
      attendanceRecord.inTime,
      outTimeDate
    );

    if (detectionResult.success && detectionResult.assignedShift) {
      attendanceRecord.shiftId = detectionResult.assignedShift;
      attendanceRecord.lateInMinutes = detectionResult.lateInMinutes;
      attendanceRecord.earlyOutMinutes = detectionResult.earlyOutMinutes;
      attendanceRecord.isLateIn = detectionResult.isLateIn || false;
      attendanceRecord.isEarlyOut = detectionResult.isEarlyOut || false;
      attendanceRecord.expectedHours = detectionResult.expectedHours;

      // Update roster tracking if rosterRecordId exists
      if (detectionResult.rosterRecordId) {
        await PreScheduledShift.findByIdAndUpdate(detectionResult.rosterRecordId, {
          attendanceDailyId: attendanceRecord._id
        });
      }
    }

    // Check and resolve ConfusedShift if exists
    const ConfusedShift = require('../../shifts/model/ConfusedShift');
    const confusedShift = await ConfusedShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      status: 'pending',
    });

    if (confusedShift && detectionResult.success && detectionResult.assignedShift) {
      // Resolve ConfusedShift
      confusedShift.status = 'resolved';
      confusedShift.assignedShiftId = detectionResult.assignedShift;
      confusedShift.reviewedBy = req.user?.userId || req.user?._id;
      confusedShift.reviewedAt = new Date();
      await confusedShift.save();
    }

    // If out-time is on next day (for overnight shifts), ensure it's stored with correct date
    // The attendance record date should remain as the shift date (in-time date)
    // But out-time can be on the next day

    await attendanceRecord.save();

    // If this is an overnight shift and out-time is on next day, ensure next day doesn't have duplicate
    if (attendanceRecord.shiftId && typeof attendanceRecord.shiftId === 'object' && attendanceRecord.shiftId.startTime) {
      const shift = attendanceRecord.shiftId;
      const [shiftStartHour] = shift.startTime.split(':').map(Number);
      const isOvernight = shiftStartHour >= 20;

      if (isOvernight && attendanceRecord.outTime) {
        const outDateStr = formatDate(attendanceRecord.outTime);
        if (outDateStr !== date) {
          // Out-time is on next day - check and clean up duplicate record if exists
          const nextDayRecord = await AttendanceDaily.findOne({
            employeeNumber: employeeNumber.toUpperCase(),
            date: outDateStr,
          });

          // If next day has only out-time (no in-time), it's likely a duplicate - remove it
          if (nextDayRecord && !nextDayRecord.inTime && nextDayRecord.outTime) {
            // Check if it's the same out-time
            const nextDayOutTimeStr = formatDate(nextDayRecord.outTime);
            const currentOutTimeStr = formatDate(attendanceRecord.outTime);
            if (nextDayOutTimeStr === currentOutTimeStr) {
              await AttendanceDaily.deleteOne({ _id: nextDayRecord._id });
            }
          }
        }
      }
    }

    // Detect extra hours
    const { detectExtraHours } = require('../services/extraHoursService');
    await detectExtraHours(employeeNumber.toUpperCase(), date);

    // Recalculate monthly summary for both current and next day (if overnight)
    const { recalculateOnAttendanceUpdate } = require('../services/summaryCalculationService');
    await recalculateOnAttendanceUpdate(employeeNumber.toUpperCase(), date);

    // If out-time is on next day, also recalculate next day's summary
    if (attendanceRecord.outTime) {
      const outDateStr = formatDate(attendanceRecord.outTime);
      if (outDateStr !== date) {
        await recalculateOnAttendanceUpdate(employeeNumber.toUpperCase(), outDateStr);
      }
    }

    const updatedRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    })
      .populate('shiftId', 'name startTime endTime duration payableShifts');

    res.status(200).json({
      success: true,
      message: 'Out time updated successfully',
      data: updatedRecord,
    });

  } catch (error) {
    console.error('Error updating out time:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating out time',
      error: error.message,
    });
  }
};

/**
 * @desc    Manually assign shift to attendance record
 * @route   PUT /api/attendance/:employeeNumber/:date/shift
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.assignShift = async (req, res) => {
  try {
    const { employeeNumber, date } = req.params;
    const { shiftId } = req.body;

    if (!shiftId) {
      return res.status(400).json({
        success: false,
        message: 'Shift ID is required',
      });
    }

    // Get attendance record
    const AttendanceDaily = require('../model/AttendanceDaily');
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shiftId');

    if (!attendanceRecord) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    if (!attendanceRecord.inTime) {
      return res.status(400).json({
        success: false,
        message: 'Attendance record has no in-time',
      });
    }

    // Verify shift exists
    const shift = await Shift.findById(shiftId);
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: 'Shift not found',
      });
    }

    // Delete ConfusedShift if it exists for this date
    const ConfusedShift = require('../../shifts/model/ConfusedShift');
    const confusedShift = await ConfusedShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      status: 'pending',
    });

    if (confusedShift) {
      confusedShift.status = 'resolved';
      confusedShift.assignedShiftId = shiftId;
      confusedShift.reviewedBy = req.user?.userId || req.user?._id;
      confusedShift.reviewedAt = new Date();
      await confusedShift.save();
    }

    // Calculate late-in and early-out with the assigned shift
    const { calculateLateIn, calculateEarlyOut } = require('../../shifts/services/shiftDetectionService');
    // Pass the date parameter for proper overnight shift handling
    const lateInMinutes = calculateLateIn(attendanceRecord.inTime, shift.startTime, shift.gracePeriod || 15, date);
    const earlyOutMinutes = attendanceRecord.outTime
      ? calculateEarlyOut(attendanceRecord.outTime, shift.endTime, shift.startTime, date)
      : null;

    // Update attendance record
    attendanceRecord.shiftId = shiftId;
    attendanceRecord.lateInMinutes = lateInMinutes > 0 ? lateInMinutes : null;
    attendanceRecord.earlyOutMinutes = earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null;
    attendanceRecord.isLateIn = lateInMinutes > 0;
    attendanceRecord.isEarlyOut = earlyOutMinutes && earlyOutMinutes > 0;
    attendanceRecord.expectedHours = shift.duration;

    await attendanceRecord.save();

    // Update roster tracking for manual assignment
    const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
    const rosterRecord = await PreScheduledShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date
    });

    if (rosterRecord) {
      const isDeviation = rosterRecord.shiftId && rosterRecord.shiftId.toString() !== shiftId.toString();
      rosterRecord.actualShiftId = shiftId;
      rosterRecord.isDeviation = !!isDeviation;
      rosterRecord.attendanceDailyId = attendanceRecord._id;
      await rosterRecord.save();
    }

    // Detect extra hours if out-time exists
    if (attendanceRecord.outTime) {
      const { detectExtraHours } = require('../services/extraHoursService');
      await detectExtraHours(employeeNumber.toUpperCase(), date);
    }

    // Recalculate monthly summary
    const { recalculateOnAttendanceUpdate } = require('../services/summaryCalculationService');
    await recalculateOnAttendanceUpdate(employeeNumber.toUpperCase(), date);

    const updatedRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    })
      .populate('shiftId', 'name startTime endTime duration payableShifts');

    res.status(200).json({
      success: true,
      message: 'Shift assigned successfully',
      data: updatedRecord,
    });

  } catch (error) {
    console.error('Error assigning shift:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning shift',
      error: error.message,
    });
  }
};
