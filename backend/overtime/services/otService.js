/**
 * Overtime Service
 * Handles OT calculation, shift validation, and ConfusedShift resolution
 */

const OT = require('../model/OT');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const ConfusedShift = require('../../shifts/model/ConfusedShift');
const Shift = require('../../shifts/model/Shift');
const Employee = require('../../employees/model/Employee');
const { detectAndAssignShift } = require('../../shifts/services/shiftDetectionService');
const { calculateMonthlySummary } = require('../../attendance/services/summaryCalculationService');
const { validateOTRequest } = require('../../shared/services/conflictValidationService');
const OvertimeSettings = require('../model/OvertimeSettings');

/**
 * Create OT request
 * @param {Object} data - OT request data
 * @param {String} userId - User ID creating the request
 * @returns {Object} - Result
 */
const createOTRequest = async (data, userId) => {
  try {
    const {
      employeeId,
      employeeNumber,
      date,
      otOutTime,
      shiftId,
      manuallySelectedShiftId,
      comments,
      photoEvidence,
      geoLocation
    } = data;

    // Validate required fields
    if (!employeeId || !employeeNumber || !date || !otOutTime) {
      return {
        success: false,
        message: 'Employee, date, and OT out time are required',
      };
    }

    // Get employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return {
        success: false,
        message: 'Employee not found',
      };
    }

    // Validate OT request - check conflicts and attendance
    const validation = await validateOTRequest(employeeId, employeeNumber, date);
    if (!validation.isValid) {
      return {
        success: false,
        message: validation.errors.join('. '),
        validationErrors: validation.errors,
        hasLeave: !!validation.leave,
        hasOD: !!validation.od,
        hasAttendance: !!validation.attendance,
      };
    }

    // Get attendance record (already validated)
    const attendanceRecord = validation.attendance;

    // Get shift
    let shift = null;
    let finalShiftId = shiftId;

    // Check for ConfusedShift
    const confusedShift = await ConfusedShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      status: 'pending',
    });

    if (confusedShift) {
      // If ConfusedShift exists, shift selection is mandatory
      if (!manuallySelectedShiftId) {
        return {
          success: false,
          message: 'Shift selection is mandatory for ConfusedShift attendance',
          requiresShiftSelection: true,
          possibleShifts: confusedShift.possibleShifts || [],
        };
      }

      finalShiftId = manuallySelectedShiftId;
      shift = await Shift.findById(finalShiftId);

      if (!shift) {
        return {
          success: false,
          message: 'Selected shift not found',
        };
      }

      // Update ConfusedShift with selected shift
      confusedShift.selectedShiftId = finalShiftId;
      confusedShift.requiresManualSelection = false;
      await confusedShift.save();
    } else {
      // No ConfusedShift - use provided shiftId or attendance record's shiftId
      finalShiftId = shiftId || attendanceRecord.shiftId;

      if (!finalShiftId) {
        // Try to detect shift if not assigned
        const detectionResult = await detectAndAssignShift(
          employeeNumber,
          date,
          attendanceRecord.inTime,
          attendanceRecord.outTime || otOutTime
        );

        if (detectionResult.success && detectionResult.assignedShift) {
          finalShiftId = detectionResult.assignedShift;
          attendanceRecord.shiftId = finalShiftId;
          await attendanceRecord.save();
        } else {
          return {
            success: false,
            message: 'Shift not assigned and cannot be auto-detected. Please assign shift first.',
          };
        }
      }

      shift = await Shift.findById(finalShiftId);
      if (!shift) {
        return {
          success: false,
          message: 'Shift not found',
        };
      }
    }

    // Calculate OT In Time (shift end time on the date)
    const [shiftEndHour, shiftEndMin] = shift.endTime.split(':').map(Number);
    const otInTime = new Date(date);
    otInTime.setHours(shiftEndHour, shiftEndMin, 0, 0);

    // Ensure otOutTime is a Date object
    const otOutTimeDate = otOutTime instanceof Date ? otOutTime : new Date(otOutTime);

    // Validate OT out time is after OT in time
    if (otOutTimeDate <= otInTime) {
      return {
        success: false,
        message: 'OT out time must be after shift end time',
      };
    }

    // Calculate OT hours
    const diffMs = otOutTimeDate.getTime() - otInTime.getTime();
    const otHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

    // Check if OT already exists for this date
    const existingOT = await OT.findOne({
      employeeId: employeeId,
      date: date,
      status: { $in: ['pending', 'approved'] },
      isActive: true,
    });

    if (existingOT) {
      return {
        success: false,
        message: 'OT request already exists for this date',
        existingOT: existingOT,
      };
    }

    // --- Workflow Initialization ---
    const otSettings = await OvertimeSettings.getActiveSettings();
    const approvalSteps = [];

    // 1. Always start with HOD
    approvalSteps.push({
      stepOrder: 1,
      role: 'hod',
      label: 'HOD Approval',
      status: 'pending',
      isCurrent: true
    });

    // 2. Add other steps from settings
    if (otSettings?.workflow?.steps && otSettings.workflow.steps.length > 0) {
      otSettings.workflow.steps.forEach(step => {
        if (step.approverRole !== 'hod') {
          approvalSteps.push({
            stepOrder: approvalSteps.length + 1,
            role: step.approverRole,
            label: step.stepName || `${step.approverRole.toUpperCase()} Approval`,
            status: 'pending',
            isCurrent: false
          });
        }
      });
    }

    const workflowData = {
      currentStepRole: 'hod',
      nextApproverRole: 'hod',
      nextApprover: 'hod',
      approvalChain: approvalSteps,
      finalAuthority: otSettings?.workflow?.finalAuthority?.role || 'hr',
      history: [
        {
          step: 'employee',
          action: 'submitted',
          actionBy: userId,
          timestamp: new Date(),
          comments: 'OT request submitted'
        }
      ]
    };

    // Create OT request
    const otRequest = await OT.create({
      employeeId: employeeId,
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      attendanceRecordId: attendanceRecord._id,
      shiftId: finalShiftId,
      employeeInTime: attendanceRecord.inTime,
      shiftEndTime: shift.endTime,
      otInTime: otInTime,
      otOutTime: otOutTimeDate,
      otHours: otHours,
      status: 'pending',
      requestedBy: userId,
      confusedShiftId: confusedShift ? confusedShift._id : null,
      manuallySelectedShiftId: manuallySelectedShiftId || null,
      comments: comments || null,
      photoEvidence: photoEvidence || null,
      geoLocation: geoLocation || null,
      workflow: workflowData
    });

    // If ConfusedShift exists and shift was selected, resolve it
    if (confusedShift && manuallySelectedShiftId) {
      // Update attendance record with shift
      attendanceRecord.shiftId = finalShiftId;

      // Re-run shift detection to update late-in/early-out
      const detectionResult = await detectAndAssignShift(
        employeeNumber,
        date,
        attendanceRecord.inTime,
        attendanceRecord.outTime || otOutTimeDate
      );

      if (detectionResult.success) {
        attendanceRecord.lateInMinutes = detectionResult.lateInMinutes;
        attendanceRecord.earlyOutMinutes = detectionResult.earlyOutMinutes;
        attendanceRecord.isLateIn = detectionResult.isLateIn || false;
        attendanceRecord.isEarlyOut = detectionResult.isEarlyOut || false;
        attendanceRecord.expectedHours = detectionResult.expectedHours;
      }

      await attendanceRecord.save();

      // Mark ConfusedShift as resolved
      confusedShift.status = 'resolved';
      confusedShift.assignedShiftId = finalShiftId;
      confusedShift.reviewedBy = userId;
      confusedShift.reviewedAt = new Date();
      await confusedShift.save();
    }

    return {
      success: true,
      message: 'OT request created successfully',
      data: otRequest,
    };

  } catch (error) {
    console.error('Error creating OT request:', error);
    return {
      success: false,
      message: error.message || 'Error creating OT request',
    };
  }
};

