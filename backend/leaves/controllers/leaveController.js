const mongoose = require('mongoose');
const Leave = require('../model/Leave');
const LeaveSettings = require('../model/LeaveSettings');
const Employee = require('../../employees/model/Employee');
const User = require('../../users/model/User');
const Settings = require('../../settings/model/Settings');
const { isHRMSConnected, getEmployeeByIdMSSQL } = require('../../employees/config/mssqlHelper');
const { getResolvedLeaveSettings } = require('../../departments/controllers/departmentSettingsController');
const { 
  revokeFullDayLeave, 
  updateLeaveForAttendance, 
  getLeaveConflicts 
} = require('../services/leaveConflictService');

/**
 * Get employee settings from database
 */
const getEmployeeSettings = async () => {
  try {
    const dataSourceSetting = await Settings.findOne({ key: 'employee_data_source' });
    return {
      dataSource: dataSourceSetting?.value || 'mongodb', // 'mongodb' | 'mssql' | 'both'
    };
  } catch (error) {
    console.error('Error getting employee settings:', error);
    return { dataSource: 'mongodb' };
  }
};

/**
 * Find employee by emp_no - respects employee settings
 * Always tries MongoDB first (for leave records), then MSSQL if configured
 * If found only in MSSQL, syncs to MongoDB for leave record integrity
 */
const findEmployeeByEmpNo = async (empNo) => {
  if (!empNo) return null;
  
  // Always try MongoDB first (Leave model needs MongoDB employee references)
  let employee = await Employee.findOne({ emp_no: empNo });
  
  if (employee) {
    return employee;
  }
  
  // If not in MongoDB, check if MSSQL is available and try there
  const settings = await getEmployeeSettings();
  
  if ((settings.dataSource === 'mssql' || settings.dataSource === 'both') && isHRMSConnected()) {
    try {
      const mssqlEmployee = await getEmployeeByIdMSSQL(empNo);
      if (mssqlEmployee) {
        // Sync employee from MSSQL to MongoDB for leave record integrity
        // This ensures we have a valid MongoDB _id for the leave record
        console.log(`Syncing employee ${empNo} from MSSQL to MongoDB...`);
        
        const newEmployee = new Employee({
          emp_no: mssqlEmployee.emp_no,
          employee_name: mssqlEmployee.employee_name,
          department_id: mssqlEmployee.department_id || null,
          designation_id: mssqlEmployee.designation_id || null,
          doj: mssqlEmployee.doj || null,
          dob: mssqlEmployee.dob || null,
          gross_salary: mssqlEmployee.gross_salary || null,
          gender: mssqlEmployee.gender || null,
          marital_status: mssqlEmployee.marital_status || null,
          blood_group: mssqlEmployee.blood_group || null,
          qualifications: mssqlEmployee.qualifications || null,
          experience: mssqlEmployee.experience || null,
          address: mssqlEmployee.address || null,
          location: mssqlEmployee.location || null,
          aadhar_number: mssqlEmployee.aadhar_number || null,
          phone_number: mssqlEmployee.phone_number || null,
          alt_phone_number: mssqlEmployee.alt_phone_number || null,
          email: mssqlEmployee.email || null,
          pf_number: mssqlEmployee.pf_number || null,
          esi_number: mssqlEmployee.esi_number || null,
          bank_account_no: mssqlEmployee.bank_account_no || null,
          bank_name: mssqlEmployee.bank_name || null,
          bank_place: mssqlEmployee.bank_place || null,
          ifsc_code: mssqlEmployee.ifsc_code || null,
          is_active: mssqlEmployee.is_active !== false,
        });
        
        await newEmployee.save();
        console.log(`✅ Employee ${empNo} synced to MongoDB`);
        return newEmployee;
      }
    } catch (error) {
      console.error('Error fetching/syncing from MSSQL:', error);
    }
  }
  
  return null;
};

// Helper to find employee by ID or emp_no (legacy support)
const findEmployeeByIdOrEmpNo = async (identifier) => {
  if (!identifier) return null;
  
  // Check if it's a valid MongoDB ObjectId
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    const employee = await Employee.findById(identifier);
    if (employee) return employee;
  }
  
  // Try to find by emp_no as fallback
  return await findEmployeeByEmpNo(identifier);
};

/**
 * Leave Controller
 * Handles CRUD operations and approval workflow
 */

