/**
 * Permission Service
 * Handles permission requests, QR code generation, and outpass management
 */

const Permission = require('../model/Permission');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const { calculateMonthlySummary } = require('../../attendance/services/summaryCalculationService');
const { validatePermissionRequest } = require('../../shared/services/conflictValidationService');
const { getResolvedPermissionSettings } = require('../../departments/controllers/departmentSettingsController');
const { checkJurisdiction } = require('../../shared/middleware/dataScopeMiddleware');
const PermissionDeductionSettings = require('../model/PermissionDeductionSettings');

/**
 * Create permission request
 * @param {Object} data - Permission request data
 * @param {String} userId - User ID creating the request
 * @returns {Object} - Result
 */
const createPermissionRequest = async (data, userId) => {
  try {
    const {
      employeeId,
      employeeNumber,
      date,
      permissionStartTime,
      permissionEndTime,
      purpose,
      comments,
      photoEvidence,
      geoLocation,
      permissionType: rawPermissionType,
      permittedEdgeTime,
    } = data;

    const normType = ['mid_shift', 'late_in', 'early_out'].includes(rawPermissionType)
      ? rawPermissionType
      : 'mid_shift';

    if (!employeeId || !employeeNumber || !date || !purpose) {
      return {
        success: false,
        message: 'Employee, date, and purpose are required',
      };
    }

    if (normType === 'mid_shift' && (!permissionStartTime || !permissionEndTime)) {
      return {
        success: false,
        message: 'Permission start and end times are required for mid-shift permission',
      };
    }

    if (normType === 'late_in' || normType === 'early_out') {
      const t = String(permittedEdgeTime || '').trim();
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(t)) {
        return {
          success: false,
          message: 'Valid permitted time (HH:MM) is required for late-in / early-out permission',
        };
      }
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

    // Get resolved permission settings (department + global fallback)
    let resolvedPermissionSettings = null;
    if (employee.department_id) {
      resolvedPermissionSettings = await getResolvedPermissionSettings(employee.department_id);
    }

    // Check permission limits using resolved settings - WARN ONLY, don't block
    const limitWarnings = [];
    if (resolvedPermissionSettings) {
      // Check daily limit (if set, 0 = unlimited)
      if (resolvedPermissionSettings.perDayLimit !== null && resolvedPermissionSettings.perDayLimit > 0) {
        const existingPermissionsToday = await Permission.countDocuments({
          employeeId: employeeId,
          date: date,
          status: { $in: ['pending', 'approved'] },
          isActive: true,
        });

        if (existingPermissionsToday >= resolvedPermissionSettings.perDayLimit) {
          limitWarnings.push(`⚠️ Daily permission limit (${resolvedPermissionSettings.perDayLimit}) has been reached for this date. This is the ${existingPermissionsToday + 1} permission today.`);
        }
      }

      // Check monthly limit (if set, 0 = unlimited)
      if (resolvedPermissionSettings.monthlyLimit !== null && resolvedPermissionSettings.monthlyLimit > 0) {
        const [year, month] = date.split('-').map(Number);

        // Use IST boundaries (+05:30)
        const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+05:30`);
        // Last day of the month
        const lastDay = new Date(year, month, 0).getDate();
        const monthEnd = new Date(`${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59+05:30`);

        const existingPermissionsThisMonth = await Permission.countDocuments({
          employeeId: employeeId,
          date: { $gte: `${year}-${String(month).padStart(2, '0')}-01`, $lte: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` },
          status: { $in: ['pending', 'approved'] },
          isActive: true,
        });

        if (existingPermissionsThisMonth >= resolvedPermissionSettings.monthlyLimit) {
          limitWarnings.push(`⚠️ Monthly permission limit (${resolvedPermissionSettings.monthlyLimit}) has been reached for this month. This is the ${existingPermissionsThisMonth + 1} permission this month.`);
        }
      }
    }

    // Validate Permission request - check conflicts and attendance rules by type
    const validation = await validatePermissionRequest(employeeId, employeeNumber, date, {
      permissionType: normType,
    });
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

    if (normType === 'late_in' || normType === 'early_out') {
      const dup = await Permission.countDocuments({
        employeeId,
        date,
        permissionType: normType,
        status: { $nin: ['rejected', 'manager_rejected'] },
        isActive: true,
      });
      if (dup > 0) {
        return {
          success: false,
          message: `An active ${normType.replace('_', ' ')} permission already exists for this date`,
        };
      }
    }

    const { checkAttendanceExists } = require('../../shared/services/conflictValidationService');
    const attendanceCheck = await checkAttendanceExists(employeeNumber, date);

    if (normType === 'mid_shift' && !attendanceCheck.hasAttendance) {
      return {
        success: false,
        message:
          attendanceCheck.message ||
          'No attendance record found for this date. Mid-shift permission requires an attendance row.',
        validationErrors: [attendanceCheck.message || 'Attendance is required for mid-shift permission'],
        hasAttendance: false,
      };
    }

    const attendanceRecord = attendanceCheck.attendance;

    let startTime;
    let endTime;
    let permissionHours;

    if (normType === 'mid_shift') {
      startTime = permissionStartTime instanceof Date ? permissionStartTime : new Date(permissionStartTime);
      endTime = permissionEndTime instanceof Date ? permissionEndTime : new Date(permissionEndTime);
      if (endTime <= startTime) {
        return {
          success: false,
          message: 'Permission end time must be after start time',
        };
      }
      const diffMs = endTime.getTime() - startTime.getTime();
      permissionHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
    } else {
      startTime = new Date(`${date}T00:00:00+05:30`);
      endTime = new Date(`${date}T23:59:59+05:30`);
      permissionHours = 0;
    }

    // Get Workflow Settings
    const workflowSettings = await PermissionDeductionSettings.getActiveSettings();

    // Initialize workflow chain from settings order (not hardcoded to HOD).
    const configuredSteps = Array.isArray(workflowSettings?.workflow?.steps)
      ? workflowSettings.workflow.steps
          .filter((s) => s && s.approverRole && s.isActive !== false)
          .sort((a, b) => Number(a.stepOrder || 0) - Number(b.stepOrder || 0))
      : [];

    const approvalSteps = configuredSteps.length
      ? configuredSteps.map((step, idx) => ({
          stepOrder: idx + 1,
          role: step.approverRole,
          label: step.stepName || `${String(step.approverRole || '').toUpperCase()} Approval`,
          status: 'pending',
          isCurrent: idx === 0,
        }))
      : [
          {
            stepOrder: 1,
            role: 'hod',
            label: 'HOD Approval',
            status: 'pending',
            isCurrent: true,
          },
        ];

    const firstStepRole = approvalSteps[0]?.role || 'hod';
    const finalRoleFromChain = approvalSteps[approvalSteps.length - 1]?.role || 'hr';

    const workflowData = {
      currentStepRole: firstStepRole,
      nextApproverRole: firstStepRole,
      nextApprover: firstStepRole,
      approvalChain: approvalSteps,
      finalAuthority: workflowSettings?.workflow?.finalAuthority?.role || finalRoleFromChain,
      history: [
        {
          step: 'employee',
          action: 'submitted',
          actionBy: userId,
          timestamp: new Date(),
          comments: 'Permission request created'
        }
      ]
    };

    // Create permission request
    const permissionRequest = await Permission.create({
      employeeId: employeeId,
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      attendanceRecordId: attendanceRecord?._id || null,
      division_id: employee.division_id?._id || employee.division_id,
      division_name: employee.division_id?.name || 'N/A',
      department_id: employee.department_id?._id || employee.department_id,
      department_name: employee.department_id?.name || 'N/A',
      permissionType: normType,
      permittedEdgeTime:
        normType === 'mid_shift' ? null : String(permittedEdgeTime || '').trim(),
      permissionStartTime: startTime,
      permissionEndTime: endTime,
      permissionHours: permissionHours,
      purpose: purpose.trim(),
      status: 'pending',
      requestedBy: userId,
      comments: comments || null,
      photoEvidence: photoEvidence || null,
      geoLocation: geoLocation || null,
      workflow: workflowData
    });

    const allWarnings = [...(validation.warnings || []), ...limitWarnings];

    return {
      success: true,
      message: 'Permission request created successfully',
      data: permissionRequest,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    };

  } catch (error) {
    console.error('Error creating permission request:', error);
    return {
      success: false,
      message: error.message || 'Error creating permission request',
    };
  }
};

