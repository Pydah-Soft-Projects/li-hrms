/**
 * Permission Controller
 * Handles permission requests, approval, and outpass management
 */

const Permission = require('../model/Permission');
const { createPermissionRequest, approvePermissionRequest, rejectPermissionRequest, getOutpassByQR } = require('../services/permissionService');
const {
  buildWorkflowVisibilityFilter,
  getEmployeeIdsInScope
} = require('../../shared/middleware/dataScopeMiddleware');

/**
 * @desc    Create permission request
 * @route   POST /api/permissions
 * @access  Private
 */
exports.createPermission = async (req, res) => {
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
      geoLocation
    } = req.body;

    if (!employeeId || !employeeNumber || !date || !permissionStartTime || !permissionEndTime || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Employee, date, permission times, and purpose are required',
      });
    }

    // Validate Date (Must be today or future)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    if (checkDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Permission requests are restricted to current or future dates only.'
      });
    }

    // --- SCOPING & AUTHORIZATION (New Logic) ---

    const isSelf = (!employeeNumber && !employeeId) ||
      (employeeNumber && employeeNumber.toUpperCase() === req.user.employeeId?.toUpperCase()) ||
      (employeeId && employeeId.toString() === req.user.employeeRef?.toString());

    const isGlobalAdmin = ['hr', 'sub_admin', 'super_admin'].includes(req.user.role);
    const isScopedAdmin = ['hod', 'manager'].includes(req.user.role);

    // 1. SELF APPLICATION (Always Allowed)
    if (isSelf) {
      // Proceed - no special checks needed
    }
    // 2. ADMIN APPLICATION (Global Scope)
    else if (isGlobalAdmin) {
      // Proceed - global admins can apply for anyone
    }
    // 3. SCOPED ADMIN APPLICATION (HOD/Manager)
    else if (isScopedAdmin) {
      // We need to resolve the target employee to check scope
      const Employee = require('../../employees/model/Employee');

      let targetEmployee = null;
      if (employeeNumber) {
        targetEmployee = await Employee.findOne({ emp_no: employeeNumber });
      } else if (employeeId) {
        targetEmployee = await Employee.findById(employeeId);
      }

      if (!targetEmployee) {
        return res.status(400).json({
          success: false,
          message: 'Employee record not found for scope verification'
        });
      }

      // Verify Scope
      const { allowedDivisions, divisionMapping } = req.user;

      const employeeDivisionId = targetEmployee.division_id?.toString();
      const isDivisionScoped = allowedDivisions?.some(divId => divId.toString() === employeeDivisionId);

      let isDepartmentScoped = false;
      const targetDeptId = (targetEmployee.department_id || targetEmployee.department)?.toString();

      if (isDivisionScoped) {
        if (!divisionMapping || divisionMapping.length === 0) {
          isDepartmentScoped = true; // All departments in this division
        } else {
          const mapping = divisionMapping.find(m => m.division?.toString() === employeeDivisionId);
          if (mapping) {
            if (!mapping.departments || mapping.departments.length === 0) {
              isDepartmentScoped = true;
            } else {
              isDepartmentScoped = mapping.departments.some(d => d.toString() === targetDeptId);
            }
          }
        }
      }

      // Direct Department Check (fallback for HOD/unmapped Managers)
      if (!isDepartmentScoped) {
        if (req.user.department && req.user.department.toString() === targetDeptId) {
          isDepartmentScoped = true;
        } else if (req.user.departments && req.user.departments.length > 0) {
          isDepartmentScoped = req.user.departments.some(d => d.toString() === targetDeptId);
        }
      }

      if (!isDivisionScoped && !isDepartmentScoped) {
        return res.status(403).json({
          success: false,
          message: `You are not authorized to apply for permissions for employees outside your assigned data scope.`
        });
      }
    }
    // 4. UNAUTHORIZED ROLE
    else {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to apply for permissions for others.'
      });
    }

    // --- END SCOPING ---

    const result = await createPermissionRequest(
      {
        employeeId,
        employeeNumber,
        date,
        permissionStartTime,
        permissionEndTime,
        purpose,
        comments,
        photoEvidence,
        geoLocation
      },
      req.user?.userId || req.user?._id
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    const permissionRequest = await Permission.findById(result.data._id)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('requestedBy', 'name email');

    res.status(201).json({
      success: true,
      message: result.message,
      data: permissionRequest,
    });

  } catch (error) {
    console.error('Error creating permission:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating permission request',
      error: error.message,
    });
  }
};

/**
 * @desc    Get permission requests
 * @route   GET /api/permissions
 * @access  Private
 */
