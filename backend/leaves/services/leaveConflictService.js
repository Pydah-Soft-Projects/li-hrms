/**
 * Leave Conflict Resolution Service
 * Handles conflicts between approved leaves and attendance logs
 */

const Leave = require('../model/Leave');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const { recalculateOnAttendanceUpdate } = require('../../attendance/services/summaryCalculationService');

/**
 * Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Check if a date falls within a date range
 */
const isDateInRange = (date, startDate, endDate) => {
  const checkDate = new Date(date);
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  checkDate.setHours(0, 0, 0, 0);
  
  return checkDate >= start && checkDate <= end;
};

/**
 * Determine which half of the day was worked based on attendance timing
 * @param {Date} inTime - In-time
 * @param {Date} outTime - Out-time (optional)
 * @param {Object} shift - Shift object with startTime and endTime
 * @returns {String} 'first_half' or 'second_half'
 */
const determineWorkedHalf = (inTime, outTime, shift) => {
  if (!shift || !shift.startTime || !shift.endTime) {
    // Default: if no out-time, assume second half worked
    return outTime ? 'first_half' : 'second_half';
  }

  const inMinutes = inTime.getHours() * 60 + inTime.getMinutes();
  const [shiftStartHour, shiftStartMin] = shift.startTime.split(':').map(Number);
  const [shiftEndHour, shiftEndMin] = shift.endTime.split(':').map(Number);
  
  const shiftStartMinutes = shiftStartHour * 60 + shiftStartMin;
  const shiftEndMinutes = shiftEndHour * 60 + shiftEndMin;
  
  // Calculate mid-shift point
  let shiftDurationMinutes;
  if (shiftEndMinutes < shiftStartMinutes) {
    // Overnight shift
    shiftDurationMinutes = (24 * 60 - shiftStartMinutes) + shiftEndMinutes;
  } else {
    shiftDurationMinutes = shiftEndMinutes - shiftStartMinutes;
  }
  
  const midShiftMinutes = shiftStartMinutes + (shiftDurationMinutes / 2);
  
  // If worked before mid-shift, second half was taken as leave
  // If worked after mid-shift, first half was taken as leave
  if (inMinutes < midShiftMinutes) {
    return 'second_half'; // Worked first half
  } else {
    return 'first_half'; // Worked second half
  }
};

/**
 * Check if attendance represents a half-day work
 * @param {Object} attendance - Attendance record
 * @param {Object} shift - Shift object
 * @returns {Boolean}
 */
const isHalfDayWork = (attendance, shift) => {
  if (!attendance.inTime) return false;
  
  // If no out-time, consider it half-day
  if (!attendance.outTime) return true;
  
  // If shift not available, use total hours
  if (!shift || !shift.duration) {
    // Consider less than 6 hours as half-day
    if (attendance.totalHours && attendance.totalHours < 6) {
      return true;
    }
    return false;
  }
  
  // Compare worked hours with expected hours
  const workedHours = attendance.totalHours || 0;
  const expectedHours = shift.duration || 8;
  
  // If worked less than 60% of expected hours, consider it half-day
  return workedHours < (expectedHours * 0.6);
};

/**
 * Revoke a full-day leave when attendance is logged
 * @param {String} leaveId - Leave ID
 * @param {String} userId - User ID who is revoking
 * @param {String} userName - User name
 * @param {String} userRole - User role
 * @returns {Object} Result
 */
const revokeFullDayLeave = async (leaveId, userId, userName, userRole) => {
  try {
    const leave = await Leave.findById(leaveId);
    
    if (!leave) {
      return {
        success: false,
        message: 'Leave not found',
      };
    }

    // Update leave status to pending
    leave.status = 'pending';
    
    // Add workflow history
    leave.workflow.history.push({
      step: leave.workflow.currentStep,
      action: 'revoked',
      actionBy: userId,
      actionByName: userName,
      actionByRole: userRole,
      comments: 'Leave revoked due to attendance logged',
      timestamp: new Date(),
    });

    await leave.save();

    // Recalculate monthly summary for affected months
    const fromDate = new Date(leave.fromDate);
    const toDate = new Date(leave.toDate);
    
    // Recalculate for each date in the leave range
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDate(d);
      await recalculateOnAttendanceUpdate(leave.emp_no, dateStr);
    }

    return {
      success: true,
      message: 'Leave revoked successfully',
      leave: leave,
    };

  } catch (error) {
    console.error('Error revoking leave:', error);
    return {
      success: false,
      message: error.message || 'Failed to revoke leave',
    };
  }
};