/**
 * Approve permission request
 * @param {String} permissionId - Permission request ID
 * @param {String} userId - User ID approving
 * @param {String} baseUrl - Base URL for outpass (e.g., 'https://example.com')
 * @returns {Object} - Result
 */
const approvePermissionRequest = async (permissionId, userId, baseUrl = '', userRole) => {
  try {
    const permissionRequest = await Permission.findById(permissionId);

    if (!permissionRequest) {
      return {
        success: false,
        message: 'Permission request not found',
      };
    }

    if (permissionRequest.status !== 'pending' && permissionRequest.status !== 'manager_approved') {
      return {
        success: false,
        message: `Permission request is already ${permissionRequest.status}`,
      };
    }

    // --- START DYNAMIC WORKFLOW LOGIC ---
    if (permissionRequest.workflow && permissionRequest.workflow.approvalChain.length > 0) {
      const { workflow } = permissionRequest;
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
        const targetEmployee = await Employee.findById(permissionRequest.employeeId);
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
      if (!checkJurisdiction(fullUser, permissionRequest)) {
        return { success: false, message: 'Not authorized. Permission request is outside your assigned data scope.' };
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
        permissionRequest.status = 'approved';
        workflow.isCompleted = true;
        workflow.nextApproverRole = null;
        workflow.nextApprover = null;

        const isMidShift =
          !permissionRequest.permissionType || permissionRequest.permissionType === 'mid_shift';

        if (isMidShift) {
          permissionRequest.generateQRCode();
          permissionRequest.outpassUrl = `${baseUrl}/outpass/${permissionRequest.qrCode}`;
        } else {
          permissionRequest.qrCode = null;
          permissionRequest.outpassUrl = null;
        }

        const employee = await Employee.findById(permissionRequest.employeeId);
        let resolvedPermissionSettings = null;
        if (employee && employee.department_id) {
          resolvedPermissionSettings = await getResolvedPermissionSettings(employee.department_id);
        }

        let deductionAmount = 0;
        if (resolvedPermissionSettings && resolvedPermissionSettings.deductFromSalary) {
          deductionAmount = resolvedPermissionSettings.deductionAmount || 0;
          permissionRequest.deductionAmount = deductionAmount;
        }

        if (isMidShift) {
          const attendanceRecord = await AttendanceDaily.findById(permissionRequest.attendanceRecordId);
          if (attendanceRecord) {
            attendanceRecord.permissionHours = (attendanceRecord.permissionHours || 0) + permissionRequest.permissionHours;
            attendanceRecord.permissionCount = (attendanceRecord.permissionCount || 0) + 1;
            if (deductionAmount > 0) {
              attendanceRecord.permissionDeduction = (attendanceRecord.permissionDeduction || 0) + deductionAmount;
            }
            await attendanceRecord.save();
            const [year, month] = permissionRequest.date.split('-').map(Number);
            await calculateMonthlySummary(permissionRequest.employeeId, permissionRequest.employeeNumber, year, month);
          }
        }
      } else {
        // --- MOVE TO NEXT STEP ---
        const nextStep = workflow.approvalChain[currentStepIndex + 1];
        nextStep.isCurrent = true;
        workflow.currentStepRole = nextStep.role;
        workflow.nextApproverRole = nextStep.role;
        workflow.nextApprover = nextStep.role;
        permissionRequest.status = `${currentStep.role}_approved`; // Intermediate status
      }

      permissionRequest.approvedBy = userId;
      permissionRequest.approvedAt = new Date();
      await permissionRequest.save();

      return {
        success: true,
        message: workflow.isCompleted ? 'Permission fully approved' : `Permission approved by ${userRole.toUpperCase()}, moved to ${workflow.nextApproverRole.toUpperCase()}`,
        data: permissionRequest
      };
    }
    // --- END DYNAMIC WORKFLOW LOGIC ---

    const isMidShiftLegacy =
      !permissionRequest.permissionType || permissionRequest.permissionType === 'mid_shift';

    if (isMidShiftLegacy) {
      permissionRequest.generateQRCode();
      permissionRequest.outpassUrl = `${baseUrl}/outpass/${permissionRequest.qrCode}`;
    } else {
      permissionRequest.qrCode = null;
      permissionRequest.outpassUrl = null;
    }

    // Get employee to check department settings for deduction and limits
    const employee = await Employee.findById(permissionRequest.employeeId);
    let resolvedPermissionSettings = null;
    if (employee && employee.department_id) {
      resolvedPermissionSettings = await getResolvedPermissionSettings(employee.department_id);
    }

    // Check permission limits and generate warnings (don't block, just warn)
    const approvalWarnings = [];
    if (resolvedPermissionSettings) {
      // Check daily limit (if set, 0 = unlimited)
      if (resolvedPermissionSettings.perDayLimit !== null && resolvedPermissionSettings.perDayLimit > 0) {
        const existingPermissionsToday = await Permission.countDocuments({
          employeeId: permissionRequest.employeeId,
          date: permissionRequest.date,
          status: 'approved',
          isActive: true,
          _id: { $ne: permissionRequest._id }, // Exclude current permission
        });

        if (existingPermissionsToday >= resolvedPermissionSettings.perDayLimit) {
          approvalWarnings.push(`⚠️ Daily permission limit (${resolvedPermissionSettings.perDayLimit}) has been reached for this date. This is the ${existingPermissionsToday + 1} approved permission today.`);
        }
      }

      // Check monthly limit (if set, 0 = unlimited)
      if (resolvedPermissionSettings.monthlyLimit !== null && resolvedPermissionSettings.monthlyLimit > 0) {
        const dateObj = new Date(permissionRequest.date);
        const month = dateObj.getMonth() + 1;
        const year = dateObj.getFullYear();
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0, 23, 59, 59);

        const existingPermissionsThisMonth = await Permission.countDocuments({
          employeeId: permissionRequest.employeeId,
          date: { $gte: monthStart, $lte: monthEnd },
          status: 'approved',
          isActive: true,
          _id: { $ne: permissionRequest._id }, // Exclude current permission
        });

        if (existingPermissionsThisMonth >= resolvedPermissionSettings.monthlyLimit) {
          approvalWarnings.push(`⚠️ Monthly permission limit (${resolvedPermissionSettings.monthlyLimit}) has been reached for this month. This is the ${existingPermissionsThisMonth + 1} approved permission this month.`);
        }
      }
    }

    // Apply deduction if configured
    let deductionAmount = 0;
    if (resolvedPermissionSettings && resolvedPermissionSettings.deductFromSalary) {
      deductionAmount = resolvedPermissionSettings.deductionAmount || 0;
      // Store deduction amount in permission request for payroll processing
      permissionRequest.deductionAmount = deductionAmount;
    }

    // Update status based on role
    if (userRole === 'manager') {
      permissionRequest.status = 'manager_approved';
    } else {
      permissionRequest.status = 'approved';
    }

    permissionRequest.approvedBy = userId;
    permissionRequest.approvedAt = new Date();
    await permissionRequest.save();

    if (isMidShiftLegacy) {
      const attendanceRecord = await AttendanceDaily.findById(permissionRequest.attendanceRecordId);
      if (attendanceRecord) {
        attendanceRecord.permissionHours = (attendanceRecord.permissionHours || 0) + permissionRequest.permissionHours;
        attendanceRecord.permissionCount = (attendanceRecord.permissionCount || 0) + 1;

        if (deductionAmount > 0) {
          attendanceRecord.permissionDeduction = (attendanceRecord.permissionDeduction || 0) + deductionAmount;
        }

        await attendanceRecord.save();

        const dateObj = new Date(permissionRequest.date);
        const year = dateObj.getFullYear();
        const monthNumber = dateObj.getMonth() + 1;
        await calculateMonthlySummary(permissionRequest.employeeId, permissionRequest.employeeNumber, year, monthNumber);
      }
    }

    return {
      success: true,
      message: 'Permission request approved successfully',
      data: permissionRequest,
      warnings: approvalWarnings.length > 0 ? approvalWarnings : undefined,
    };

  } catch (error) {
    console.error('Error approving permission request:', error);
    return {
      success: false,
      message: error.message || 'Error approving permission request',
    };
  }
};