/**
 * Approve OT request
 * @param {String} otId - OT request ID
 * @param {String} userId - User ID approving
 * @returns {Object} - Result
 */
const approveOTRequest = async (otId, userId, userRole) => {
  try {
    const otRequest = await OT.findById(otId).populate('shiftId');

    if (!otRequest) {
      return {
        success: false,
        message: 'OT request not found',
      };
    }

    if (otRequest.status !== 'pending' && otRequest.status !== 'manager_approved') {
      // Allow HR to approve 'manager_approved' requests
      return {
        success: false,
        message: `OT request is already ${otRequest.status}`,
      };
    }

    // --- START DYNAMIC WORKFLOW LOGIC ---
    if (otRequest.workflow && otRequest.workflow.approvalChain.length > 0) {
      const { workflow } = otRequest;
      const currentStepIndex = workflow.approvalChain.findIndex(step => step.isCurrent);
      const currentStep = workflow.approvalChain[currentStepIndex];

      // 1. Authorization Check
      if (currentStep.role !== userRole && userRole !== 'super_admin') {
        return { success: false, message: `Unauthorized. Required: ${currentStep.role.toUpperCase()}` };
      }

      // 2. Update Current Step
      currentStep.status = 'approved';
      currentStep.isCurrent = false;
      currentStep.actionBy = userId;
      currentStep.actionAt = new Date();
      currentStep.comments = 'Approved through workflow';

      // 3. Add to History
      workflow.history.push({
        step: currentStep.role,
        action: 'approved',
        actionBy: userId,
        timestamp: new Date(),
        comments: 'Workflow approval'
      });

      // 4. Determination of Next Step or Finality
      const isLastStep = currentStepIndex === workflow.approvalChain.length - 1;
      const isFinalAuthority = userRole === workflow.finalAuthority || currentStep.role === workflow.finalAuthority;

      if (isLastStep || isFinalAuthority) {
        // --- FINAL APPROVAL REACHED ---
        otRequest.status = 'approved';
        workflow.isCompleted = true;
        workflow.nextApproverRole = null;
        workflow.nextApprover = null;

        // Trigger Side Effects (Attendance Update)
        const attendanceRecord = await AttendanceDaily.findById(otRequest.attendanceRecordId);
        if (attendanceRecord) {
          attendanceRecord.otHours = otRequest.otHours;
          await attendanceRecord.save();

          // Recalculate summary
          const dateObj = new Date(otRequest.date);
          await calculateMonthlySummary(otRequest.employeeId, otRequest.employeeNumber, dateObj.getFullYear(), dateObj.getMonth() + 1);
        }
      } else {
        // --- MOVE TO NEXT STEP ---
        const nextStep = workflow.approvalChain[currentStepIndex + 1];
        nextStep.isCurrent = true;
        workflow.currentStepRole = nextStep.role;
        workflow.nextApproverRole = nextStep.role;
        workflow.nextApprover = nextStep.role;
        otRequest.status = `${currentStep.role}_approved`; // Intermediate status
      }

      otRequest.approvedBy = userId;
      otRequest.approvedAt = new Date();
      await otRequest.save();

      return {
        success: true,
        message: workflow.isCompleted ? 'OT fully approved' : `OT approved by ${userRole.toUpperCase()}, moved to ${workflow.nextApproverRole.toUpperCase()}`,
        data: otRequest
      };
    }
    // --- END DYNAMIC WORKFLOW LOGIC ---

    // Determine status based on role (Legacy)

    otRequest.approvedBy = userId;
    otRequest.approvedAt = new Date();
    await otRequest.save();

    // Update attendance record
    const attendanceRecord = await AttendanceDaily.findById(otRequest.attendanceRecordId);
    if (attendanceRecord) {
      attendanceRecord.otHours = otRequest.otHours;
      await attendanceRecord.save();

      // Recalculate monthly summary
      const dateObj = new Date(otRequest.date);
      const year = dateObj.getFullYear();
      const monthNumber = dateObj.getMonth() + 1;
      await calculateMonthlySummary(otRequest.employeeId, otRequest.employeeNumber, year, monthNumber);
    }

    return {
      success: true,
      message: 'OT request approved successfully',
      data: otRequest,
    };

  } catch (error) {
    console.error('Error approving OT request:', error);
    return {
      success: false,
      message: error.message || 'Error approving OT request',
    };
  }
};