/**
 * Update multi-day leave when employee attends on leave days
 * @param {String} leaveId - Leave ID
 * @param {String} attendanceDate - Date of attendance (YYYY-MM-DD)
 * @param {Object} attendance - Attendance record
 * @param {String} userId - User ID
 * @param {String} userName - User name
 * @param {String} userRole - User role
 * @returns {Object} Result
 */
const updateLeaveForAttendance = async (leaveId, attendanceDate, attendance, userId, userName, userRole) => {
  try {
    const leave = await Leave.findById(leaveId).populate('employeeId');
    
    if (!leave) {
      return {
        success: false,
        message: 'Leave not found',
      };
    }

    const attDate = new Date(attendanceDate);
    const leaveStart = new Date(leave.fromDate);
    const leaveEnd = new Date(leave.toDate);

    // Normalize dates for comparison
    leaveStart.setHours(0, 0, 0, 0);
    leaveEnd.setHours(23, 59, 59, 999);
    attDate.setHours(0, 0, 0, 0);

    // Get shift for half-day determination
    let shift = null;
    if (attendance.shiftId) {
      shift = await Shift.findById(attendance.shiftId);
    }

    const isHalfDay = isHalfDayWork(attendance, shift);
    const isFirstDay = formatDate(attDate) === formatDate(leaveStart);
    const isLastDay = formatDate(attDate) === formatDate(leaveEnd);
    const isMiddleDay = !isFirstDay && !isLastDay && attDate > leaveStart && attDate < leaveEnd;

    const results = {
      success: true,
      updatedLeaves: [],
      createdLeaves: [],
      deletedLeaveId: leaveId,
    };

    // Case 1: Single day leave with full-day attendance
    if (formatDate(leaveStart) === formatDate(leaveEnd) && !isHalfDay) {
      // Delete the leave entirely
      await Leave.findByIdAndDelete(leaveId);
      
      // Recalculate monthly summary
      await recalculateOnAttendanceUpdate(leave.emp_no, attendanceDate);

      return {
        ...results,
        message: 'Single day leave removed as employee attended full day',
      };
    }

    // Case 2: Single day leave with half-day attendance
    if (formatDate(leaveStart) === formatDate(leaveEnd) && isHalfDay) {
      // Update leave to half-day
      const workedHalf = determineWorkedHalf(attendance.inTime, attendance.outTime, shift);
      leave.halfDayType = workedHalf;
      leave.isHalfDay = true;
      leave.numberOfDays = 0.5;

      leave.workflow.history.push({
        step: leave.workflow.currentStep,
        action: 'status_changed',
        actionBy: userId,
        actionByName: userName,
        actionByRole: userRole,
        comments: `Leave updated to half-day (${workedHalf}) due to partial attendance`,
        timestamp: new Date(),
      });

      await leave.save();
      results.updatedLeaves.push(leave);

      // Recalculate monthly summary
      await recalculateOnAttendanceUpdate(leave.emp_no, attendanceDate);

      return {
        ...results,
        message: 'Leave updated to half-day',
      };
    }

    // Case 3: Multi-day leave - Employee came on first day
    if (isFirstDay && !isMiddleDay) {
      if (isHalfDay) {
        // Create new half-day leave for the first day
        const workedHalf = determineWorkedHalf(attendance.inTime, attendance.outTime, shift);
        
        const halfDayLeave = new Leave({
          employeeId: leave.employeeId,
          emp_no: leave.emp_no,
          leaveType: leave.leaveType,
          fromDate: new Date(leaveStart),
          toDate: new Date(leaveStart),
          numberOfDays: 0.5,
          isHalfDay: true,
          halfDayType: workedHalf,
          purpose: leave.purpose,
          contactNumber: leave.contactNumber,
          emergencyContact: leave.emergencyContact,
          addressDuringLeave: leave.addressDuringLeave,
          status: 'approved', // Auto-approve as it's based on attendance
          workflow: {
            currentStep: 'completed',
            history: [{
              step: 'employee',
              action: 'submitted',
              actionBy: userId,
              actionByName: userName,
              actionByRole: userRole,
              comments: 'Auto-created based on partial attendance',
              timestamp: new Date(),
            }],
          },
          department: leave.department,
          designation: leave.designation,
        });

        await halfDayLeave.save();
        results.createdLeaves.push(halfDayLeave);

        // Update original leave - move start date forward
        leaveStart.setDate(leaveStart.getDate() + 1);
        leave.fromDate = new Date(leaveStart);
        
        // Recalculate number of days
        const daysDiff = Math.ceil((leaveEnd - leaveStart) / (1000 * 60 * 60 * 24)) + 1;
        leave.numberOfDays = Math.max(0.5, daysDiff);

        leave.workflow.history.push({
          step: leave.workflow.currentStep,
          action: 'status_changed',
          actionBy: userId,
          actionByName: userName,
          actionByRole: userRole,
          comments: `Start date moved forward due to partial attendance on first day`,
          timestamp: new Date(),
        });

        await leave.save();
        results.updatedLeaves.push(leave);

      } else {
        // Full day attendance - remove first day from leave
        leaveStart.setDate(leaveStart.getDate() + 1);
        leave.fromDate = new Date(leaveStart);
        
        // Recalculate number of days
        const daysDiff = Math.ceil((leaveEnd - leaveStart) / (1000 * 60 * 60 * 24)) + 1;
        leave.numberOfDays = Math.max(0.5, daysDiff);

        // If no days left, delete the leave
        if (leave.numberOfDays <= 0 || leaveStart > leaveEnd) {
          await Leave.findByIdAndDelete(leaveId);
          results.deletedLeaveId = leaveId;
        } else {
          leave.workflow.history.push({
            step: leave.workflow.currentStep,
            action: 'status_changed',
            actionBy: userId,
            actionByName: userName,
            actionByRole: userRole,
            comments: `Start date moved forward due to attendance on first day`,
            timestamp: new Date(),
          });

          await leave.save();
          results.updatedLeaves.push(leave);
        }
      }

      // Recalculate monthly summary
      await recalculateOnAttendanceUpdate(leave.emp_no, attendanceDate);

      return {
        ...results,
        message: isHalfDay 
          ? 'Half-day leave created for first day, original leave updated'
          : 'First day removed from leave',
      };
    }

    // Case 4: Multi-day leave - Employee came on last day
    if (isLastDay && !isMiddleDay) {
      if (isHalfDay) {
        // Create new half-day leave for the last day
        const workedHalf = determineWorkedHalf(attendance.inTime, attendance.outTime, shift);
        
        const halfDayLeave = new Leave({
          employeeId: leave.employeeId,
          emp_no: leave.emp_no,
          leaveType: leave.leaveType,
          fromDate: new Date(leaveEnd),
          toDate: new Date(leaveEnd),
          numberOfDays: 0.5,
          isHalfDay: true,
          halfDayType: workedHalf,
          purpose: leave.purpose,
          contactNumber: leave.contactNumber,
          emergencyContact: leave.emergencyContact,
          addressDuringLeave: leave.addressDuringLeave,
          status: 'approved',
          workflow: {
            currentStep: 'completed',
            history: [{
              step: 'employee',
              action: 'submitted',
              actionBy: userId,
              actionByName: userName,
              actionByRole: userRole,
              comments: 'Auto-created based on partial attendance',
              timestamp: new Date(),
            }],
          },
          department: leave.department,
          designation: leave.designation,
        });

        await halfDayLeave.save();
        results.createdLeaves.push(halfDayLeave);

        // Update original leave - move end date backward
        leaveEnd.setDate(leaveEnd.getDate() - 1);
        leave.toDate = new Date(leaveEnd);
        
        // Recalculate number of days
        const daysDiff = Math.ceil((leaveEnd - leaveStart) / (1000 * 60 * 60 * 24)) + 1;
        leave.numberOfDays = Math.max(0.5, daysDiff);

        // If no days left, delete the leave
        if (leave.numberOfDays <= 0 || leaveStart > leaveEnd) {
          await Leave.findByIdAndDelete(leaveId);
          results.deletedLeaveId = leaveId;
        } else {
          leave.workflow.history.push({
            step: leave.workflow.currentStep,
            action: 'status_changed',
            actionBy: userId,
            actionByName: userName,
            actionByRole: userRole,
            comments: `End date moved backward due to partial attendance on last day`,
            timestamp: new Date(),
          });

          await leave.save();
          results.updatedLeaves.push(leave);
        }

      } else {
        // Full day attendance - remove last day from leave
        leaveEnd.setDate(leaveEnd.getDate() - 1);
        leave.toDate = new Date(leaveEnd);
        
        // Recalculate number of days
        const daysDiff = Math.ceil((leaveEnd - leaveStart) / (1000 * 60 * 60 * 24)) + 1;
        leave.numberOfDays = Math.max(0.5, daysDiff);

        // If no days left, delete the leave
        if (leave.numberOfDays <= 0 || leaveStart > leaveEnd) {
          await Leave.findByIdAndDelete(leaveId);
          results.deletedLeaveId = leaveId;
        } else {
          leave.workflow.history.push({
            step: leave.workflow.currentStep,
            action: 'status_changed',
            actionBy: userId,
            actionByName: userName,
            actionByRole: userRole,
            comments: `End date moved backward due to attendance on last day`,
            timestamp: new Date(),
          });

          await leave.save();
          results.updatedLeaves.push(leave);
        }
      }

      // Recalculate monthly summary
      await recalculateOnAttendanceUpdate(leave.emp_no, attendanceDate);

      return {
        ...results,
        message: isHalfDay 
          ? 'Half-day leave created for last day, original leave updated'
          : 'Last day removed from leave',
      };
    }

    // Case 5: Multi-day leave - Employee came on middle day
    if (isMiddleDay) {
      if (isHalfDay) {
        // Create half-day leave for the middle day
        const workedHalf = determineWorkedHalf(attendance.inTime, attendance.outTime, shift);
        
        const halfDayLeave = new Leave({
          employeeId: leave.employeeId,
          emp_no: leave.emp_no,
          leaveType: leave.leaveType,
          fromDate: new Date(attDate),
          toDate: new Date(attDate),
          numberOfDays: 0.5,
          isHalfDay: true,
          halfDayType: workedHalf,
          purpose: leave.purpose,
          contactNumber: leave.contactNumber,
          emergencyContact: leave.emergencyContact,
          addressDuringLeave: leave.addressDuringLeave,
          status: 'approved',
          workflow: {
            currentStep: 'completed',
            history: [{
              step: 'employee',
              action: 'submitted',
              actionBy: userId,
              actionByName: userName,
              actionByRole: userRole,
              comments: 'Auto-created based on partial attendance',
              timestamp: new Date(),
            }],
          },
          department: leave.department,
          designation: leave.designation,
        });

        await halfDayLeave.save();
        results.createdLeaves.push(halfDayLeave);

        // Split original leave into two leaves
        // Leave 1: Before the attended day
        const leave1End = new Date(attDate);
        leave1End.setDate(leave1End.getDate() - 1);
        
        const daysBefore = Math.ceil((leave1End - leaveStart) / (1000 * 60 * 60 * 24)) + 1;
        
        if (daysBefore > 0) {
          const leave1 = new Leave({
            employeeId: leave.employeeId,
            emp_no: leave.emp_no,
            leaveType: leave.leaveType,
            fromDate: new Date(leaveStart),
            toDate: new Date(leave1End),
            numberOfDays: daysBefore,
            isHalfDay: false,
            halfDayType: null,
            purpose: leave.purpose,
            contactNumber: leave.contactNumber,
            emergencyContact: leave.emergencyContact,
            addressDuringLeave: leave.addressDuringLeave,
            status: leave.status,
            workflow: {
              currentStep: leave.workflow.currentStep,
              history: leave.workflow.history.concat([{
                step: leave.workflow.currentStep,
                action: 'status_changed',
                actionBy: userId,
                actionByName: userName,
                actionByRole: userRole,
                comments: 'Leave split due to partial attendance on middle day',
                timestamp: new Date(),
              }]),
            },
            department: leave.department,
            designation: leave.designation,
            approvals: leave.approvals,
          });

          await leave1.save();
          results.createdLeaves.push(leave1);
        }

        // Leave 2: After the attended day
        const leave2Start = new Date(attDate);
        leave2Start.setDate(leave2Start.getDate() + 1);
        
        const daysAfter = Math.ceil((leaveEnd - leave2Start) / (1000 * 60 * 60 * 24)) + 1;
        
        if (daysAfter > 0) {
          const leave2 = new Leave({
            employeeId: leave.employeeId,
            emp_no: leave.emp_no,
            leaveType: leave.leaveType,
            fromDate: new Date(leave2Start),
            toDate: new Date(leaveEnd),
            numberOfDays: daysAfter,
            isHalfDay: false,
            halfDayType: null,
            purpose: leave.purpose,
            contactNumber: leave.contactNumber,
            emergencyContact: leave.emergencyContact,
            addressDuringLeave: leave.addressDuringLeave,
            status: leave.status,
            workflow: {
              currentStep: leave.workflow.currentStep,
              history: leave.workflow.history.concat([{
                step: leave.workflow.currentStep,
                action: 'status_changed',
                actionBy: userId,
                actionByName: userName,
                actionByRole: userRole,
                comments: 'Leave split due to partial attendance on middle day',
                timestamp: new Date(),
              }]),
            },
            department: leave.department,
            designation: leave.designation,
            approvals: leave.approvals,
          });

          await leave2.save();
          results.createdLeaves.push(leave2);
        }

        // Delete original leave
        await Leave.findByIdAndDelete(leaveId);
        results.deletedLeaveId = leaveId;

      } else {
        // Full day attendance - split leave into two
        // Leave 1: Before the attended day
        const leave1End = new Date(attDate);
        leave1End.setDate(leave1End.getDate() - 1);
        
        const daysBefore = Math.ceil((leave1End - leaveStart) / (1000 * 60 * 60 * 24)) + 1;
        
        if (daysBefore > 0) {
          const leave1 = new Leave({
            employeeId: leave.employeeId,
            emp_no: leave.emp_no,
            leaveType: leave.leaveType,
            fromDate: new Date(leaveStart),
            toDate: new Date(leave1End),
            numberOfDays: daysBefore,
            isHalfDay: false,
            halfDayType: null,
            purpose: leave.purpose,
            contactNumber: leave.contactNumber,
            emergencyContact: leave.emergencyContact,
            addressDuringLeave: leave.addressDuringLeave,
            status: leave.status,
            workflow: {
              currentStep: leave.workflow.currentStep,
              history: leave.workflow.history.concat([{
                step: leave.workflow.currentStep,
                action: 'status_changed',
                actionBy: userId,
                actionByName: userName,
                actionByRole: userRole,
                comments: 'Leave split due to attendance on middle day',
                timestamp: new Date(),
              }]),
            },
            department: leave.department,
            designation: leave.designation,
            approvals: leave.approvals,
          });

          await leave1.save();
          results.createdLeaves.push(leave1);
        }

        // Leave 2: After the attended day
        const leave2Start = new Date(attDate);
        leave2Start.setDate(leave2Start.getDate() + 1);
        
        const daysAfter = Math.ceil((leaveEnd - leave2Start) / (1000 * 60 * 60 * 24)) + 1;
        
        if (daysAfter > 0) {
          const leave2 = new Leave({
            employeeId: leave.employeeId,
            emp_no: leave.emp_no,
            leaveType: leave.leaveType,
            fromDate: new Date(leave2Start),
            toDate: new Date(leaveEnd),
            numberOfDays: daysAfter,
            isHalfDay: false,
            halfDayType: null,
            purpose: leave.purpose,
            contactNumber: leave.contactNumber,
            emergencyContact: leave.emergencyContact,
            addressDuringLeave: leave.addressDuringLeave,
            status: leave.status,
            workflow: {
              currentStep: leave.workflow.currentStep,
              history: leave.workflow.history.concat([{
                step: leave.workflow.currentStep,
                action: 'status_changed',
                actionBy: userId,
                actionByName: userName,
                actionByRole: userRole,
                comments: 'Leave split due to attendance on middle day',
                timestamp: new Date(),
              }]),
            },
            department: leave.department,
            designation: leave.designation,
            approvals: leave.approvals,
          });

          await leave2.save();
          results.createdLeaves.push(leave2);
        }

        // Delete original leave
        await Leave.findByIdAndDelete(leaveId);
        results.deletedLeaveId = leaveId;
      }

      // Recalculate monthly summary
      await recalculateOnAttendanceUpdate(leave.emp_no, attendanceDate);

      return {
        ...results,
        message: isHalfDay 
          ? 'Half-day leave created, original leave split into two parts'
          : 'Leave split into two parts due to attendance on middle day',
      };
    }

    return {
      success: false,
      message: 'Could not determine leave update scenario',
    };

  } catch (error) {
    console.error('Error updating leave for attendance:', error);
    return {
      success: false,
      message: error.message || 'Failed to update leave',
    };
  }
};