// Helper function to get workflow settings
const getWorkflowSettings = async () => {
  let settings = await LeaveSettings.getActiveSettings('leave');
  
  // Return default workflow if no settings found
  if (!settings) {
    return {
      workflow: {
        isEnabled: true,
        steps: [
          { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod', availableActions: ['approve', 'reject', 'forward'], approvedStatus: 'hod_approved', rejectedStatus: 'hod_rejected', nextStepOnApprove: 2, isActive: true },
          { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr', availableActions: ['approve', 'reject'], approvedStatus: 'approved', rejectedStatus: 'hr_rejected', nextStepOnApprove: null, isActive: true },
        ],
        finalAuthority: { role: 'hr', anyHRCanApprove: true },
      },
      settings: {
        allowBackdated: false,
        maxBackdatedDays: 7,
        allowFutureDated: true,
        maxAdvanceDays: 90,
      },
    };
  }
  
  return settings;
};

// @desc    Get all leaves (with filters)
// @route   GET /api/leaves
// @access  Private
exports.getLeaves = async (req, res) => {
  try {
    const { status, employeeId, department, fromDate, toDate, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };

    if (status) filter.status = status;
    if (employeeId) filter.employeeId = employeeId;
    if (department) filter.department = department;
    if (fromDate) filter.fromDate = { $gte: new Date(fromDate) };
    if (toDate) filter.toDate = { ...filter.toDate, $lte: new Date(toDate) };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [leaves, total] = await Promise.all([
      Leave.find(filter)
        .populate('employeeId', 'employee_name emp_no')
        .populate('department', 'name')
        .populate('designation', 'name')
        .populate('appliedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Leave.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: leaves.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: leaves,
    });
  } catch (error) {
    console.error('Error fetching leaves:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch leaves',
    });
  }
};

// @desc    Get my leaves (for logged-in employee)
// @route   GET /api/leaves/my
// @access  Private
exports.getMyLeaves = async (req, res) => {
  try {
    const { status, fromDate, toDate } = req.query;
    const filter = { 
      isActive: true,
      appliedBy: req.user._id,
    };

    if (status) filter.status = status;
    if (fromDate) filter.fromDate = { $gte: new Date(fromDate) };
    if (toDate) filter.toDate = { ...filter.toDate, $lte: new Date(toDate) };

    const leaves = await Leave.find(filter)
      .populate('department', 'name')
      .populate('designation', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves,
    });
  } catch (error) {
    console.error('Error fetching my leaves:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch leaves',
    });
  }
};

