/**
 * Attendance Controller
 * Handles attendance data retrieval and display
 */

const AttendanceRawLog = require('../model/AttendanceRawLog');
const AttendanceDaily = require('../model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const MonthlyAttendanceSummary = require('../model/MonthlyAttendanceSummary');
const { calculateMonthlySummary } = require('../services/summaryCalculationService');
const Settings = require('../../settings/model/Settings');

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

    // Get employee with scope validation
    const employee = await Employee.findOne({
      ...req.scopeFilter,
      emp_no: employeeNumber.toUpperCase(),
      is_active: { $ne: false }
    });

    if (!employee) {
      return res.status(403).json({
        success: false,
        message: 'Access denied or employee not found',
      });
    }

    const { getCalendarViewData } = require('../services/attendanceViewService');
    const attendanceMap = await getCalendarViewData(employee, targetYear, targetMonth);

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

    // Scope validation
    const allowedEmployee = await Employee.findOne({
      ...req.scopeFilter,
      emp_no: employeeNumber.toUpperCase()
    });

    if (!allowedEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Access denied or employee not found',
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

    // Scope validation
    const allowedEmployee = await Employee.findOne({
      ...req.scopeFilter,
      emp_no: employeeNumber.toUpperCase()
    });

    if (!allowedEmployee) {
      return res.status(403).json({
        success: false,
        message: 'Access denied or employee not found',
      });
    }

    const record = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    })
      .populate('shiftId', 'name startTime endTime duration gracePeriod')
      .populate('shifts.shiftId', 'name startTime endTime duration gracePeriod');

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
    const { date, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get paginated employees within scope
    const employees = await Employee.find({
      ...req.scopeFilter,
      is_active: { $ne: false }
    })
      .select('emp_no employee_name department_id designation_id')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .sort({ emp_no: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Employee.countDocuments({
      ...req.scopeFilter,
      is_active: { $ne: false }
    });

    // If date provided, get attendance for that date for these SPECIFIC employees
    let attendanceMap = {};
    if (date) {
      const empNos = employees.map(e => e.emp_no);
      const records = await AttendanceDaily.find({
        date,
        employeeNumber: { $in: empNos }
      });
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
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
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
    const { year, month, page = 1, limit = 20, search, divisionId, departmentId, designationId } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required',
      });
    }

    // Build filter based on scope and provided filters
    const filter = { ...req.scopeFilter, is_active: { $ne: false } };

    if (search) {
      filter.$or = [
        { employee_name: { $regex: search, $options: 'i' } },
        { emp_no: { $regex: search, $options: 'i' } }
      ];
    }

    if (divisionId) filter.division_id = divisionId;
    if (departmentId) filter.department_id = departmentId;
    if (designationId) filter.designation_id = designationId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get paginated active employees
    const employees = await Employee.find(filter)
      .populate('division_id', 'name')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .sort({ employee_name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalEmployees = await Employee.countDocuments(filter);

    const { getMonthlyTableViewData } = require('../services/attendanceViewService');
    const employeesWithAttendance = await getMonthlyTableViewData(employees, year, month);

    res.status(200).json({
      success: true,
      data: employeesWithAttendance,
      pagination: {
        total: totalEmployees,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalEmployees / parseInt(limit))
      },
      month: parseInt(month),
      year: parseInt(year),
      daysInMonth: new Date(parseInt(year), parseInt(month), 0).getDate(),
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

    // Fetch global general settings
    const generalConfig = await Settings.getSettingsByCategory('general');

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
    }).populate('shiftId').populate('shifts.shiftId');

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

    console.log(`[DEBUG] UpdateOutTime called for ${employeeNumber} on ${date}`);
    console.log(`[DEBUG] OutTime provided: ${outTime}`);

    // Ensure outTime is a Date object
    let outTimeDate = outTime instanceof Date ? outTime : new Date(outTime);
    console.log(`[DEBUG] Parsed OutTimeDate: ${outTimeDate.toISOString()}`);

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
    console.log(`[DEBUG] isOvernightShift: ${isOvernightShift}`);

    // If shift is overnight or out-time is earlier than in-time and on same date, it's next day
    if (isOvernightShift || (outTimeOnly < inTimeOnly && outTimeDateStr === inTimeDateStr)) {
      // For overnight shifts, out-time on the next day is expected
      // Ensure out-time date is set correctly
      if (!isOvernightShift && outTimeDateStr === inTimeDateStr) {
        // Same date but out-time earlier - must be next day
        outTimeDate = new Date(outTimeDate);
        outTimeDate.setDate(outTimeDate.getDate() + 1);
        console.log(`[DEBUG] Adjusted OutTime to Next Day: ${outTimeDate.toISOString()}`);
      }
      // For overnight shifts, the out-time date might already be correct, just ensure it's preserved
    }

    // Status will be automatically updated by the AttendanceDaily pre-save hook 
    // based on total hours, OD hours and shift duration (70% threshold)

    const { shiftRecordId } = req.body;
    console.log(`[DEBUG] shiftRecordId: ${shiftRecordId}`);

    if (shiftRecordId) {
      // GRADULAR UPDATE MODE
      const shiftSegment = attendanceRecord.shifts.id(shiftRecordId);
      if (!shiftSegment) {
        console.error(`[DEBUG] Shift Segment NOT FOUND for ID: ${shiftRecordId}`);
        return res.status(404).json({
          success: false,
          message: 'Shift segment not found',
        });
      }

      // Update outTime
      shiftSegment.outTime = outTimeDate;
      console.log(`[DEBUG] Segment OutTime Updated`);

      // Recalculate metrics for this segment if shift is assigned
      if (shiftSegment.shiftId) {
        // We likely need to fetch the shift details if not fully populated or if it returns just ID
        // The populate('shifts.shiftId') above should handle it if it's a ref.
        // But Mongoose sometimes returns just ID if populate fails or structure mismatch.
        let shiftDetails = shiftSegment.shiftId;
        // If it's just an ID or missing details, fetch it
        if (!shiftDetails.startTime) {
          console.log(`[DEBUG] Fetching Shift Details for ${shiftSegment.shiftId}`);
          shiftDetails = await Shift.findById(shiftSegment.shiftId).select('name startTime endTime duration gracePeriod payableShifts');
        }

        if (shiftDetails) {
          console.log(`[DEBUG] Shift Details: ${shiftDetails.name} (${shiftDetails.startTime}-${shiftDetails.endTime})`);
          const { calculateLateIn, calculateEarlyOut } = require('../../shifts/services/shiftDetectionService');
          const globalLateInGrace = generalConfig.late_in_grace_time ?? null;
          const globalEarlyOutGrace = generalConfig.early_out_grace_time ?? null;

          // 1. Recalculate Late In (using existing InTime)
          // Even if InTime didn't change, re-verifying ensures consistency
          if (shiftSegment.inTime) {
            const lateIn = calculateLateIn(
              shiftSegment.inTime,
              shiftDetails.startTime,
              shiftDetails.gracePeriod,
              date,
              globalLateInGrace
            );
            shiftSegment.lateInMinutes = lateIn > 0 ? lateIn : 0;
            shiftSegment.isLateIn = lateIn > 0;
          }

          // 2. Recalculate Early Out
          const earlyOutMinutes = calculateEarlyOut(
            shiftSegment.outTime,
            shiftDetails.endTime,
            shiftDetails.startTime,
            date, // Use the attendance date for reference
            globalEarlyOutGrace
          );

          shiftSegment.earlyOutMinutes = earlyOutMinutes > 0 ? earlyOutMinutes : 0;
          shiftSegment.isEarlyOut = earlyOutMinutes > 0;
          console.log(`[DEBUG] EarlyOut: ${earlyOutMinutes}`);

          // 3. Recalculate Extra Hours (Segment Specific)
          // Logic similar to extraHoursService but for this segment
          shiftSegment.extraHours = 0; // Reset first
          if (shiftSegment.outTime) {
            const [endH, endM] = shiftDetails.endTime.split(':').map(Number);
            const [startH, startM] = shiftDetails.startTime.split(':').map(Number);

            // Determine Shift End Date
            let shiftEndDate = new Date(date);
            shiftEndDate.setHours(endH, endM, 0, 0);

            // Handle overnight
            if ((endH * 60 + endM) < (startH * 60 + startM)) {
              shiftEndDate.setDate(shiftEndDate.getDate() + 1);
            }

            // Add Grace
            const grace = shiftDetails.gracePeriod || 15;
            shiftEndDate.setMinutes(shiftEndDate.getMinutes() + grace);

            if (shiftSegment.outTime > shiftEndDate) {
              const diffMs = shiftSegment.outTime - shiftEndDate;
              shiftSegment.extraHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
            }
          }
          console.log(`[DEBUG] ExtraHours: ${shiftSegment.extraHours}`);

          // 4. Recalculate Working Hours
          // Simple diff for now: out - in
          if (shiftSegment.inTime && shiftSegment.outTime) {
            const diffMs = shiftSegment.outTime - shiftSegment.inTime;
            const hours = diffMs / (1000 * 60 * 60);
            shiftSegment.punchHours = Math.round(hours * 100) / 100;

            shiftSegment.workingHours = Math.round(((shiftSegment.punchHours || 0) + (shiftSegment.odHours || 0)) * 100) / 100;
            console.log(`[DEBUG] Working Hours: ${shiftSegment.workingHours} (Diff: ${diffMs}ms)`);

            // Update Status and Payable Shift with DYNAMIC Logic
            let durationHours = shiftDetails.duration;
            // specific check if duration is in minutes (e.g. > 20)
            if (durationHours > 20) durationHours = durationHours / 60;

            // Get Base Payable
            // Check if shiftDetails has payableShifts, else default to 1.0
            // Note: populate might not return payableShifts if not selected. 
            // The previous populate just did name/times. We might need to refetch if missing.
            let basePayable = 1.0;
            if (shiftDetails.payableShifts !== undefined) {
              basePayable = shiftDetails.payableShifts;
            } else {
              // Try to fetch if missing from populated doc
              const fullShift = await Shift.findById(shiftDetails._id).select('payableShifts');
              if (fullShift && fullShift.payableShifts !== undefined) basePayable = fullShift.payableShifts;
            }

            if (shiftSegment.workingHours >= (durationHours * 0.8)) {
              shiftSegment.status = 'PRESENT';
              shiftSegment.payableShift = basePayable;
            } else if (shiftSegment.workingHours >= (durationHours * 0.35)) {
              shiftSegment.status = 'HALF_DAY';
              shiftSegment.payableShift = basePayable * 0.5;
            } else {
              shiftSegment.status = 'ABSENT';
              shiftSegment.payableShift = 0;
            }
            console.log(`[DEBUG] Status: ${shiftSegment.status}, Payable: ${shiftSegment.payableShift}`);
          }
        } else {
          console.warn(`[DEBUG] No Shift Details found for ${shiftSegment.shiftId}`);
        }

        // --- ADDED: Set Edited Flag & History ---
        attendanceRecord.isEdited = true;
        attendanceRecord.editHistory.push({
          action: 'OUT_TIME_UPDATE',
          modifiedBy: req.user._id,
          modifiedAt: new Date(),
          details: `Updated Out Time to ${outTimeDate.toLocaleTimeString()} for shift segment`
        });
        // ----------------------------------------

      }

      // Update aggregates
      if (attendanceRecord.shifts && attendanceRecord.shifts.length > 0) {
        attendanceRecord.totalWorkingHours = attendanceRecord.shifts.reduce((sum, s) => sum + (s.workingHours || 0), 0);
        const totalPayable = attendanceRecord.shifts.reduce((sum, s) => sum + (s.payableShift || 0), 0);
        attendanceRecord.payableShifts = totalPayable;
        attendanceRecord.extraHours = attendanceRecord.shifts.reduce((sum, s) => sum + (s.extraHours || 0), 0);

        console.log(`[DEBUG] Aggregates - Working: ${attendanceRecord.totalWorkingHours}, Payable: ${totalPayable}`);

        // Recalculate Overall Status
        const hasPresentShift = attendanceRecord.shifts.some(s => s.status === 'complete' || s.status === 'PRESENT' || (s.payableShift && s.payableShift >= 1));

        if (hasPresentShift || attendanceRecord.payableShifts >= 1) {
          attendanceRecord.status = 'PRESENT';
        } else if (attendanceRecord.shifts.length === 1 && (attendanceRecord.shifts[0].status === 'HALF_DAY' || attendanceRecord.shifts[0].payableShift === 0.5)) {
          attendanceRecord.status = 'HALF_DAY';
        } else {
          // Check if incomplete
          const hasIncomplete = attendanceRecord.shifts.some(s => !s.outTime);
          attendanceRecord.status = hasIncomplete ? 'PARTIAL' : 'ABSENT';
        }

        // UPDATE GLOBAL OUT TIME (Max of all shifts)
        let maxOut = null;
        attendanceRecord.shifts.forEach(s => {
          if (s.outTime) {
            if (!maxOut || s.outTime > maxOut) maxOut = s.outTime;
          }
        });
        attendanceRecord.outTime = maxOut;
      }

    } else {
      // LEGACY / GLOBAL MODE
      // Explicitly set Global Out Time here
      attendanceRecord.outTime = outTimeDate;

      // Re-run shift detection with new outTime
      const detectionResult = await detectAndAssignShift(
        employeeNumber.toUpperCase(),
        date,
        attendanceRecord.inTime,
        outTimeDate,
        generalConfig
      );

      if (detectionResult.success && detectionResult.assignedShift) {
        attendanceRecord.shiftId = detectionResult.assignedShift;
        attendanceRecord.lateInMinutes = detectionResult.lateInMinutes;
        attendanceRecord.earlyOutMinutes = detectionResult.earlyOutMinutes;
        attendanceRecord.isLateIn = detectionResult.isLateIn || false;
        attendanceRecord.isEarlyOut = detectionResult.isEarlyOut || false;
        attendanceRecord.expectedHours = detectionResult.expectedHours;

        // CRITICAL FIX: Sync 'shifts' array if it exists to prevent Pre-Save Hook reversion
        // If we represent this as a single global shift now, update the shifts array to match
        if (attendanceRecord.shifts && attendanceRecord.shifts.length > 0) {
          // If multiple shifts existed, this "Global Edit" effectively merges them or updates the primary one.
          // Best approach: Reset to a single shift segment representing this global state.

          // Calculate working hours
          let workingHours = 0;
          if (attendanceRecord.inTime && outTimeDate) {
            const diffMs = outTimeDate - attendanceRecord.inTime;
            // Handle overnight/next day logic for diff if needed, but Dates usually absolute
            workingHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
          }

          // Determine Status/Payable matching the global detection
          let status = 'ABSENT';
          let payableShift = 0;

          // Get shift details (detectionResult usually has name/times, we might need payableShifts)
          const assignedShiftDoc = await Shift.findById(detectionResult.assignedShift).select('payableShifts duration');
          let basePayable = assignedShiftDoc ? (assignedShiftDoc.payableShifts ?? 1) : 1;

          if (workingHours >= (detectionResult.expectedHours * 0.8)) {
            status = 'PRESENT';
            payableShift = basePayable;
          } else if (workingHours >= (detectionResult.expectedHours * 0.35)) {
            status = 'HALF_DAY';
            payableShift = basePayable * 0.5;
          }

          attendanceRecord.shifts = [{
            shiftNumber: 1,
            inTime: attendanceRecord.inTime,
            outTime: outTimeDate,
            shiftId: detectionResult.assignedShift,
            shiftName: detectionResult.shiftName,
            shiftStartTime: detectionResult.shiftStartTime,
            shiftEndTime: detectionResult.shiftEndTime,
            duration: detectionResult.expectedHours * 60,
            workingHours: workingHours,
            punchHours: workingHours,
            status: status,
            payableShift: payableShift,
            lateInMinutes: detectionResult.lateInMinutes,
            earlyOutMinutes: detectionResult.earlyOutMinutes,
            isLateIn: detectionResult.isLateIn,
            isEarlyOut: detectionResult.isEarlyOut
          }];

          attendanceRecord.totalShifts = 1;
          attendanceRecord.payableShifts = payableShift;
        }

        // Update roster tracking if rosterRecordId exists
        if (detectionResult.rosterRecordId) {
          await PreScheduledShift.findByIdAndUpdate(detectionResult.rosterRecordId, {
            attendanceDailyId: attendanceRecord._id
          });
        }

        // Check and resolve ConfusedShift if exists (MOVED INSIDE ELSE)
        const ConfusedShift = require('../../shifts/model/ConfusedShift');
        const confusedShift = await ConfusedShift.findOne({
          employeeNumber: employeeNumber.toUpperCase(),
          date: date,
          status: 'pending',
        });

        if (confusedShift) {
          // Resolve ConfusedShift
          confusedShift.status = 'resolved';
          confusedShift.assignedShiftId = detectionResult.assignedShift;
          confusedShift.reviewedBy = req.user?.userId || req.user?._id;
          confusedShift.reviewedAt = new Date();
          await confusedShift.save();
        }
      }
    }

    // If out-time is on next day (for overnight shifts), ensure it's stored with correct date
    // The attendance record date should remain as the shift date (in-time date)
    // But out-time can be on the next day

    // Track Edit History
    attendanceRecord.isEdited = true;
    attendanceRecord.editHistory.push({
      action: 'OUT_TIME_UPDATE',
      modifiedBy: req.user?._id || req.user?.userId, // Handle different user object structures
      modifiedAt: new Date(),
      details: req.body.shiftRecordId
        ? `Updated OutTime for specific shift segment`
        : `Updated OutTime to ${outTimeDate.toLocaleTimeString()}`
    });

    // Ensure shifts array changes are detected
    attendanceRecord.markModified('shifts');

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
    }).populate('shiftId').populate('shifts.shiftId');

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

    // Verify shift exists (need payableShifts for daily payable recalc)
    const shift = await Shift.findById(shiftId).select('name startTime endTime duration gracePeriod payableShifts');
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

    const { shiftRecordId } = req.body;

    if (shiftRecordId) {
      // GRANULAR UPDATE MODE
      const shiftSegment = attendanceRecord.shifts.id(shiftRecordId);
      if (!shiftSegment) {
        return res.status(404).json({
          success: false,
          message: 'Shift segment not found',
        });
      }

      shiftSegment.shiftId = shiftId;

      // Recalculate metrics for this segment
      // We need new shift details
      // shift variable is already fetched above (Verify shift exists)

      const { calculateLateIn, calculateEarlyOut } = require('../../shifts/services/shiftDetectionService');
      const generalConfig = await Settings.getSettingsByCategory('general');
      const globalLateInGrace = generalConfig.late_in_grace_time ?? null;
      const globalEarlyOutGrace = generalConfig.early_out_grace_time ?? null;

      // Recalculate Late In
      if (shiftSegment.inTime) {
        const lateIn = calculateLateIn(shiftSegment.inTime, shift.startTime, shift.gracePeriod || 15, date, globalLateInGrace);
        shiftSegment.lateInMinutes = lateIn > 0 ? lateIn : 0;
        shiftSegment.isLateIn = lateIn > 0;
      }

      // Recalculate Early Out
      if (shiftSegment.outTime) {
        const earlyOut = calculateEarlyOut(shiftSegment.outTime, shift.endTime, shift.startTime, date, globalEarlyOutGrace);
        shiftSegment.earlyOutMinutes = earlyOut > 0 ? earlyOut : 0;
        shiftSegment.isEarlyOut = earlyOut > 0;
      }

      // Update Expected Hours for this segment?
      // AttendanceDaily doesn't have expectedHours per segment explicitly in provided schema snippet, 
      // but let's check legacy fields. The sub-schema usually mirrors needed fields.
      // Assuming we rely on the shiftId ref for expected duration.

      // Update Status and Payable Shift from NEW shift (so daily + monthly summary stay correct)
      let durationHours = shift.duration;
      if (durationHours > 20) durationHours = durationHours / 60; // if stored as minutes
      const basePayable = shift.payableShifts !== undefined ? shift.payableShifts : 1;
      const workingH = shiftSegment.workingHours || 0;

      if (workingH >= (durationHours * 0.9)) {
        shiftSegment.status = 'PRESENT';
        shiftSegment.payableShift = basePayable;
      } else if (workingH >= (durationHours * 0.45)) {
        shiftSegment.status = 'HALF_DAY';
        shiftSegment.payableShift = basePayable * 0.5;
      } else {
        shiftSegment.status = 'ABSENT';
        shiftSegment.payableShift = 0;
      }

      // Recalc day total payable shifts (cumulative of all segments)
      const totalPayable = attendanceRecord.shifts.reduce((sum, s) => sum + (s.payableShift || 0), 0);
      attendanceRecord.payableShifts = Math.round(totalPayable * 100) / 100;

      // Track Edit History
      attendanceRecord.isEdited = true;
      attendanceRecord.editHistory.push({
        action: 'SHIFT_CHANGE',
        modifiedBy: req.user?._id || req.user?.userId,
        modifiedAt: new Date(),
        details: `Changed shift for segment to ${shift.name}`
      });

      await attendanceRecord.save();

    } else {
      // LEGACY / GLOBAL MODE

      // Calculate late-in and early-out with the assigned shift
      const { calculateLateIn, calculateEarlyOut } = require('../../shifts/services/shiftDetectionService');
      // Fetch global general settings
      const generalConfig = await Settings.getSettingsByCategory('general');
      const globalLateInGrace = generalConfig.late_in_grace_time ?? null;
      const globalEarlyOutGrace = generalConfig.early_out_grace_time ?? null;

      // Pass the date parameter for proper overnight shift handling
      const lateInMinutes = calculateLateIn(attendanceRecord.inTime, shift.startTime, shift.gracePeriod || 15, date, globalLateInGrace);
      const earlyOutMinutes = attendanceRecord.outTime
        ? calculateEarlyOut(attendanceRecord.outTime, shift.endTime, shift.startTime, date, globalEarlyOutGrace)
        : null;

      // Update attendance record
      attendanceRecord.shiftId = shiftId;
      attendanceRecord.lateInMinutes = lateInMinutes > 0 ? lateInMinutes : null;
      attendanceRecord.earlyOutMinutes = earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null;
      attendanceRecord.isLateIn = lateInMinutes > 0;
      attendanceRecord.isEarlyOut = earlyOutMinutes && earlyOutMinutes > 0;
      attendanceRecord.expectedHours = shift.duration;

      // Recalc payable shifts from new shift (so daily + monthly summary stay correct)
      let durationHours = shift.duration;
      if (durationHours > 20) durationHours = durationHours / 60;
      const basePayable = shift.payableShifts !== undefined ? shift.payableShifts : 1;
      const effectiveHours = (attendanceRecord.totalHours || 0) + (attendanceRecord.odHours || 0);
      if (effectiveHours >= (durationHours * 0.9)) {
        attendanceRecord.payableShifts = basePayable;
      } else if (effectiveHours >= (durationHours * 0.45)) {
        attendanceRecord.payableShifts = basePayable * 0.5;
      } else {
        attendanceRecord.payableShifts = 0;
      }

      attendanceRecord.isEdited = true;
      attendanceRecord.editHistory.push({
        action: 'SHIFT_CHANGE',
        modifiedBy: req.user?._id || req.user?.userId,
        modifiedAt: new Date(),
        details: `Changed shift to ${shift.name}`
      });

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

/**
 * @desc    Get recent live activity feed for dashboard
 * @route   GET /api/attendance/activity/recent
 * @access  Private
 */
exports.getRecentActivity = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 1. Determine Scope & Filter
    let logQuery = {};

    // If we have a specific scope filter (Division/HR/HOD/Emp)
    if (req.scopeFilter && Object.keys(req.scopeFilter).length > 0) {
      // Find allowed Employee Numbers
      const allowedEmployees = await Employee.find(req.scopeFilter).select('emp_no').lean();
      const allowedEmpNos = allowedEmployees.map(e => e.emp_no);

      if (allowedEmpNos.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, totalPages: 0 }
        });
      }
      logQuery.employeeNumber = { $in: allowedEmpNos };
    }

    // 2. Fetch Recent Logs (Paginated)
    const rawLogs = await AttendanceRawLog.find(logQuery)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await AttendanceRawLog.countDocuments(logQuery);

    if (rawLogs.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    }

    // 3. Hydrate Data
    const uniqueEmpNos = [...new Set(rawLogs.map(l => l.employeeNumber))];

    const employeesInfo = await Employee.find({ emp_no: { $in: uniqueEmpNos } })
      .select('emp_no employee_name department_id designation_id')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .lean();

    const empMap = {};
    employeesInfo.forEach(e => { empMap[e.emp_no] = e; });

    const dailyMap = {};
    const relevantDates = [...new Set(rawLogs.map(l => ({ emp: l.employeeNumber, date: l.date })))];

    const dailyQuery = {
      $or: relevantDates.map(i => ({ employeeNumber: i.emp, date: i.date }))
    };

    if (relevantDates.length > 0) {
      const dailyRecords = await AttendanceDaily.find(dailyQuery)
        .select('employeeNumber date shiftId status')
        .populate('shiftId', 'name startTime endTime')
        .lean();

      dailyRecords.forEach(d => {
        dailyMap[`${d.employeeNumber}_${d.date}`] = d;
      });
    }

    // 4. Assemble Response
    const activityFeed = rawLogs.map(log => {
      const emp = empMap[log.employeeNumber] || {};
      const daily = dailyMap[`${log.employeeNumber}_${log.date}`] || {};
      const shift = daily.shiftId || {};

      return {
        _id: log._id,
        timestamp: log.timestamp,
        employee: {
          name: emp.employee_name || 'Unknown',
          number: log.employeeNumber,
          department: emp.department_id?.name || '-',
          designation: emp.designation_id?.name || '-'
        },
        punch: {
          type: log.type,
          subType: log.subType,
          device: log.deviceName || log.deviceId
        },
        shift: {
          name: shift.name || 'Detecting...',
          startTime: shift.startTime,
          endTime: shift.endTime
        },
        status: daily.status || 'PROCESSING'
      };
    });

    res.status(200).json({
      success: true,
      data: activityFeed,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity feed'
    });
  }
};