/**
 * Get leave conflicts for an attendance date
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date (YYYY-MM-DD)
 * @returns {Object} Conflict information
 */
const getLeaveConflicts = async (employeeNumber, date) => {
  try {
    const attDate = new Date(date);
    const employee = await Employee.findOne({ emp_no: employeeNumber });

    if (!employee) {
      return {
        success: false,
        message: 'Employee not found',
      };
    }

    // Find leaves that overlap with this date
    const leaves = await Leave.find({
      emp_no: employeeNumber,
      status: { $in: ['approved', 'hod_approved', 'hr_approved'] },
      $or: [
        {
          fromDate: { $lte: attDate },
          toDate: { $gte: attDate },
        },
      ],
    }).sort({ fromDate: 1 });

    const conflicts = [];

    for (const leave of leaves) {
      const leaveStart = new Date(leave.fromDate);
      const leaveEnd = new Date(leave.toDate);
      const isSingleDay = formatDate(leaveStart) === formatDate(leaveEnd);
      const isHalfDay = leave.isHalfDay;

      // Determine conflict type
      let conflictType = 'full_day';
      if (isSingleDay && isHalfDay) {
        conflictType = 'half_day';
      } else if (!isSingleDay) {
        if (formatDate(attDate) === formatDate(leaveStart)) {
          conflictType = 'multi_day_first';
        } else if (formatDate(attDate) === formatDate(leaveEnd)) {
          conflictType = 'multi_day_last';
        } else {
          conflictType = 'multi_day_middle';
        }
      }

      conflicts.push({
        leaveId: leave._id,
        leaveType: leave.leaveType,
        fromDate: leave.fromDate,
        toDate: leave.toDate,
        isHalfDay: leave.isHalfDay,
        halfDayType: leave.halfDayType,
        numberOfDays: leave.numberOfDays,
        conflictType: conflictType,
        purpose: leave.purpose,
      });
    }

    return {
      success: true,
      conflicts: conflicts,
    };

  } catch (error) {
    console.error('Error getting leave conflicts:', error);
    return {
      success: false,
      message: error.message || 'Failed to get leave conflicts',
    };
  }
};

module.exports = {
  revokeFullDayLeave,
  updateLeaveForAttendance,
  getLeaveConflicts,
  isHalfDayWork,
  determineWorkedHalf,
};