// @desc    Get single leave
// @route   GET /api/leaves/:id
// @access  Private
exports.getLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate('employeeId', 'employee_name emp_no email phone_number')
      .populate('department', 'name code')
      .populate('designation', 'name')
      .populate('appliedBy', 'name email')
      .populate('workflow.history.actionBy', 'name email')
      .populate('approvals.hod.approvedBy', 'name email')
      .populate('approvals.hr.approvedBy', 'name email')
      .populate('approvals.final.approvedBy', 'name email');

    if (!leave) {
      return res.status(404).json({
        success: false,
        error: 'Leave application not found',
      });
    }

    // Get splits if leave has been split
    let splits = null;
    let splitSummary = null;
    if (leave.splitStatus === 'split_approved') {
      const leaveSplitService = require('../services/leaveSplitService');
      splits = await leaveSplitService.getSplits(leave._id);
      splitSummary = await leaveSplitService.getSplitSummary(leave._id);
    }

    const leaveData = leave.toObject();
    if (splits) {
      leaveData.splits = splits;
    }
    if (splitSummary) {
      leaveData.splitSummary = splitSummary;
    }

    res.status(200).json({
      success: true,
      data: leaveData,
    });
  } catch (error) {
    console.error('Error fetching leave:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch leave',
    });
  }
};

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
exports.applyLeave = async (req, res) => {
  try {
    const {
      leaveType,
      fromDate,
      toDate,
      purpose,
      contactNumber,
      emergencyContact,
      addressDuringLeave,
      isHalfDay,
      halfDayType,
      remarks,
      empNo, // Primary - emp_no for applying on behalf
      employeeId, // Legacy - for backward compatibility
    } = req.body;

    // Get employee - either from request body (HR applying for someone) or from user
    let employee;

    // Use empNo as primary identifier (from frontend)
    if (empNo) {
      // Check if user has permission to apply for others
      // Allow super_admin, hr, sub_admin (backward compatibility)
      const hasRolePermission = ['hr', 'sub_admin', 'super_admin'].includes(req.user.role);
      
      console.log(`[Apply Leave] User ${req.user._id} (${req.user.role}) applying for employee ${empNo}`);
      console.log(`[Apply Leave] Has role permission: ${hasRolePermission}`);
      
      // Check workspace permissions if user has active workspace
      let hasWorkspacePermission = false;
      if (req.user.activeWorkspaceId) {
        try {
          const leaveSettings = await LeaveSettings.findOne({ type: 'leave', isActive: true });
          if (leaveSettings?.settings?.workspacePermissions) {
            const workspaceIdStr = String(req.user.activeWorkspaceId);
            const permissions = leaveSettings.settings.workspacePermissions[workspaceIdStr];
            
            console.log(`[Apply Leave] Checking workspace ${workspaceIdStr} permissions:`, permissions);
            
            if (permissions) {
              // Handle both old format (boolean) and new format (object)
              if (typeof permissions === 'boolean') {
                hasWorkspacePermission = permissions; // Old format: boolean means canApplyForOthers
              } else {
                hasWorkspacePermission = permissions.canApplyForOthers || false; // New format
              }
            }
          } else {
            console.log(`[Apply Leave] No workspace permissions found in settings`);
          }
        } catch (error) {
          console.error('[Apply Leave] Error checking workspace permissions:', error);
        }
      } else {
        console.log(`[Apply Leave] User has no active workspace`);
      }
      
      console.log(`[Apply Leave] Has workspace permission: ${hasWorkspacePermission}`);
      
      // User must have either role permission OR workspace permission
      if (!hasRolePermission && !hasWorkspacePermission) {
        console.log(`[Apply Leave] ❌ Authorization denied - no role or workspace permission`);
        return res.status(403).json({
          success: false,
          error: 'Not authorized to apply leave for others',
        });
      }
      
      console.log(`[Apply Leave] ✅ Authorization granted`);
      
      // Find employee by emp_no (checks MongoDB first, then MSSQL based on settings)
      employee = await findEmployeeByEmpNo(empNo);
    } else if (employeeId) {
      // Legacy: Check if user has permission to apply for others
      // Allow super_admin, hr, sub_admin (backward compatibility)
      const hasRolePermission = ['hr', 'sub_admin', 'super_admin'].includes(req.user.role);
      
      console.log(`[Apply Leave] User ${req.user._id} (${req.user.role}) applying for employee ${employeeId} (legacy)`);
      console.log(`[Apply Leave] Has role permission: ${hasRolePermission}`);
      
      // Check workspace permissions if user has active workspace
      let hasWorkspacePermission = false;
      if (req.user.activeWorkspaceId) {
        try {
          const leaveSettings = await LeaveSettings.findOne({ type: 'leave', isActive: true });
          if (leaveSettings?.settings?.workspacePermissions) {
            const workspaceIdStr = String(req.user.activeWorkspaceId);
            const permissions = leaveSettings.settings.workspacePermissions[workspaceIdStr];
            
            console.log(`[Apply Leave] Checking workspace ${workspaceIdStr} permissions:`, permissions);
            
            if (permissions) {
              // Handle both old format (boolean) and new format (object)
              if (typeof permissions === 'boolean') {
                hasWorkspacePermission = permissions; // Old format: boolean means canApplyForOthers
              } else {
                hasWorkspacePermission = permissions.canApplyForOthers || false; // New format
              }
            }
          }
        } catch (error) {
          console.error('[Apply Leave] Error checking workspace permissions:', error);
        }
      }
      
      console.log(`[Apply Leave] Has workspace permission: ${hasWorkspacePermission}`);
      
      // User must have either role permission OR workspace permission
      if (!hasRolePermission && !hasWorkspacePermission) {
        console.log(`[Apply Leave] ❌ Authorization denied - no role or workspace permission`);
        return res.status(403).json({
          success: false,
          error: 'Not authorized to apply leave for others',
        });
      }
      
      console.log(`[Apply Leave] ✅ Authorization granted`);
      
      // Find employee by ID or emp_no
      employee = await findEmployeeByIdOrEmpNo(employeeId);
    } else {
      // Apply for self
      if (req.user.employeeRef) {
        employee = await findEmployeeByIdOrEmpNo(req.user.employeeRef);
      } else if (req.user.employeeId) {
        employee = await findEmployeeByEmpNo(req.user.employeeId);
      }
    }

    if (!employee) {
      return res.status(400).json({
        success: false,
        error: 'Employee record not found',
      });
    }

    // Get workflow settings
    const workflowSettings = await getWorkflowSettings();

    // Get resolved leave settings (department + global fallback)
    let resolvedLeaveSettings = null;
    if (employee.department_id) {
      resolvedLeaveSettings = await getResolvedLeaveSettings(employee.department_id);
    }

    // Calculate number of days
    const from = new Date(fromDate);
    const to = new Date(toDate);
    let numberOfDays;

    if (isHalfDay) {
      numberOfDays = 0.5;
    } else {
      const diffTime = Math.abs(to - from);
      numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }

    // Check leave limits using resolved settings - WARN ONLY, don't block
    const limitWarnings = [];
    if (resolvedLeaveSettings) {
      // Check daily limit (if set, 0 = unlimited)
      if (resolvedLeaveSettings.dailyLimit !== null && resolvedLeaveSettings.dailyLimit > 0) {
        if (numberOfDays > resolvedLeaveSettings.dailyLimit) {
          limitWarnings.push(`Leave duration (${numberOfDays} days) exceeds the recommended daily limit of ${resolvedLeaveSettings.dailyLimit} day(s) per application`);
        }
      }

      // Check monthly limit (if set, 0 = unlimited)
      if (resolvedLeaveSettings.monthlyLimit !== null && resolvedLeaveSettings.monthlyLimit > 0) {
        // Get month and year from fromDate
        const month = from.getMonth() + 1;
        const year = from.getFullYear();
        
        // Count approved/pending leaves for this employee in this month
        const Leave = require('../model/Leave');
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0, 23, 59, 59);
        
        const existingLeaves = await Leave.find({
          employeeId: employee._id,
          fromDate: { $gte: monthStart, $lte: monthEnd },
          status: { $in: ['pending', 'hod_approved', 'hr_approved', 'approved'] },
          isActive: true,
        });
        
        const totalDaysThisMonth = existingLeaves.reduce((sum, l) => sum + (l.numberOfDays || 0), 0);
        const newTotal = totalDaysThisMonth + numberOfDays;
        
        if (newTotal > resolvedLeaveSettings.monthlyLimit) {
          limitWarnings.push(`Total leave days for this month (${newTotal} days) would exceed the recommended monthly limit of ${resolvedLeaveSettings.monthlyLimit} days. Current month total: ${totalDaysThisMonth} days`);
        }
      }
    }

    // Validate against OD conflicts (with half-day support) - Only check APPROVED records for creation
    const { validateLeaveRequest } = require('../../shared/services/conflictValidationService');
    const validation = await validateLeaveRequest(
      employee._id,
      employee.emp_no,
      from,
      to,
      isHalfDay || false,
      isHalfDay ? halfDayType : null,
      true // approvedOnly = true for creation
    );

    // Block if there are errors (approved conflicts), but allow if only warnings (non-approved conflicts)
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.errors[0] || 'Validation failed',
        validationErrors: validation.errors,
        warnings: validation.warnings,
        conflictingODs: validation.conflictingODs,
      });
    }

    // Store warnings to include in success response
    const warnings = [...(validation.warnings || []), ...limitWarnings];

    // Create leave application
    const leave = new Leave({
      employeeId: employee._id,
      emp_no: employee.emp_no,
      leaveType,
      fromDate: from,
      toDate: to,
      numberOfDays,
      isHalfDay: isHalfDay || false,
      halfDayType: isHalfDay ? halfDayType : null,
      purpose,
      contactNumber,
      emergencyContact,
      addressDuringLeave,
      department: employee.department_id || employee.department, // Support both field names
      designation: employee.designation_id || employee.designation, // Support both field names
      appliedBy: req.user._id,
      appliedAt: new Date(),
      status: 'pending',
      remarks,
      workflow: {
        currentStep: 'hod',
        nextApprover: 'hod',
        history: [
          {
            step: 'employee',
            action: 'submitted',
            actionBy: req.user._id,
            actionByName: req.user.name,
            actionByRole: req.user.role,
            comments: 'Leave application submitted',
            timestamp: new Date(),
          },
        ],
      },
    });

    await leave.save();

    // Populate for response
    await leave.populate([
      { path: 'employeeId', select: 'first_name last_name emp_no' },
      { path: 'department', select: 'name' },
      { path: 'designation', select: 'name' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Leave application submitted successfully',
      data: leave,
      warnings: warnings.length > 0 ? warnings : undefined, // Include warnings if any
    });
  } catch (error) {
    console.error('Error applying leave:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply for leave',
    });
  }
};