/**
 * Reject permission request
 * @param {String} permissionId - Permission request ID
 * @param {String} userId - User ID rejecting
 * @param {String} reason - Rejection reason
 * @returns {Object} - Result
 */
const rejectPermissionRequest = async (permissionId, userId, reason, userRole) => {
  try {
    const permissionRequest = await Permission.findById(permissionId);

    if (!permissionRequest) {
      return {
        success: false,
        message: 'Permission request not found',
      };
    }

    if (permissionRequest.status !== 'pending' && permissionRequest.status !== 'manager_approved') {
      return {
        success: false,
        message: `Permission request is already ${permissionRequest.status}`,
      };
    }

    // --- START DYNAMIC WORKFLOW LOGIC ---
    if (permissionRequest.workflow && permissionRequest.workflow.approvalChain.length > 0) {
      const { workflow } = permissionRequest;
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
      permissionRequest.status = 'rejected';
      permissionRequest.rejectedBy = userId;
      permissionRequest.rejectedAt = new Date();
      permissionRequest.rejectionReason = reason || null;
      await permissionRequest.save();

      return {
        success: true,
        message: 'Permission request rejected successfully',
        data: permissionRequest,
      };
    }
    // --- END DYNAMIC WORKFLOW LOGIC ---

    if (userRole === 'manager') {
      permissionRequest.status = 'manager_rejected';
    } else {
      permissionRequest.status = 'rejected';
    }

    permissionRequest.rejectedBy = userId;
    permissionRequest.rejectedAt = new Date();
    permissionRequest.rejectionReason = reason || null;
    await permissionRequest.save();

    return {
      success: true,
      message: 'Permission request rejected successfully',
      data: permissionRequest,
    };

  } catch (error) {
    console.error('Error rejecting permission request:', error);
    return {
      success: false,
      message: error.message || 'Error rejecting permission request',
    };
  }
};

/**
 * Get outpass data by QR code
 * @param {String} qrCode - QR code
 * @returns {Object} - Result
 */
const getOutpassByQR = async (qrCode) => {
  try {
    const permission = await Permission.findOne({ qrCode: qrCode })
      .populate('employeeId', 'emp_no employee_name department designation photo')
      .populate('approvedBy', 'name email');

    if (!permission) {
      return {
        success: false,
        message: 'Invalid QR code',
      };
    }

    // Check if QR code is expired
    if (permission.qrExpiry && new Date() > permission.qrExpiry) {
      return {
        success: false,
        message: 'QR code has expired',
        expired: true,
      };
    }

    // Check if permission is approved
    if (permission.status !== 'approved') {
      return {
        success: false,
        message: 'Permission is not approved',
      };
    }

    return {
      success: true,
      data: permission,
    };

  } catch (error) {
    console.error('Error getting outpass by QR:', error);
    return {
      success: false,
      message: error.message || 'Error getting outpass',
    };
  }
};

module.exports = {
  createPermissionRequest,
  approvePermissionRequest,
  rejectPermissionRequest,
  getOutpassByQR,
};

