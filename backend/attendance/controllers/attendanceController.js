/**
 * Attendance Controller
 * Handles attendance data retrieval and display
 */

const AttendanceDaily = require('../model/AttendanceDaily');
const AttendanceRawLog = require('../model/AttendanceRawLog');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const MonthlyAttendanceSummary = require('../model/MonthlyAttendanceSummary');
const { calculateMonthlySummary } = require('../services/summaryCalculationService');

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
            isHalfDay: od.isHalfDay,
            halfDayType: od.halfDayType,
            purpose: od.purpose,
            placeVisited: od.placeVisited,
            fromDate: od.fromDate,
            toDate: od.toDate,
            numberOfDays: od.numberOfDays,
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
      const hasOD = !!odMap[record.date];
      const hasAttendance = record.status === 'PRESENT' || record.status === 'PARTIAL';
      const isConflict = (hasLeave || hasOD) && hasAttendance;
      
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
        expectedHours: record.expectedHours || null,
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

    const query = {
      employeeNumber: employeeNumber.toUpperCase(),
      date: { $gte: startDate, $lte: endDateStr },
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
            isHalfDay: od.isHalfDay,
            halfDayType: od.halfDayType,
            purpose: od.purpose,
            placeVisited: od.placeVisited,
            fromDate: od.fromDate,
            toDate: od.toDate,
            numberOfDays: od.numberOfDays,
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
        let verifiedODDays = 0;
        const empODs = allODs.filter(od => {
          const empNo = od.employeeId?.emp_no || od.emp_no;
          return empNo === emp.emp_no;
        });
        for (const od of empODs) {
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
        const isConflict = (hasLeave || hasOD) && hasAttendance;
        
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