// @desc    Update leave application
// @route   PUT /api/leaves/:id
// @access  Private
exports.updateLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        error: 'Leave application not found',
      });
    }

    // Check if can edit - Allow editing for pending, hod_approved, hr_approved (not final approved)
    // Super Admin can edit any status except final approved
    const isSuperAdmin = req.user.role === 'super_admin';
    const isFinalApproved = leave.status === 'approved';
    
    if (isFinalApproved && !isSuperAdmin) {
      return res.status(400).json({
        success: false,
        error: 'Final approved leave cannot be edited',
      });
    }

    // Check ownership or admin permission
    const isOwner = leave.appliedBy.toString() === req.user._id.toString();
    const isAdmin = ['hr', 'sub_admin', 'super_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this leave',
      });
    }

    const allowedUpdates = [
      'leaveType', 'fromDate', 'toDate', 'purpose', 'contactNumber',
      'emergencyContact', 'addressDuringLeave', 'isHalfDay', 'halfDayType', 'remarks'
    ];

    // Super Admin can also change status
    if (isSuperAdmin && req.body.status !== undefined) {
      const oldStatus = leave.status;
      const newStatus = req.body.status;
      
      if (oldStatus !== newStatus) {
        allowedUpdates.push('status');
        
        // Add status change to timeline
        if (!leave.workflow.history) {
          leave.workflow.history = [];
        }
        leave.workflow.history.push({
          step: 'admin',
          action: 'status_changed',
          actionBy: req.user._id,
          actionByName: req.user.name,
          actionByRole: req.user.role,
          comments: `Status changed from ${oldStatus} to ${newStatus}${req.body.statusChangeReason ? ': ' + req.body.statusChangeReason : ''}`,
          timestamp: new Date(),
        });
        
        // If changing status, also update workflow accordingly
        if (newStatus === 'pending') {
          leave.workflow.currentStep = 'hod';
          leave.workflow.nextApprover = 'hod';
        } else if (newStatus === 'hod_approved') {
          leave.workflow.currentStep = 'hr';
          leave.workflow.nextApprover = 'hr';
        } else if (newStatus === 'hr_approved') {
          leave.workflow.currentStep = 'final';
          leave.workflow.nextApprover = 'final_authority';
        } else if (newStatus === 'approved') {
          leave.workflow.currentStep = 'completed';
          leave.workflow.nextApprover = null;
        }
      }
    }

    // Clean up enum fields - convert empty strings to null
    if (req.body.halfDayType !== undefined) {
      if (req.body.halfDayType === '' || req.body.halfDayType === null) {
        req.body.halfDayType = null;
      }
    }

    // Track changes (max 2-3 changes)
    const changes = [];
    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined && leave[field] !== req.body[field]) {
        const originalValue = leave[field];
        let newValue = req.body[field];
        
        // Convert empty strings to null for enum fields
        if (field === 'halfDayType' && (newValue === '' || newValue === null)) {
          newValue = null;
        }
        
        // Store change
        changes.push({
          field: field,
          originalValue: originalValue,
          newValue: newValue,
          modifiedBy: req.user._id,
          modifiedByName: req.user.name,
          modifiedByRole: req.user.role,
          modifiedAt: new Date(),
          reason: req.body.changeReason || null,
        });
        
        leave[field] = newValue;
      }
    });

    // Add changes to history (keep only last 2-3 changes)
    if (changes.length > 0) {
      if (!leave.changeHistory) {
        leave.changeHistory = [];
      }
      leave.changeHistory.push(...changes);
      // Keep only last 3 changes
      if (leave.changeHistory.length > 3) {
        leave.changeHistory = leave.changeHistory.slice(-3);
      }
    }

    // Recalculate days if dates changed
    if (req.body.fromDate || req.body.toDate || req.body.isHalfDay !== undefined) {
      if (leave.isHalfDay) {
        leave.numberOfDays = 0.5;
      } else {
        const diffTime = Math.abs(leave.toDate - leave.fromDate);
        leave.numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      }
    }

    await leave.save();

    // Populate for response
    await leave.populate([
      { path: 'employeeId', select: 'employee_name emp_no' },
      { path: 'department', select: 'name' },
      { path: 'designation', select: 'name' },
      { path: 'changeHistory.modifiedBy', select: 'name email role' },
    ]);

    res.status(200).json({
      success: true,
      message: 'Leave updated successfully',
      data: leave,
      changes: changes,
    });
  } catch (error) {
    console.error('Error updating leave:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update leave',
    });
  }
};

