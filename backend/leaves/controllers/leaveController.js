const mongoose = require('mongoose');
const Leave = require('../model/Leave');
const LeaveSettings = require('../model/LeaveSettings');
const Employee = require('../../employees/model/Employee');
const User = require('../../users/model/User');
const Settings = require('../../settings/model/Settings');
const { isHRMSConnected, getEmployeeByIdMSSQL } = require('../../employees/config/mssqlHelper');

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

    res.status(200).json({
      success: true,
      data: leave,
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

    // Check if can edit
    if (!leave.canEdit()) {
      return res.status(400).json({
        success: false,
        error: 'Leave cannot be edited in current status',
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

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        leave[field] = req.body[field];
      }
    });

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

    res.status(200).json({
      success: true,
      message: 'Leave updated successfully',
      data: leave,
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

    switch (action) {
      case 'approve':
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

    res.status(200).json({
      success: true,
      message: `Leave ${action}ed successfully`,
      data: leave,
    });
  } catch (error) {
    console.error('Error processing leave action:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process leave action',
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

