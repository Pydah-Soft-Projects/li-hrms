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
const { checkJurisdiction } = require('../../shared/middleware/dataScopeMiddleware');
const OvertimeSettings = require('../model/OvertimeSettings');
const Settings = require('../../settings/model/Settings');
const { getMergedOtConfig } = require('./otConfigResolver');
const { applyOtHoursPolicy } = require('./otHoursPolicyService');

function buildOtWorkflow(userId, otSettings) {
  const approvalSteps = [];
  approvalSteps.push({
    stepOrder: 1,
    role: 'hod',
    label: 'HOD Approval',
    status: 'pending',
    isCurrent: true,
  });
  if (otSettings?.workflow?.steps && otSettings.workflow.steps.length > 0) {
    otSettings.workflow.steps.forEach((step) => {
      if (step.approverRole !== 'hod') {
        approvalSteps.push({
          stepOrder: approvalSteps.length + 1,
          role: step.approverRole,
          label: step.stepName || `${step.approverRole.toUpperCase()} Approval`,
          status: 'pending',
          isCurrent: false,
        });
      }
    });
  }
  return {
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
        comments: 'OT request submitted',
      },
    ],
  };
}

function formatHoursAsHHMM(hours) {
  const totalMinutes = Math.max(0, Math.round((Number(hours) || 0) * 60));
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function getSegmentCumulativeExtraHours(attendanceRecord) {
  const segments = Array.isArray(attendanceRecord?.shifts) ? attendanceRecord.shifts : [];
  if (!segments.length) return 0;
  const total = segments.reduce((sum, s) => sum + (Number(s?.extraHours) || 0), 0);
  return Math.round(total * 100) / 100;
}

function resolveAttendanceShiftId(attendanceRecord) {
  const segmentShift = (attendanceRecord?.shifts || []).find((s) => s?.shiftId)?.shiftId || null;
  return segmentShift || attendanceRecord?.shiftId || null;
}

function resolveSegmentPunchWindow(attendanceRecord) {
  const windows = (attendanceRecord?.shifts || [])
    .filter((s) => s?.inTime && s?.outTime)
    .map((s) => ({
      inTime: new Date(s.inTime),
      outTime: new Date(s.outTime),
    }))
    .filter((w) => !Number.isNaN(w.inTime.getTime()) && !Number.isNaN(w.outTime.getTime()) && w.outTime > w.inTime);
  if (!windows.length) return null;
  windows.sort((a, b) => a.inTime - b.inTime);
  return {
    firstInTime: windows[0].inTime,
    lastOutTime: windows.reduce((mx, w) => (w.outTime > mx ? w.outTime : mx), windows[0].outTime),
  };
}

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

    // Populate division and department for snapshotting
    await employee.populate([
      { path: 'division_id', select: 'name' },
      { path: 'department_id', select: 'name' }
    ]);

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
        // Fetch global general settings
        const generalConfig = await Settings.getSettingsByCategory('general');

        // Try to detect shift if not assigned
        const detectionResult = await detectAndAssignShift(
          employeeNumber,
          date,
          attendanceRecord.inTime,
          attendanceRecord.outTime || otOutTime,
          generalConfig
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

    // Use centralized helper to get OT In Time (shift end time) in IST context
    const { createDateWithOffset } = require('../../shifts/services/shiftDetectionService');
    const otInTime = createDateWithOffset(date, shift.endTime);

    // Ensure otOutTime is a Date object
    const otOutTimeDate = otOutTime instanceof Date ? otOutTime : new Date(otOutTime);

    // Validate OT out time is after OT in time
    if (otOutTimeDate <= otInTime) {
      return {
        success: false,
        message: 'OT out time must be after shift end time',
      };
    }

    // Calculate raw OT hours from clock times
    const diffMs = otOutTimeDate.getTime() - otInTime.getTime();
    let otHoursRaw = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

    const deptId = employee.department_id?._id || employee.department_id;
    const divId = employee.division_id?._id || employee.division_id;
    const mergedPolicy = await getMergedOtConfig(deptId, divId);
    const policyResult = applyOtHoursPolicy(otHoursRaw, mergedPolicy);
    if (!policyResult.eligible) {
      return {
        success: false,
        message: `OT does not meet configured rules (raw ${policyResult.rawHours}h). ${policyResult.steps.join('; ')}`,
        policy: policyResult,
      };
    }
    let otHours = policyResult.finalHours;
    let otOutTimeAdjusted = otOutTimeDate;
    if (Math.abs(otHours - otHoursRaw) > 1e-6) {
      otOutTimeAdjusted = new Date(otInTime.getTime() + otHours * 3600 * 1000);
    }

    // Check if OT already exists for this date
    const existingOT = await OT.findOne({
      employeeId: employeeId,
      date: date,
      status: { $in: ['pending', 'approved', 'manager_approved'] },
      isActive: true,
    });

    if (existingOT) {
      return {
        success: false,
        message: 'OT request already exists for this date',
        existingOT: existingOT,
      };
    }

    const otSettings = await OvertimeSettings.getActiveSettings();
    const workflowData = buildOtWorkflow(userId, otSettings);

    const otPolicySnapshot = {
      rawOtHours: policyResult.rawHours,
      rawOtHHMM: formatHoursAsHHMM(policyResult.rawHours),
      rawOtMinutes: policyResult.rawMinutes,
      finalOtHours: otHours,
      finalOtHHMM: formatHoursAsHHMM(otHours),
      finalOtMinutes: policyResult.creditedMinutes,
      matchedRange: policyResult.matchedRange,
      steps: policyResult.steps,
      recognitionMode: mergedPolicy.recognitionMode,
      thresholdHours: mergedPolicy.thresholdHours,
      minOTHours: mergedPolicy.minOTHours,
      roundingMinutes: mergedPolicy.roundingMinutes,
      roundUpIfFractionMinutesGte: mergedPolicy.roundUpIfFractionMinutesGte,
      otHourRanges: mergedPolicy.otHourRanges,
    };

    // Create OT request
    const otRequest = await OT.create({
      employeeId: employeeId,
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      attendanceRecordId: attendanceRecord._id,
      division_id: employee.division_id?._id || employee.division_id,
      division_name: employee.division_id?.name || 'N/A',
      department_id: employee.department_id?._id || employee.department_id,
      department_name: employee.department_id?.name || 'N/A',
      shiftId: finalShiftId,
      employeeInTime: attendanceRecord.inTime,
      shiftEndTime: shift.endTime,
      otInTime: otInTime,
      otOutTime: otOutTimeAdjusted,
      otHours: otHours,
      rawOtHours: policyResult.rawHours,
      computedOtHours: otHours,
      otPolicySnapshot,
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

      // Fetch global general settings
      const generalConfig = await Settings.getSettingsByCategory('general');

      // Re-run shift detection to update late-in/early-out
      const detectionResult = await detectAndAssignShift(
        employeeNumber,
        date,
        attendanceRecord.inTime,
        attendanceRecord.outTime || otOutTimeAdjusted,
        generalConfig
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

    // --- START DYNAMIC WORKFLOW LOGIC ---
    if (otRequest.workflow && otRequest.workflow.approvalChain.length > 0) {
      const { workflow } = otRequest;
      if (['approved', 'rejected', 'manager_rejected'].includes(String(otRequest.status || '').toLowerCase())) {
        return {
          success: false,
          message: `OT request is already ${otRequest.status}`,
        };
      }
      const currentStepIndex = workflow.approvalChain.findIndex(step => step.isCurrent);
      const currentStep = workflow.approvalChain[currentStepIndex];

      // 1. Authorization & Scoping Check
      const User = require('../../users/model/User');
      const fullUser = await User.findById(userId);
      if (!fullUser) return { success: false, message: 'User record not found' };

      const myRole = String(userRole || '').toLowerCase().trim();
      const requiredRole = String(currentStep.role || '').toLowerCase().trim();

      // Basic Role Match & Reporting Manager Check
      let isAuthorizedRole = myRole === requiredRole || myRole === 'super_admin';

      if (!isAuthorizedRole && requiredRole === 'reporting_manager') {
        // 1. Check if user is the assigned Reporting Manager
        const targetEmployee = await Employee.findById(otRequest.employeeId);
        const managers = targetEmployee?.dynamicFields?.reporting_to;

        if (managers && Array.isArray(managers) && managers.length > 0) {
          const userIdStr = (fullUser._id || fullUser.userId).toString();
          isAuthorizedRole = managers.some(m => (m._id || m).toString() === userIdStr);
        }

        // 2. Fallback to HOD if no managers assigned OR if user is an HOD for the employee
        if (!isAuthorizedRole && myRole === 'hod') {
          // checkJurisdiction will handle the departmental scoping
          isAuthorizedRole = true;
        }
      }

      if (!isAuthorizedRole) {
        return { success: false, message: `Unauthorized. Required: ${requiredRole.toUpperCase()}` };
      }

      // Enforce Centralized Jurisdictional Check
      if (!checkJurisdiction(fullUser, otRequest)) {
        return { success: false, message: 'Not authorized. OT request is outside your assigned data scope.' };
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

      // Keep approval strictly sequential: only final step can fully approve.
      if (isLastStep) {
        // --- FINAL APPROVAL REACHED ---
        otRequest.status = 'approved';
        workflow.isCompleted = true;
        workflow.nextApproverRole = null;
        workflow.nextApprover = null;

        // Trigger Side Effects (Attendance Update)
        const attendanceRecord = await AttendanceDaily.findById(otRequest.attendanceRecordId);
        if (attendanceRecord) {
          attendanceRecord.otHours = otRequest.otHours;
          if (otRequest.convertedFromAttendance) {
            attendanceRecord.extraHours = 0;
            if (attendanceRecord.shifts?.length) {
              attendanceRecord.shifts.forEach(s => {
                if (s.extraHours > 0) { s.otHours = (s.otHours || 0) + s.extraHours; s.extraHours = 0; }
              });
              attendanceRecord.markModified('shifts');
            }
          }
          await attendanceRecord.save();

          // Recalculate summary
          const [year, month] = otRequest.date.split('-').map(Number);
          await calculateMonthlySummary(otRequest.employeeId, otRequest.employeeNumber, year, month);
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

    if (otRequest.status !== 'pending' && otRequest.status !== 'manager_approved') {
      // Legacy fallback allows manager intermediate approval only.
      return {
        success: false,
        message: `OT request is already ${otRequest.status}`,
      };
    }

    // Legacy fallback when no workflow chain is present:
    // manager does intermediate approval, others can finalize.
    if (userRole === 'manager') {
      otRequest.status = 'manager_approved';
    } else {
      otRequest.status = 'approved';
    }

    otRequest.approvedBy = userId;
    otRequest.approvedAt = new Date();
    await otRequest.save();

    // IMPORTANT: only write OT into attendance once final approval is reached.
    if (otRequest.status === 'approved') {
      const attendanceRecord = await AttendanceDaily.findById(otRequest.attendanceRecordId);
      if (attendanceRecord) {
        attendanceRecord.otHours = otRequest.otHours;
        if (otRequest.convertedFromAttendance) {
          attendanceRecord.extraHours = 0;
          if (attendanceRecord.shifts?.length) {
            attendanceRecord.shifts.forEach(s => {
              if (s.extraHours > 0) { s.otHours = (s.otHours || 0) + s.extraHours; s.extraHours = 0; }
            });
            attendanceRecord.markModified('shifts');
          }
        }
        await attendanceRecord.save();

        // Recalculate monthly summary
        const [year, month] = otRequest.date.split('-').map(Number);
        await calculateMonthlySummary(otRequest.employeeId, otRequest.employeeNumber, year, month);
      }
    }

    return {
      success: true,
      message:
        otRequest.status === 'approved'
          ? 'OT request approved successfully'
          : 'OT request moved to manager approved stage',
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
 * @param {String} userName - User name performing the conversion
 * @returns {Object} - Result
 */
const convertExtraHoursToOT = async (employeeId, employeeNumber, date, userId, userName, options = {}) => {
  const source = options.source === 'auto_detected' ? 'auto_detected' : 'attendance_conversion';
  try {
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

    const rawExtra = getSegmentCumulativeExtraHours(attendanceRecord);
    if (!rawExtra || rawExtra <= 0) {
      return {
        success: false,
        message: 'No segment extra hours found for this date',
      };
    }

    const resolvedShiftId = resolveAttendanceShiftId(attendanceRecord);
    if (!resolvedShiftId) {
      return {
        success: false,
        message: 'Shift not assigned for this attendance record. Please assign shift first.',
      };
    }

    const existingOT = await OT.findOne({
      employeeId: employeeId,
      date: date,
      status: { $in: ['pending', 'approved', 'manager_approved'] },
      isActive: true,
    });

    if (existingOT) {
      return {
        success: false,
        message: 'OT record already exists for this date',
        existingOT: existingOT,
      };
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return {
        success: false,
        message: 'Employee not found',
      };
    }

    await employee.populate([
      { path: 'division_id', select: 'name' },
      { path: 'department_id', select: 'name' },
    ]);

    const shift = await Shift.findById(resolvedShiftId);
    if (!shift) {
      return {
        success: false,
        message: 'Shift not found',
      };
    }

    const deptId = employee.department_id?._id || employee.department_id;
    const divId = employee.division_id?._id || employee.division_id;
    const mergedPolicy = await getMergedOtConfig(deptId, divId);
    const policyResult = applyOtHoursPolicy(rawExtra, mergedPolicy);

    if (!policyResult.eligible) {
      return {
        success: false,
        message: `Extra hours do not qualify under OT rules (raw ${policyResult.rawHours}h). ${policyResult.steps.join('; ')}`,
        policy: policyResult,
      };
    }

    const otHours = policyResult.finalHours;
    const { createDateWithOffset } = require('../../shifts/services/shiftDetectionService');
    const segmentWindow = resolveSegmentPunchWindow(attendanceRecord);
    // For regular attendance conversion, OT window must follow shift-end -> actual out punch.
    const otInTime = createDateWithOffset(date, shift.endTime);
    const otOutTime = segmentWindow?.lastOutTime || new Date(otInTime.getTime() + otHours * 3600 * 1000);
    const employeeInTime = attendanceRecord.inTime || segmentWindow?.firstInTime || null;
    if (!employeeInTime) {
      return {
        success: false,
        message: 'Employee in-time not found in attendance or shift segments',
      };
    }
    if (otOutTime <= otInTime) {
      return {
        success: false,
        message: 'Actual out punch is not after shift end time for OT conversion',
      };
    }

    const otSettings = await OvertimeSettings.getActiveSettings();
    const workflowData = buildOtWorkflow(userId, otSettings);

    const otPolicySnapshot = {
      rawOtHours: policyResult.rawHours,
      rawOtHHMM: formatHoursAsHHMM(policyResult.rawHours),
      rawOtMinutes: policyResult.rawMinutes,
      finalOtHours: otHours,
      finalOtHHMM: formatHoursAsHHMM(otHours),
      finalOtMinutes: policyResult.creditedMinutes,
      matchedRange: policyResult.matchedRange,
      steps: policyResult.steps,
      recognitionMode: mergedPolicy.recognitionMode,
      thresholdHours: mergedPolicy.thresholdHours,
      minOTHours: mergedPolicy.minOTHours,
      roundingMinutes: mergedPolicy.roundingMinutes,
      roundUpIfFractionMinutesGte: mergedPolicy.roundUpIfFractionMinutesGte,
      otHourRanges: mergedPolicy.otHourRanges,
    };

    const otRecord = await OT.create({
      employeeId: employeeId,
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      attendanceRecordId: attendanceRecord._id,
      division_id: employee.division_id?._id || employee.division_id,
      division_name: employee.division_id?.name || 'N/A',
      department_id: employee.department_id?._id || employee.department_id,
      department_name: employee.department_id?.name || 'N/A',
      shiftId: resolvedShiftId,
      employeeInTime,
      shiftEndTime: shift.endTime,
      otInTime: otInTime,
      otOutTime: otOutTime,
      otHours: otHours,
      rawOtHours: policyResult.rawHours,
      computedOtHours: otHours,
      otPolicySnapshot,
      status: 'pending',
      requestedBy: userId,
      convertedFromAttendance: true,
      convertedBy: userId,
      convertedAt: new Date(),
      source,
      workflow: workflowData,
      comments:
        source === 'auto_detected'
          ? `Auto OT request: original ${formatHoursAsHHMM(rawExtra)} (${rawExtra.toFixed(2)}h) -> considered ${formatHoursAsHHMM(otHours)} (${otHours.toFixed(2)}h) after policy (pending approval)`
          : `OT request from extra hours: original ${formatHoursAsHHMM(rawExtra)} (${rawExtra.toFixed(2)}h) -> considered ${formatHoursAsHHMM(otHours)} (${otHours.toFixed(2)}h) after policy (pending approval)`,
    });

    attendanceRecord.isEdited = true;
    attendanceRecord.editHistory.push({
      action: source === 'auto_detected' ? 'OT_AUTO_REQUESTED' : 'OT_CONVERSION_REQUESTED',
      modifiedBy: userId,
      modifiedByName: userName,
      modifiedAt: new Date(),
      details:
        source === 'auto_detected'
          ? `Auto-created OT request: original ${formatHoursAsHHMM(rawExtra)} (${rawExtra.toFixed(2)}h) -> considered ${formatHoursAsHHMM(otHours)} (${otHours.toFixed(2)}h) after rules (pending approval)`
          : `Requested conversion of extra hours: original ${formatHoursAsHHMM(rawExtra)} (${rawExtra.toFixed(2)}h) -> considered ${formatHoursAsHHMM(otHours)} (${otHours.toFixed(2)}h) after rules (pending approval)`,
    });
    await attendanceRecord.save();

    const [year, month] = date.split('-').map(Number);
    await calculateMonthlySummary(employeeId, employeeNumber.toUpperCase(), year, month);

    return {
      success: true,
      message: `OT request created: considered ${formatHoursAsHHMM(otHours)} (${otHours.toFixed(2)}h) from original ${formatHoursAsHHMM(rawExtra)} (${rawExtra.toFixed(2)}h), pending approval`,
      data: otRecord,
      policy: policyResult,
    };
  } catch (error) {
    console.error('Error converting extra hours to OT:', error);
    return {
      success: false,
      message: error.message || 'Error converting extra hours to OT',
    };
  }
};

/**
 * Auto-create pending OT when settings allow and extra hours qualify (idempotent per day).
 */
/**
 * Run OT hour policy for a raw value (optional draft overrides on top of merged DB settings).
 */
const simulateOtHoursPolicy = async (rawHours, departmentId, divisionId, policyDraft) => {
  const merged = await getMergedOtConfig(departmentId || null, divisionId || null);
  const policy =
    policyDraft && typeof policyDraft === 'object' ? { ...merged, ...policyDraft } : merged;
  const result = applyOtHoursPolicy(Number(rawHours), policy);
  return {
    ...result,
    policyUsed: {
      recognitionMode: policy.recognitionMode,
      thresholdHours: policy.thresholdHours,
      minOTHours: policy.minOTHours,
      roundingMinutes: policy.roundingMinutes,
      roundUpIfFractionMinutesGte: policy.roundUpIfFractionMinutesGte,
      otHourRanges: policy.otHourRanges,
    },
  };
};

/**
 * Preview policy outcome for converting attendance extra hours (no DB writes).
 */
const previewConvertExtraHoursToOT = async (employeeId, employeeNumber, date) => {
  try {
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date,
    });
    if (!attendanceRecord) {
      return { success: false, message: 'Attendance record not found for this date' };
    }
    const rawExtra = getSegmentCumulativeExtraHours(attendanceRecord);
    if (!rawExtra || rawExtra <= 0) {
      return { success: false, message: 'No segment extra hours found for this date' };
    }
    const resolvedShiftId = resolveAttendanceShiftId(attendanceRecord);
    if (!resolvedShiftId) {
      return { success: false, message: 'Shift not assigned for this attendance record' };
    }
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return { success: false, message: 'Employee not found' };
    }
    const deptId = employee.department_id?._id || employee.department_id;
    const divId = employee.division_id?._id || employee.division_id;
    const mergedPolicy = await getMergedOtConfig(deptId, divId);
    const policyResult = applyOtHoursPolicy(rawExtra, mergedPolicy);
    const existingOT = await OT.findOne({
      employeeId,
      date,
      status: { $in: ['pending', 'approved', 'manager_approved'] },
      isActive: true,
    });
    return {
      success: true,
      rawExtraHours: rawExtra,
      policy: policyResult,
      mergedPolicy: {
        recognitionMode: mergedPolicy.recognitionMode,
        thresholdHours: mergedPolicy.thresholdHours,
        minOTHours: mergedPolicy.minOTHours,
        roundingMinutes: mergedPolicy.roundingMinutes,
        roundUpIfFractionMinutesGte: mergedPolicy.roundUpIfFractionMinutesGte,
        otHourRanges: mergedPolicy.otHourRanges,
      },
      hasExistingOt: !!existingOT,
    };
  } catch (e) {
    return { success: false, message: e.message || 'Preview failed' };
  }
};

const maybeAutoCreateOtFromAttendanceDay = async (employeeNumber, date) => {
  try {
    const empNo = (employeeNumber || '').toUpperCase();
    const employee = await Employee.findOne({ emp_no: empNo, is_active: { $ne: false } });
    if (!employee) return { skipped: true, reason: 'no_employee' };

    const merged = await getMergedOtConfig(employee.department_id, employee.division_id);
    if (!merged.autoCreateOtRequest) return { skipped: true, reason: 'auto_disabled' };

    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: empNo,
      date,
    });
    const rawExtra = getSegmentCumulativeExtraHours(attendanceRecord);
    if (!rawExtra || rawExtra <= 0) {
      return { skipped: true, reason: 'no_extra' };
    }
    if (!resolveAttendanceShiftId(attendanceRecord)) return { skipped: true, reason: 'no_shift' };

    const dup = await OT.findOne({
      employeeId: employee._id,
      date,
      status: { $in: ['pending', 'approved', 'manager_approved'] },
      isActive: true,
    });
    if (dup) return { skipped: true, reason: 'ot_exists' };

    const User = require('../../users/model/User');
    let requester = await User.findOne({ employeeRef: employee._id });
    if (!requester) {
      requester = await User.findOne({ role: 'super_admin' }).sort({ createdAt: 1 });
    }
    if (!requester?._id) {
      console.warn('[OT Auto] No user for requestedBy; skipping auto OT');
      return { skipped: true, reason: 'no_requester_user' };
    }

    const result = await convertExtraHoursToOT(
      employee._id.toString(),
      empNo,
      date,
      requester._id,
      'System (auto OT)',
      { source: 'auto_detected' }
    );
    if (!result.success) {
      return { skipped: true, reason: 'convert_failed', message: result.message };
    }
    return { skipped: false, data: result.data };
  } catch (e) {
    console.error('[OT Auto] maybeAutoCreateOtFromAttendanceDay:', e);
    return { skipped: true, reason: 'error', message: e.message };
  }
};

module.exports = {
  createOTRequest,
  approveOTRequest,
  rejectOTRequest,
  convertExtraHoursToOT,
  previewConvertExtraHoursToOT,
  simulateOtHoursPolicy,
  maybeAutoCreateOtFromAttendanceDay,
};