// @desc    Cancel leave application
// @route   PUT /api/leaves/:id/cancel
// @access  Private
exports.cancelLeave = async (req, res) => {
  try {
    const { reason } = req.body;
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        error: 'Leave application not found',
      });
    }

    // Check if can cancel
    if (!leave.canCancel()) {
      return res.status(400).json({
        success: false,
        error: 'Leave cannot be cancelled in current status',
      });
    }

    // Check ownership or admin permission
    const isOwner = leave.appliedBy.toString() === req.user._id.toString();
    const isAdmin = ['hr', 'sub_admin', 'super_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to cancel this leave',
      });
    }

    leave.status = 'cancelled';
    leave.cancellation = {
      cancelledBy: req.user._id,
      cancelledAt: new Date(),
      reason: reason || 'Cancelled by user',
    };
    leave.workflow.currentStep = 'completed';
    leave.workflow.nextApprover = null;
    leave.workflow.history.push({
      step: 'cancellation',
      action: 'cancelled',
      actionBy: req.user._id,
      actionByName: req.user.name,
      actionByRole: req.user.role,
      comments: reason || 'Leave application cancelled',
      timestamp: new Date(),
    });

    await leave.save();

    res.status(200).json({
      success: true,
      message: 'Leave cancelled successfully',
      data: leave,
    });
  } catch (error) {
    console.error('Error cancelling leave:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel leave',
    });
  }
};

// @desc    Get pending approvals for current user
// @route   GET /api/leaves/pending-approvals
// @access  Private
exports.getPendingApprovals = async (req, res) => {
  try {
    const userRole = req.user.role;
    let filter = { isActive: true };

    // Determine what the user can approve based on their role
    if (userRole === 'hod') {
      // HOD can only see their department's leaves
      filter['workflow.nextApprover'] = 'hod';
      if (req.user.department) {
        filter.department = req.user.department;
      }
    } else if (userRole === 'hr') {
      // HR can see leaves waiting for HR approval
      filter['workflow.nextApprover'] = { $in: ['hr', 'final_authority'] };
    } else if (['sub_admin', 'super_admin'].includes(userRole)) {
      // Admin can see all pending
      filter.status = { $nin: ['approved', 'rejected', 'cancelled'] };
    } else {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view pending approvals',
      });
    }

    const leaves = await Leave.find(filter)
      .populate('employeeId', 'employee_name emp_no')
      .populate('department', 'name')
      .populate('designation', 'name')
      .sort({ appliedAt: -1 });

    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves,
    });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pending approvals',
    });
  }
};