/**
 * Reject OT request
 * @param {String} otId - OT request ID
 * @param {String} userId - User ID rejecting
 * @param {String} reason - Rejection reason
 * @returns {Object} - Result
 */
const rejectOTRequest = async (otId, userId, reason, userRole) => {
  try {
    const otRequest = await OT.findById(otId);

    if (!otRequest) {
      return {
        success: false,
        message: 'OT request not found',
      };
    }

    if (otRequest.status !== 'pending' && otRequest.status !== 'manager_approved') {
      return {
        success: false,
        message: `OT request is already ${otRequest.status}`,
      };
    }

    // --- START DYNAMIC WORKFLOW LOGIC ---
    if (otRequest.workflow && otRequest.workflow.approvalChain.length > 0) {
      const { workflow } = otRequest;
      const currentStep = workflow.approvalChain.find(step => step.isCurrent);

      if (currentStep) {
        currentStep.status = 'rejected';
        currentStep.isCurrent = false;
        currentStep.actionBy = userId;
        currentStep.actionAt = new Date();
        currentStep.comments = reason || 'Workflow rejection';
      }

      workflow.history.push({
        step: currentStep ? currentStep.role : userRole,
        action: 'rejected',
        actionBy: userId,
        timestamp: new Date(),
        comments: reason || 'Workflow rejection'
      });

      workflow.isCompleted = true;
      workflow.nextApproverRole = null;
      workflow.nextApprover = null;
      otRequest.status = 'rejected';
      otRequest.rejectedBy = userId;
      otRequest.rejectedAt = new Date();
      otRequest.rejectionReason = reason || null;
      await otRequest.save();

      return {
        success: true,
        message: 'OT request rejected successfully',
        data: otRequest,
      };
    }
    // --- END DYNAMIC WORKFLOW LOGIC ---

    if (userRole === 'manager') {
      otRequest.status = 'manager_rejected';
    } else {
      otRequest.status = 'rejected';
    }

    otRequest.rejectedBy = userId;
    otRequest.rejectedAt = new Date();
    otRequest.rejectionReason = reason || null;
    await otRequest.save();

    return {
      success: true,
      message: 'OT request rejected successfully',
      data: otRequest,
    };

  } catch (error) {
    console.error('Error rejecting OT request:', error);
    return {
      success: false,
      message: error.message || 'Error rejecting OT request',
    };
  }
};

