/**
 * Confused Shift Controller
 * Handles confused shift records that require manual review
 */

const ConfusedShift = require('../model/ConfusedShift');
const { resolveConfusedShift, autoAssignNearestShift } = require('../services/shiftDetectionService');
const Employee = require('../../employees/model/Employee');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Shift = require('../model/Shift');

/**
 * @desc    Get all confused shifts
 * @route   GET /api/shifts/confused
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.getConfusedShifts = async (req, res) => {
  try {
    const { status, startDate, endDate, department, page = 1, limit = 50 } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    } else {
      // Default to pending if no status specified
      query.status = 'pending';
    }

    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    // Filter by department if provided
    if (department) {
      const employees = await Employee.find({ department_id: department }).select('emp_no');
      const empNumbers = employees.map(emp => String(emp.emp_no || '').toUpperCase());
      query.employeeNumber = { $in: empNumbers };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const confusedShifts = await ConfusedShift.find(query)
      .populate('assignedShiftId', 'name startTime endTime duration')
      .populate('reviewedBy', 'name email')
      .populate('possibleShifts.shiftId', 'name startTime endTime duration gracePeriod')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ConfusedShift.countDocuments(query);

    // For each confused shift, get all available shifts (not just possible ones)
    const confusedShiftsWithAllShifts = await Promise.all(
      confusedShifts.map(async (cs) => {
        const employee = await Employee.findOne({ emp_no: cs.employeeNumber })
          .populate('department_id', 'shifts')
          .populate('designation_id', 'shifts');

        let allShifts = [];

        if (employee) {
          // Get all shifts: designation -> department -> general
          if (employee.designation_id && employee.designation_id.shifts && employee.designation_id.shifts.length > 0) {
            const designationShifts = await Shift.find({
              _id: { $in: employee.designation_id.shifts },
              isActive: true,
            });
            allShifts = designationShifts;
          } else if (employee.department_id && employee.department_id.shifts && employee.department_id.shifts.length > 0) {
            const departmentShifts = await Shift.find({
              _id: { $in: employee.department_id.shifts },
              isActive: true,
            });
            allShifts = departmentShifts;
          } else {
            allShifts = await Shift.find({ isActive: true });
          }
        } else {
          allShifts = await Shift.find({ isActive: true });
        }

        return {
          ...cs.toObject(),
          allAvailableShifts: allShifts,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: confusedShiftsWithAllShifts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('Error fetching confused shifts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch confused shifts',
    });
  }
};

/**
 * @desc    Get single confused shift
 * @route   GET /api/shifts/confused/:id
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.getConfusedShift = async (req, res) => {
  try {
    const confusedShift = await ConfusedShift.findById(req.params.id)
      .populate('assignedShiftId', 'name startTime endTime duration')
      .populate('reviewedBy', 'name email')
      .populate('possibleShifts.shiftId', 'name startTime endTime duration gracePeriod');

    if (!confusedShift) {
      return res.status(404).json({
        success: false,
        message: 'Confused shift record not found',
      });
    }

    // Get employee details
    const employee = await Employee.findOne({ emp_no: confusedShift.employeeNumber })
      .populate('department_id', 'name shifts')
      .populate('designation_id', 'name shifts');

    // Get all available shifts for this employee
    let allShifts = [];
    if (employee) {
      if (employee.designation_id && employee.designation_id.shifts && employee.designation_id.shifts.length > 0) {
        allShifts = await Shift.find({
          _id: { $in: employee.designation_id.shifts },
          isActive: true,
        });
      } else if (employee.department_id && employee.department_id.shifts && employee.department_id.shifts.length > 0) {
        allShifts = await Shift.find({
          _id: { $in: employee.department_id.shifts },
          isActive: true,
        });
      } else {
        allShifts = await Shift.find({ isActive: true });
      }
    } else {
      allShifts = await Shift.find({ isActive: true });
    }

    res.status(200).json({
      success: true,
      data: {
        ...confusedShift.toObject(),
        employee: employee ? {
          emp_no: employee.emp_no,
          employee_name: employee.employee_name,
          department: employee.department_id,
          designation: employee.designation_id,
        } : null,
        allAvailableShifts: allShifts,
      },
    });

  } catch (error) {
    console.error('Error fetching confused shift:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch confused shift',
    });
  }
};

/**
 * @desc    Resolve confused shift (assign shift manually)
 * @route   PUT /api/shifts/confused/:id/resolve
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.resolveConfusedShift = async (req, res) => {
  try {
    const { shiftId, comments } = req.body;

    if (!shiftId) {
      return res.status(400).json({
        success: false,
        message: 'Shift ID is required',
      });
    }

    const result = await resolveConfusedShift(
      req.params.id,
      shiftId,
      req.user._id,
      comments
    );

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
      });
    }

  } catch (error) {
    console.error('Error resolving confused shift:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to resolve confused shift',
    });
  }
};

/**
 * @desc    Auto-assign nearest shift to all pending confused shifts
 * @route   PUT /api/shifts/confused/auto-assign-all
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.autoAssignAllConfusedShifts = async (req, res) => {
  try {
    // Get all pending confused shifts
    const confusedShifts = await ConfusedShift.find({ status: 'pending' });

    const stats = {
      processed: 0,
      assigned: 0,
      failed: 0,
      errors: [],
    };

    for (const confusedShift of confusedShifts) {
      try {
        stats.processed++;

        // Auto-assign nearest shift based on in-time
        const result = await autoAssignNearestShift(
          confusedShift.employeeNumber,
          confusedShift.date,
          confusedShift.inTime,
          confusedShift.outTime || null
        );

        if (result.success && result.assignedShift) {
          // Update confused shift record
          confusedShift.assignedShiftId = result.assignedShift;
          confusedShift.status = 'resolved';
          confusedShift.reviewedBy = req.user._id;
          confusedShift.reviewedAt = new Date();
          confusedShift.reviewComments = `Auto-assigned: Nearest shift based on in-time (difference: ${result.differenceMinutes} minutes)`;

          await confusedShift.save();

          // Update attendance record
          const attendanceRecord = await AttendanceDaily.findOne({
            employeeNumber: confusedShift.employeeNumber,
            date: confusedShift.date,
          });

          if (attendanceRecord) {
            // Update attendance record - USE SHIFTS ARRAY
            if (!attendanceRecord.shifts) attendanceRecord.shifts = [];

            let targetShift = null;
            if (attendanceRecord.shifts.length > 0) {
              // Find matching shift by inTime (1 min tolerance)
              targetShift = attendanceRecord.shifts.find(s => {
                const sTime = new Date(s.inTime).getTime();
                const cTime = new Date(confusedShift.inTime).getTime();
                return Math.abs(sTime - cTime) < 60000;
              });
            }

            if (!targetShift) {
              targetShift = {
                shiftNumber: attendanceRecord.shifts.length + 1,
                inTime: attendanceRecord.inTime || confusedShift.inTime,
                outTime: confusedShift.outTime
              };
              attendanceRecord.shifts.push(targetShift);
            }

            targetShift.shiftId = result.assignedShift;
            targetShift.shiftName = result.shiftName;

            // Limit fetch if needed, but existing logic needs improvement.
            // Let's assume result has details if updated service returns them.
            // The service returns: assignedShift, shiftName, shiftStartTime, shiftEndTime

            targetShift.shiftStartTime = result.shiftStartTime; // Service returns this? Yes
            targetShift.shiftEndTime = result.shiftEndTime;     // Service returns this? Yes

            // If service doesn't return duration, we might miss it.
            // But let's rely on expectedHours from serviceResult

            targetShift.lateInMinutes = result.lateInMinutes;
            targetShift.earlyOutMinutes = result.earlyOutMinutes;
            targetShift.isLateIn = result.isLateIn || false;
            targetShift.isEarlyOut = result.isEarlyOut || false;
            targetShift.expectedHours = result.expectedHours;
            targetShift.status = (targetShift.outTime) ? 'complete' : 'incomplete';

            // Update status if needed
            if (!attendanceRecord.status || attendanceRecord.status === 'ABSENT') {
              attendanceRecord.status = 'PRESENT';
            }

            await attendanceRecord.save();
          }

          stats.assigned++;
        } else {
          stats.failed++;
          stats.errors.push(`${confusedShift.employeeNumber} on ${confusedShift.date}: ${result.message || 'Failed to assign'}`);
        }

      } catch (error) {
        stats.failed++;
        stats.errors.push(`${confusedShift.employeeNumber} on ${confusedShift.date}: ${error.message}`);
        console.error(`Error auto-assigning confused shift ${confusedShift._id}:`, error);
      }
    }

    res.status(200).json({
      success: true,
      message: `Processed ${stats.processed} records: ${stats.assigned} assigned, ${stats.failed} failed`,
      data: stats,
    });

  } catch (error) {
    console.error('Error auto-assigning all confused shifts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to auto-assign shifts',
    });
  }
};

/**
 * @desc    Auto-assign nearest shift to confused shift
 * @route   PUT /api/shifts/confused/:id/auto-assign
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.autoAssignConfusedShift = async (req, res) => {
  try {
    const confusedShift = await ConfusedShift.findById(req.params.id);
    if (!confusedShift) {
      return res.status(404).json({
        success: false,
        message: 'Confused shift record not found',
      });
    }

    if (confusedShift.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This record has already been processed',
      });
    }

    // Auto-assign nearest shift based on in-time
    const result = await autoAssignNearestShift(
      confusedShift.employeeNumber,
      confusedShift.date,
      confusedShift.inTime,
      confusedShift.outTime || null
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message || 'Failed to auto-assign shift',
      });
    }

    // Update confused shift record
    confusedShift.assignedShiftId = result.assignedShift;
    confusedShift.status = 'resolved';
    confusedShift.reviewedBy = req.user._id;
    confusedShift.reviewedAt = new Date();
    confusedShift.reviewComments = `Auto-assigned: Nearest shift based on in-time (difference: ${result.differenceMinutes} minutes)`;

    await confusedShift.save();

    // Update attendance record
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: confusedShift.employeeNumber,
      date: confusedShift.date,
    });

    if (attendanceRecord) {
      // Update attendance record - USE SHIFTS ARRAY
      if (!attendanceRecord.shifts) attendanceRecord.shifts = [];

      let targetShift = null;
      if (attendanceRecord.shifts.length > 0) {
        // Find matching shift by inTime (1 min tolerance)
        targetShift = attendanceRecord.shifts.find(s => {
          const sTime = new Date(s.inTime).getTime();
          const cTime = new Date(confusedShift.inTime).getTime();
          return Math.abs(sTime - cTime) < 60000;
        });
      }

      if (!targetShift) {
        targetShift = {
          shiftNumber: attendanceRecord.shifts.length + 1,
          inTime: attendanceRecord.inTime || confusedShift.inTime,
          outTime: confusedShift.outTime
        };
        attendanceRecord.shifts.push(targetShift);
      }

      // We can rely on result properties if updated in autoAssignNearestShift return
      targetShift.shiftId = result.assignedShift;
      targetShift.shiftName = result.shiftName;
      targetShift.shiftStartTime = result.shiftStartTime;
      targetShift.shiftEndTime = result.shiftEndTime;

      // If missing from result, fetch?
      // Assuming autoAssignNearestShift returns basic info now or we accept previous logic.
      // The previous block had explicit fetch. Let's keep it if we want to be safe, or optimize.
      // Since result comes from `autoAssignNearestShift` in `shiftDetectionService`...
      // Looking at `shiftDetectionService.js`: it returns `shiftName`, `shiftStartTime`, `shiftEndTime`.
      // So no need to fetch again!

      targetShift.lateInMinutes = result.lateInMinutes;
      targetShift.earlyOutMinutes = result.earlyOutMinutes;
      targetShift.isLateIn = result.isLateIn || false;
      targetShift.isEarlyOut = result.isEarlyOut || false;
      targetShift.expectedHours = result.expectedHours;
      targetShift.status = (targetShift.outTime) ? 'complete' : 'incomplete';

      if (!attendanceRecord.status || attendanceRecord.status === 'ABSENT') {
        attendanceRecord.status = 'PRESENT';
      }

      await attendanceRecord.save();
    }

    // Populate shift details for response
    await confusedShift.populate('assignedShiftId', 'name startTime endTime duration');

    res.status(200).json({
      success: true,
      message: 'Shift auto-assigned successfully',
      data: confusedShift,
    });

  } catch (error) {
    console.error('Error auto-assigning confused shift:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to auto-assign shift',
    });
  }
};

/**
 * @desc    Dismiss confused shift (mark as dismissed, no shift assigned)
 * @route   PUT /api/shifts/confused/:id/dismiss
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.dismissConfusedShift = async (req, res) => {
  try {
    const { comments } = req.body;

    const confusedShift = await ConfusedShift.findById(req.params.id);

    if (!confusedShift) {
      return res.status(404).json({
        success: false,
        message: 'Confused shift record not found',
      });
    }

    if (confusedShift.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This record has already been processed',
      });
    }

    confusedShift.status = 'dismissed';
    confusedShift.reviewedBy = req.user._id;
    confusedShift.reviewedAt = new Date();
    confusedShift.reviewComments = comments || null;

    await confusedShift.save();

    res.status(200).json({
      success: true,
      message: 'Confused shift dismissed',
      data: confusedShift,
    });

  } catch (error) {
    console.error('Error dismissing confused shift:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to dismiss confused shift',
    });
  }
};

/**
 * @desc    Get confused shift statistics
 * @route   GET /api/shifts/confused/stats
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.getConfusedShiftStats = async (req, res) => {
  try {
    const pending = await ConfusedShift.countDocuments({ status: 'pending' });
    const resolved = await ConfusedShift.countDocuments({ status: 'resolved' });
    const dismissed = await ConfusedShift.countDocuments({ status: 'dismissed' });

    res.status(200).json({
      success: true,
      data: {
        pending,
        resolved,
        dismissed,
        total: pending + resolved + dismissed,
      },
    });

  } catch (error) {
    console.error('Error fetching confused shift stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch statistics',
    });
  }
};