// @desc    Process leave action (approve/reject/forward)
// @route   PUT /api/leaves/:id/action
// @access  Private (HOD, HR, Admin)
exports.processLeaveAction = async (req, res) => {
  try {
    const { action, comments } = req.body;
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        error: 'Leave application not found',
      });
    }

    const userRole = req.user.role;
    const currentApprover = leave.workflow.nextApprover;

    // Validate user can perform this action
    let canProcess = false;
    if (currentApprover === 'hod' && userRole === 'hod') {
      // HOD can process if leave is in their department
      canProcess = !req.user.department || 
        leave.department?.toString() === req.user.department?.toString();
    } else if (currentApprover === 'hr' && userRole === 'hr') {
      canProcess = true;
    } else if (currentApprover === 'final_authority' && userRole === 'hr') {
      canProcess = true;
    } else if (['sub_admin', 'super_admin'].includes(userRole)) {
      canProcess = true;
    }

    if (!canProcess) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to process this leave application',
      });
    }

    // Process based on action
    const historyEntry = {
      step: currentApprover,
      actionBy: req.user._id,
      actionByName: req.user.name,
      actionByRole: userRole,
      comments: comments || '',
      timestamp: new Date(),
    };

    // Declare approvalWarnings at function level so it's available for all actions
    let approvalWarnings = [];

    switch (action) {
      case 'approve':
        // Check leave limits and generate warnings (don't block, just warn)
        approvalWarnings = [];
        const Employee = require('../../employees/model/Employee');
        const employee = await Employee.findById(leave.employeeId);
        
        if (employee && employee.department_id) {
          const resolvedLeaveSettings = await getResolvedLeaveSettings(employee.department_id);
          
          if (resolvedLeaveSettings) {
            // Check daily limit
            if (resolvedLeaveSettings.dailyLimit !== null && resolvedLeaveSettings.dailyLimit > 0) {
              if (leave.numberOfDays > resolvedLeaveSettings.dailyLimit) {
                approvalWarnings.push(`⚠️ Leave duration (${leave.numberOfDays} days) exceeds the recommended daily limit of ${resolvedLeaveSettings.dailyLimit} day(s) per application`);
              }
            }

            // Check monthly limit
            if (resolvedLeaveSettings.monthlyLimit !== null && resolvedLeaveSettings.monthlyLimit > 0) {
              const from = new Date(leave.fromDate);
              const month = from.getMonth() + 1;
              const year = from.getFullYear();
              const monthStart = new Date(year, month - 1, 1);
              const monthEnd = new Date(year, month, 0, 23, 59, 59);
              
              const existingLeaves = await Leave.find({
                employeeId: leave.employeeId,
                fromDate: { $gte: monthStart, $lte: monthEnd },
                status: { $in: ['hod_approved', 'hr_approved', 'approved'] },
                isActive: true,
                _id: { $ne: leave._id }, // Exclude current leave
              });
              
              const totalDaysThisMonth = existingLeaves.reduce((sum, l) => sum + (l.numberOfDays || 0), 0);
              const newTotal = totalDaysThisMonth + leave.numberOfDays;
              
              if (newTotal > resolvedLeaveSettings.monthlyLimit) {
                approvalWarnings.push(`⚠️ Total leave days for this month (${newTotal} days) would exceed the recommended monthly limit of ${resolvedLeaveSettings.monthlyLimit} days. Current month total: ${totalDaysThisMonth} days`);
              }
            }
          }
        }

        // Before final approval, validate against all approved records
        if (currentApprover === 'hr' || currentApprover === 'final_authority') {
          const { validateLeaveRequest } = require('../../shared/services/conflictValidationService');
          const validation = await validateLeaveRequest(
            leave.employeeId,
            leave.emp_no,
            leave.fromDate,
            leave.toDate,
            leave.isHalfDay || false,
            leave.halfDayType || null,
            false // approvedOnly = false for approval (check all approved records)
          );

          if (!validation.isValid) {
            return res.status(400).json({
              success: false,
              error: validation.errors[0] || 'Cannot approve: Conflict with existing approved records',
              validationErrors: validation.errors,
              conflictingODs: validation.conflictingODs,
            });
          }
        }

        if (currentApprover === 'hod') {
          // HOD approval - move to HR
          leave.status = 'hod_approved';
          leave.approvals.hod = {
            status: 'approved',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };
          leave.workflow.currentStep = 'hr';
          leave.workflow.nextApprover = 'hr';
          historyEntry.action = 'approved';
        } else if (currentApprover === 'hr' || currentApprover === 'final_authority') {
          // Final approval
          leave.status = 'approved';
          leave.approvals.hr = {
            status: 'approved',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };
          leave.workflow.currentStep = 'completed';
          leave.workflow.nextApprover = null;
          historyEntry.action = 'approved';
          
          // Store approval timestamp for revocation window (2-3 hours)
          leave.approvals.hr.approvedAt = new Date();
        }
        
        // Add warnings to history entry if any
        if (approvalWarnings.length > 0) {
          historyEntry.warnings = approvalWarnings;
        }
        
        break;

      case 'reject':
        if (currentApprover === 'hod') {
          leave.status = 'hod_rejected';
          leave.approvals.hod = {
            status: 'rejected',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };
        } else {
          leave.status = 'hr_rejected';
          leave.approvals.hr = {
            status: 'rejected',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };
        }
        leave.workflow.currentStep = 'completed';
        leave.workflow.nextApprover = null;
        historyEntry.action = 'rejected';
        break;

      case 'forward':
        // HOD forwards to HR
        if (currentApprover !== 'hod') {
          return res.status(400).json({
            success: false,
            error: 'Only HOD can forward leave applications',
          });
        }
        leave.status = 'hod_approved';
        leave.approvals.hod = {
          status: 'forwarded',
          approvedBy: req.user._id,
          approvedAt: new Date(),
          comments,
        };
        leave.workflow.currentStep = 'hr';
        leave.workflow.nextApprover = 'hr';
        historyEntry.action = 'forwarded';
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action',
        });
    }

    leave.workflow.history.push(historyEntry);
    await leave.save();

    // Populate for response
    await leave.populate([
      { path: 'employeeId', select: 'first_name last_name emp_no' },
      { path: 'department', select: 'name' },
    ]);

    // Include warnings in response if any
    const response = {
      success: true,
      message: `Leave ${action}ed successfully`,
      data: leave,
    };
    
    if (approvalWarnings && approvalWarnings.length > 0) {
      response.warnings = approvalWarnings;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error processing leave action:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process leave action',
    });
  }
};