/**
 * Convert extra hours from attendance to OT (auto-approved)
 * @param {String} employeeId - Employee ID
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date (YYYY-MM-DD)
 * @param {String} userId - User ID performing the conversion
 * @returns {Object} - Result
 */
const convertExtraHoursToOT = async (employeeId, employeeNumber, date, userId) => {
  try {
    // Get attendance record
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    });

    if (!attendanceRecord) {
      return {
        success: false,
        message: 'Attendance record not found for this date',
      };
    }

    // Check if extra hours exist
    if (!attendanceRecord.extraHours || attendanceRecord.extraHours <= 0) {
      return {
        success: false,
        message: 'No extra hours found for this date',
      };
    }

    // Check if shift is assigned
    if (!attendanceRecord.shiftId) {
      return {
        success: false,
        message: 'Shift not assigned for this attendance record. Please assign shift first.',
      };
    }

    // Check if OT already exists for this date
    const existingOT = await OT.findOne({
      employeeId: employeeId,
      date: date,
      status: { $in: ['pending', 'approved'] },
      isActive: true,
    });

    if (existingOT) {
      return {
        success: false,
        message: 'OT record already exists for this date',
        existingOT: existingOT,
      };
    }

    // Get employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return {
        success: false,
        message: 'Employee not found',
      };
    }

    // Get shift
    const shift = await Shift.findById(attendanceRecord.shiftId);
    if (!shift) {
      return {
        success: false,
        message: 'Shift not found',
      };
    }

    // Calculate OT times
    const [shiftEndHour, shiftEndMin] = shift.endTime.split(':').map(Number);
    const otInTime = new Date(date);
    otInTime.setHours(shiftEndHour, shiftEndMin, 0, 0);

    // OT out time = shift end time + extra hours
    const otOutTime = new Date(otInTime);
    otOutTime.setHours(otOutTime.getHours() + attendanceRecord.extraHours);

    // Use extra hours as OT hours
    const otHours = Math.round(attendanceRecord.extraHours * 100) / 100;

    // Create OT record (auto-approved)
    const otRecord = await OT.create({
      employeeId: employeeId,
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      attendanceRecordId: attendanceRecord._id,
      shiftId: attendanceRecord.shiftId,
      employeeInTime: attendanceRecord.inTime,
      shiftEndTime: shift.endTime,
      otInTime: otInTime,
      otOutTime: otOutTime,
      otHours: otHours,
      status: 'approved', // Auto-approved
      requestedBy: userId,
      approvedBy: userId,
      approvedAt: new Date(),
      convertedFromAttendance: true,
      convertedBy: userId,
      convertedAt: new Date(),
      source: 'attendance_conversion',
      comments: `Converted from attendance extra hours (${otHours.toFixed(2)} hrs)`,
    });

    // Update attendance record: set otHours and clear extraHours
    attendanceRecord.otHours = otHours;
    attendanceRecord.extraHours = 0; // Clear extra hours as they're now converted to OT
    await attendanceRecord.save();

    // Recalculate monthly summary
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const monthNumber = dateObj.getMonth() + 1;
    await calculateMonthlySummary(employeeId, employeeNumber.toUpperCase(), year, monthNumber);

    return {
      success: true,
      message: `Successfully converted ${otHours.toFixed(2)} extra hours to OT`,
      data: otRecord,
    };

  } catch (error) {
    console.error('Error converting extra hours to OT:', error);
    return {
      success: false,
      message: error.message || 'Error converting extra hours to OT',
    };
  }
};

module.exports = {
  createOTRequest,
  approveOTRequest,
  rejectOTRequest,
  convertExtraHoursToOT,
};