exports.getPermissions = async (req, res) => {
  try {
    const { employeeId, employeeNumber, date, status, startDate, endDate } = req.query;

    const query = { isActive: true };

    if (employeeId) query.employeeId = employeeId;
    if (employeeNumber) query.employeeNumber = employeeNumber.toUpperCase();
    if (date) query.date = date;
    if (status) query.status = status;
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    // Apply Sequential Workflow Visibility ("Travel Flow")
    const workflowFilter = buildWorkflowVisibilityFilter(req.user);

    // Employee-First Scoping: (Scope + Workflow) OR (Reporting-based: employee reports to me, all statuses)
    const scopedEmployeeIds = await getEmployeeIdsInScope(req.scopedUser || req.user);
    const reportingToMeIds = req.reportingToMeEmployeeIds || [];

    const scopeOrFilter = [
      ...(reportingToMeIds.length > 0 ? [{ employeeId: { $in: reportingToMeIds } }] : []),
      ...(scopedEmployeeIds.length > 0 ? [{ $and: [{ employeeId: { $in: scopedEmployeeIds } }, workflowFilter] }] : [])
    ];

    const scopeFilter = scopeOrFilter.length > 0 ? { $or: scopeOrFilter } : req.scopeFilter || {};
    const combinedQuery = { $and: [query, scopeFilter] };

    const permissions = await Permission.find(combinedQuery)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('requestedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ date: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: permissions,
      count: permissions.length,
    });

  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching permission requests',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single permission request
 * @route   GET /api/permissions/:id
 * @access  Private
 */
exports.getPermission = async (req, res) => {
  try {
    const permission = await Permission.findById(req.params.id)
      .populate('employeeId', 'emp_no employee_name department designation photo')
      .populate('requestedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email');

    if (!permission) {
      return res.status(404).json({
        success: false,
        message: 'Permission request not found',
      });
    }

    res.status(200).json({
      success: true,
      data: permission,
    });

  } catch (error) {
    console.error('Error fetching permission:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching permission request',
      error: error.message,
    });
  }
};

/**
 * @desc    Approve permission request
 * @route   PUT /api/permissions/:id/approve
 * @access  Private (HOD, HR, Super Admin)
 */
exports.approvePermission = async (req, res) => {
  try {
    // Get base URL from request (for outpass URL)
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const result = await approvePermissionRequest(
      req.params.id,
      req.user?.userId || req.user?._id,
      baseUrl,
      req.user?.role
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    const permission = await Permission.findById(req.params.id)
      .populate('employeeId', 'emp_no employee_name department designation photo')
      .populate('approvedBy', 'name email');

    // Include warnings in response if any
    const response = {
      success: true,
      message: result.message,
      data: permission,
    };

    if (result.warnings && result.warnings.length > 0) {
      response.warnings = result.warnings;
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Error approving permission:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving permission request',
      error: error.message,
    });
  }
};

/**
 * @desc    Reject permission request
 * @route   PUT /api/permissions/:id/reject
 * @access  Private (HOD, HR, Super Admin)
 */
exports.rejectPermission = async (req, res) => {
  try {
    const { reason } = req.body;

    const result = await rejectPermissionRequest(
      req.params.id,
      req.user?.userId || req.user?._id,
      reason,
      req.user?.role
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    const permission = await Permission.findById(req.params.id)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('rejectedBy', 'name email');

    res.status(200).json({
      success: true,
      message: result.message,
      data: permission,
    });

  } catch (error) {
    console.error('Error rejecting permission:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting permission request',
      error: error.message,
    });
  }
};

/**
 * @desc    Get outpass by QR code (Public endpoint)
 * @route   GET /api/permissions/outpass/:qrCode
 * @access  Public
 */
exports.getOutpass = async (req, res) => {
  try {
    const { qrCode } = req.params;

    const result = await getOutpassByQR(qrCode);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json({
      success: true,
      data: result.data,
    });

  } catch (error) {
    console.error('Error getting outpass:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting outpass',
      error: error.message,
    });
  }
};

/**
 * @desc    Get QR code for permission
 * @route   GET /api/permissions/:id/qr
 * @access  Private
 */
exports.getQRCode = async (req, res) => {
  try {
    const permission = await Permission.findById(req.params.id)
      .populate('employeeId', 'emp_no employee_name department designation');

    if (!permission) {
      return res.status(404).json({
        success: false,
        message: 'Permission request not found',
      });
    }

    if (permission.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Permission must be approved to generate QR code',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        qrCode: permission.qrCode,
        qrUrl: permission.outpassUrl,
        qrExpiry: permission.qrExpiry,
        permission: permission,
      },
    });

  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting QR code',
      error: error.message,
    });
  }
};