// @desc    Revoke leave approval (within 2-3 hours)
// @route   PUT /api/leaves/:id/revoke
// @access  Private (HOD, HR, Super Admin)
exports.revokeLeaveApproval = async (req, res) => {
  try {
    const { reason } = req.body;
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        error: 'Leave application not found',
      });
    }

    // Check if leave is approved
    if (leave.status !== 'approved' && leave.status !== 'hod_approved' && leave.status !== 'hr_approved') {
      return res.status(400).json({
        success: false,
        error: 'Only approved or partially approved leaves can be revoked',
      });
    }

    // Check revocation window (2-3 hours)
    const approvalTime = leave.approvals.hr?.approvedAt || leave.approvals.hod?.approvedAt;
    if (!approvalTime) {
      return res.status(400).json({
        success: false,
        error: 'No approval timestamp found',
      });
    }

    const hoursSinceApproval = (new Date() - new Date(approvalTime)) / (1000 * 60 * 60);
    const revocationWindow = 3; // 3 hours window

    if (hoursSinceApproval > revocationWindow) {
      return res.status(400).json({
        success: false,
        error: `Approval can only be revoked within ${revocationWindow} hours. ${hoursSinceApproval.toFixed(1)} hours have passed.`,
      });
    }

    // Check authorization
    const userRole = req.user.role;
    const isApprover = 
      (leave.approvals.hod?.approvedBy?.toString() === req.user._id.toString()) ||
      (leave.approvals.hr?.approvedBy?.toString() === req.user._id.toString());
    const isAdmin = ['hr', 'sub_admin', 'super_admin'].includes(userRole);

    if (!isApprover && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to revoke this approval',
      });
    }

    // Revoke approval - revert to previous status
    if (leave.status === 'approved') {
      // If fully approved, revert to hr_approved or hod_approved
      if (leave.approvals.hr?.status === 'approved') {
        leave.status = 'hr_approved';
        leave.approvals.hr.status = null;
        leave.approvals.hr.approvedBy = null;
        leave.approvals.hr.approvedAt = null;
        leave.workflow.currentStep = 'hr';
        leave.workflow.nextApprover = 'hr';
      }
    } else if (leave.status === 'hr_approved') {
      leave.status = 'hod_approved';
      leave.approvals.hr.status = null;
      leave.approvals.hr.approvedBy = null;
      leave.approvals.hr.approvedAt = null;
      leave.workflow.currentStep = 'hr';
      leave.workflow.nextApprover = 'hr';
    } else if (leave.status === 'hod_approved') {
      leave.status = 'pending';
      leave.approvals.hod.status = null;
      leave.approvals.hod.approvedBy = null;
      leave.approvals.hod.approvedAt = null;
      leave.workflow.currentStep = 'hod';
      leave.workflow.nextApprover = 'hod';
    }

    // Add to timeline (only once)
    leave.workflow.history.push({
      step: userRole,
      action: 'revoked',
      actionBy: req.user._id,
      actionByName: req.user.name,
      actionByRole: userRole,
      comments: reason || `Approval revoked by ${req.user.name}`,
      timestamp: new Date(),
    });

    await leave.save();

    res.status(200).json({
      success: true,
      message: 'Leave approval revoked successfully',
      data: leave,
    });
  } catch (error) {
    console.error('Error revoking leave approval:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to revoke leave approval',
    });
  }
};

// @desc    Delete leave (soft delete)
// @route   DELETE /api/leaves/:id
// @access  Private (Admin)
exports.deleteLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        error: 'Leave application not found',
      });
    }

    // Only admin can delete
    if (!['sub_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete leave applications',
      });
    }

    leave.isActive = false;
    await leave.save();

    res.status(200).json({
      success: true,
      message: 'Leave deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting leave:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete leave',
    });
  }
};

// @desc    Get leave statistics
// @route   GET /api/leaves/stats
// @access  Private
exports.getLeaveStats = async (req, res) => {
  try {
    const { employeeId, department, year } = req.query;
    const filter = { isActive: true };

    if (employeeId) {
      filter.employeeId = employeeId;
    } else if (req.user.employeeRef) {
      filter.employeeId = req.user.employeeRef;
    }

    if (department) {
      filter.department = department;
    }

    if (year) {
      const startOfYear = new Date(`${year}-01-01`);
      const endOfYear = new Date(`${year}-12-31`);
      filter.fromDate = { $gte: startOfYear, $lte: endOfYear };
    }

    const stats = await Leave.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { leaveType: '$leaveType', status: '$status' },
          count: { $sum: 1 },
          totalDays: { $sum: '$numberOfDays' },
        },
      },
    ]);

    const summary = {
      byType: {},
      byStatus: {},
      totalApplied: 0,
      totalApproved: 0,
      totalPending: 0,
      totalRejected: 0,
      totalDays: 0,
    };

    stats.forEach((stat) => {
      const { leaveType, status } = stat._id;

      // By type
      if (!summary.byType[leaveType]) {
        summary.byType[leaveType] = { count: 0, days: 0 };
      }
      summary.byType[leaveType].count += stat.count;
      summary.byType[leaveType].days += stat.totalDays;

      // By status
      if (!summary.byStatus[status]) {
        summary.byStatus[status] = { count: 0, days: 0 };
      }
      summary.byStatus[status].count += stat.count;
      summary.byStatus[status].days += stat.totalDays;

      // Totals
      summary.totalApplied += stat.count;
      summary.totalDays += stat.totalDays;

      if (status === 'approved') {
        summary.totalApproved += stat.count;
      } else if (['pending', 'hod_approved'].includes(status)) {
        summary.totalPending += stat.count;
      } else if (['rejected', 'hod_rejected', 'hr_rejected'].includes(status)) {
        summary.totalRejected += stat.count;
      }
    });

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error fetching leave stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch leave statistics',
    });
  }
};

// @desc    Get approved records for a date (for conflict checking in frontend)
// @route   GET /api/leaves/approved-records
// @access  Private
exports.getApprovedRecordsForDate = async (req, res) => {
  try {
    const { employeeId, employeeNumber, date } = req.query;

    if (!employeeId && !employeeNumber) {
      return res.status(400).json({
        success: false,
        error: 'Employee ID or employee number is required',
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date is required',
      });
    }

    const { getApprovedRecordsForDate } = require('../../shared/services/conflictValidationService');
    const result = await getApprovedRecordsForDate(employeeId, employeeNumber, date);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching approved records:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch approved records',
    });
  }
};

/**
 * @desc    Get leave conflicts for an attendance date
 * @route   GET /api/leaves/conflicts
 * @access  Private
 */
exports.getLeaveConflicts = async (req, res) => {
  try {
    const { employeeNumber, date } = req.query;

    if (!employeeNumber || !date) {
      return res.status(400).json({
        success: false,
        message: 'Employee number and date are required',
      });
    }

    const result = await getLeaveConflicts(employeeNumber, date);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.status(200).json({
      success: true,
      data: result.conflicts,
    });

  } catch (error) {
    console.error('Error getting leave conflicts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get leave conflicts',
    });
  }
};

/**
 * @desc    Revoke full-day leave when attendance is logged
 * @route   POST /api/leaves/:id/revoke-for-attendance
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.revokeLeaveForAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    const userId = req.user?.userId || req.user?._id;
    const userName = req.user?.name || 'System';
    const userRole = req.user?.role || 'system';

    const result = await revokeFullDayLeave(id, userId, userName, userRole);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.leave,
    });

  } catch (error) {
    console.error('Error revoking leave for attendance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to revoke leave',
    });
  }
};

/**
 * @desc    Update leave based on attendance (for multi-day leaves)
 * @route   POST /api/leaves/:id/update-for-attendance
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.updateLeaveForAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeNumber, date } = req.body;

    if (!employeeNumber || !date) {
      return res.status(400).json({
        success: false,
        message: 'Employee number and date are required',
      });
    }

    // Get attendance record
    const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
    const attendance = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shiftId');

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found',
      });
    }

    const userId = req.user?.userId || req.user?._id;
    const userName = req.user?.name || 'System';
    const userRole = req.user?.role || 'system';

    const result = await updateLeaveForAttendance(
      id,
      date,
      attendance,
      userId,
      userName,
      userRole
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        updatedLeaves: result.updatedLeaves || [],
        createdLeaves: result.createdLeaves || [],
        deletedLeaveId: result.deletedLeaveId || null,
      },
    });

  } catch (error) {
    console.error('Error updating leave for attendance:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update leave',
    });
  }
};

// @desc    Create splits for a leave
// @route   POST /api/leaves/:id/split
// @access  Private (HOD, HR, Admin)
exports.createLeaveSplits = async (req, res) => {
  try {
    const { splits } = req.body;
    const leaveId = req.params.id;

    if (!splits || !Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Splits array is required',
      });
    }

    const leaveSplitService = require('../services/leaveSplitService');
    const result = await leaveSplitService.createSplits(leaveId, splits, req.user);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.errors,
        warnings: result.warnings || [],
      });
    }

    res.status(200).json({
      success: true,
      message: 'Leave splits created successfully',
      data: result.data,
      warnings: result.warnings || [],
    });
  } catch (error) {
    console.error('Error creating leave splits:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create leave splits',
    });
  }
};

// @desc    Get splits for a leave
// @route   GET /api/leaves/:id/splits
// @access  Private
exports.getLeaveSplits = async (req, res) => {
  try {
    const leaveId = req.params.id;
    const leaveSplitService = require('../services/leaveSplitService');
    const splits = await leaveSplitService.getSplits(leaveId);

    res.status(200).json({
      success: true,
      data: splits,
    });
  } catch (error) {
    console.error('Error getting leave splits:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get leave splits',
    });
  }
};

// @desc    Get split summary for a leave
// @route   GET /api/leaves/:id/split-summary
// @access  Private
exports.getLeaveSplitSummary = async (req, res) => {
  try {
    const leaveId = req.params.id;
    const leaveSplitService = require('../services/leaveSplitService');
    const summary = await leaveSplitService.getSplitSummary(leaveId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Leave not found or has no splits',
      });
    }

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error getting leave split summary:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get leave split summary',
    });
  }
};

// @desc    Update a single split
// @route   PUT /api/leaves/:id/splits/:splitId
// @access  Private (HOD, HR, Admin)
exports.updateLeaveSplit = async (req, res) => {
  try {
    const { splitId } = req.params;
    const updateData = req.body;

    const leaveSplitService = require('../services/leaveSplitService');
    const result = await leaveSplitService.updateSplit(splitId, updateData, req.user);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.errors,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Split updated successfully',
      data: result.data,
    });
  } catch (error) {
    console.error('Error updating leave split:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update leave split',
    });
  }
};

// @desc    Delete a split
// @route   DELETE /api/leaves/:id/splits/:splitId
// @access  Private (HOD, HR, Admin)
exports.deleteLeaveSplit = async (req, res) => {
  try {
    const { splitId } = req.params;

    const leaveSplitService = require('../services/leaveSplitService');
    const result = await leaveSplitService.deleteSplit(splitId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        errors: result.errors,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Split deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting leave split:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete leave split',
    });
  }
};

// @desc    Validate splits before creating
// @route   POST /api/leaves/:id/validate-splits
// @access  Private (HOD, HR, Admin)
exports.validateLeaveSplits = async (req, res) => {
  try {
    const { splits } = req.body;
    const leaveId = req.params.id;

    if (!splits || !Array.isArray(splits)) {
      return res.status(400).json({
        success: false,
        error: 'Splits array is required',
      });
    }

    const leaveSplitService = require('../services/leaveSplitService');
    const validation = await leaveSplitService.validateSplits(leaveId, splits);

    res.status(200).json({
      success: validation.isValid,
      isValid: validation.isValid,
      errors: validation.errors || [],
      warnings: validation.warnings || [],
      totalSplitDays: validation.totalSplitDays || 0,
      originalTotalDays: validation.originalTotalDays || 0,
    });
  } catch (error) {
    console.error('Error validating leave splits:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to validate leave splits',
    });
  }
};

