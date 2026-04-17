/**
 * Permission Controller
 * Handles permission requests, approval, and outpass management
 */

const Permission = require('../model/Permission');
const PermissionDeductionSettings = require('../model/PermissionDeductionSettings');
const { createPermissionRequest, approvePermissionRequest, rejectPermissionRequest, getOutpassByQR } = require('../services/permissionService');
const {
  buildWorkflowVisibilityFilter,
  getEmployeeIdsInScope
} = require('../../shared/middleware/dataScopeMiddleware');
const { notifyWorkflowEvent } = require('../../notifications/services/notificationService');

const formatPermissionDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatPermissionTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const permissionTypeLabel = (type) => {
  if (type === 'late_in') return 'Late In';
  if (type === 'early_out') return 'Early Out';
  return 'Mid Shift';
};

const buildPermissionWindowText = (permission) => {
  const pType = permission?.permissionType || 'mid_shift';
  if (pType === 'late_in' && permission?.permittedEdgeTime) {
    return `Late-In allowed till ${permission.permittedEdgeTime}`;
  }
  if (pType === 'early_out' && permission?.permittedEdgeTime) {
    return `Early-Out allowed from ${permission.permittedEdgeTime}`;
  }
  const start = formatPermissionTime(permission?.permissionStartTime);
  const end = formatPermissionTime(permission?.permissionEndTime);
  return start && end ? `${start} - ${end}` : 'Time not specified';
};

const buildPermissionLocationText = (permission) => {
  const parts = [];
  if (permission?.geoLocation?.address) parts.push(String(permission.geoLocation.address).trim());
  if (permission?.geoLocation?.latitude != null && permission?.geoLocation?.longitude != null) {
    parts.push(`Lat ${permission.geoLocation.latitude}, Lng ${permission.geoLocation.longitude}`);
  }
  return parts.length ? parts.join(' | ') : 'Location not captured';
};

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
      geoLocation,
      permissionType,
      permittedEdgeTime,
    } = req.body;

    const normType = ['mid_shift', 'late_in', 'early_out'].includes(permissionType)
      ? permissionType
      : 'mid_shift';

    if (!employeeId || !employeeNumber || !date || !purpose) {
      return res.status(400).json({
        success: false,
        message: 'Employee, date, and purpose are required',
      });
    }

    if (normType === 'mid_shift' && (!permissionStartTime || !permissionEndTime)) {
      return res.status(400).json({
        success: false,
        message: 'Permission start and end times are required for mid-shift permission',
      });
    }

    // Validate date window from Permission settings.
    if (req.user?.role !== 'super_admin') {
      const settings = await PermissionDeductionSettings.getActiveSettings();
      const policy = settings || {
        allowBackdated: false,
        maxBackdatedDays: 0,
        allowFutureDated: true,
        maxAdvanceDays: 365,
      };

      const now = new Date();
      const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const today = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate());
      const minDate = new Date(today);
      const maxDate = new Date(today);

      if (policy.allowBackdated && (policy.maxBackdatedDays ?? 0) > 0) {
        minDate.setDate(minDate.getDate() - Number(policy.maxBackdatedDays || 0));
      }
      if (policy.allowFutureDated && (policy.maxAdvanceDays ?? 0) > 0) {
        maxDate.setDate(maxDate.getDate() + Number(policy.maxAdvanceDays || 0));
      }

      const toYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const minDateStr = toYmd(minDate);
      const maxDateStr = toYmd(maxDate);

      if (date < minDateStr || date > maxDateStr) {
        return res.status(400).json({
          success: false,
          message: `Permission date must be within allowed range (${minDateStr} to ${maxDateStr}) as per Permission settings.`,
        });
      }
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

      const scopedEmployeeIds = await getEmployeeIdsInScope(req.user);
      const isInScope = scopedEmployeeIds.some(id => id.toString() === targetEmployee._id.toString());

      if (!isInScope) {
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
        geoLocation,
        permissionType: normType,
        permittedEdgeTime,
      },
      req.user?.userId || req.user?._id
    );

    if (!result.success) {
      return res.status(result.statusCode || 400).json(result);
    }

    const permissionRequest = await Permission.findById(result.data._id)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('requestedBy', 'name email');

    res.status(201).json({
      success: true,
      message: result.message,
      data: permissionRequest,
    });

    notifyWorkflowEvent({
      module: 'ot_permission',
      eventType: 'OT_PERMISSION_APPLIED',
      record: permissionRequest,
      actor: req.user,
      title: `Permission Submitted: ${permissionRequest?.employeeId?.employee_name || permissionRequest?.employeeNumber}`,
      message: `${permissionRequest?.employeeId?.employee_name || permissionRequest?.employeeNumber} submitted ${permissionTypeLabel(permissionRequest?.permissionType)} permission on ${formatPermissionDate(permissionRequest?.date)} (${buildPermissionWindowText(permissionRequest)}). Purpose: ${permissionRequest?.purpose || 'N/A'}. Location: ${buildPermissionLocationText(permissionRequest)}. Current status: ${permissionRequest?.status}.`,
      nextApproverRole: permissionRequest?.workflow?.nextApproverRole || permissionRequest?.workflow?.nextApprover || null,
      priority: 'medium',
    }).catch((err) => console.error('[Notification] OT_PERMISSION_APPLIED failed:', err.message));

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
    const {
      employeeId,
      employeeNumber,
      date,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 25,
    } = req.query;

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

    // Apply Employee-First Scoping for Scoped Roles (HOD, HR, Manager)
    let scopeLimitFilter = req.scopeFilter || {};
    if (['hod', 'hr', 'manager'].includes(req.user.role)) {
      const employeeIds = await getEmployeeIdsInScope(req.user);
      scopeLimitFilter = { ...scopeLimitFilter, employeeId: { $in: employeeIds } };
    }

    const combinedQuery = { $and: [query, scopeLimitFilter, workflowFilter] };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;
    const total = await Permission.countDocuments(combinedQuery);

    const permissions = await Permission.find(combinedQuery)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('requestedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: permissions,
      count: permissions.length,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
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
 * @desc    Get pending permission approvals (for HOD/Manager/HR)
 * @route   GET /api/permissions/pending-approvals
 * @access  Private (manager, hod, hr, sub_admin, super_admin)
 * Data scope: Show permissions to ALL workflow participants (roles in approvalChain) with division/department scope.
 */
exports.getPendingPermissionApprovals = async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const userRole = req.user.role;
    const baseFilter = {
      isActive: true,
      requestedBy: { $ne: req.user._id }
    };

    const finalStatuses = ['approved', 'rejected', 'checked_out', 'checked_in']; // Permission: gate scan statuses are post-approval

    if (['sub_admin', 'super_admin'].includes(userRole)) {
      baseFilter.status = { $nin: finalStatuses };
    } else if (['hod', 'hr', 'manager'].includes(userRole)) {
      const roleVariants = [userRole];
      if (userRole === 'hr') roleVariants.push('final_authority');
      baseFilter['workflow.approvalChain'] = {
        $elemMatch: { role: { $in: roleVariants } }
      };
      const employeeIds = await getEmployeeIdsInScope(req.user);
      baseFilter.employeeId = employeeIds.length > 0 ? { $in: employeeIds } : { $in: [] };
      baseFilter.status = { $nin: finalStatuses };
    } else {
      baseFilter['workflow.approvalChain'] = { $elemMatch: { role: userRole } };
      baseFilter.status = { $nin: finalStatuses };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;
    const total = await Permission.countDocuments(baseFilter);

    const permissions = await Permission.find(baseFilter)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('requestedBy', 'name email')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: permissions.length,
      data: permissions,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
    });
  } catch (error) {
    console.error('Error fetching pending permission approvals:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending permission approvals',
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
      return res.status(result.statusCode || 400).json(result);
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

    notifyWorkflowEvent({
      module: 'ot_permission',
      eventType: 'OT_PERMISSION_APPROVED',
      record: permission,
      actor: req.user,
      title: `Permission Approved: ${permission?.employeeId?.employee_name || permission?.employeeNumber}`,
      message: `${permission?.employeeId?.employee_name || permission?.employeeNumber}'s ${permissionTypeLabel(permission?.permissionType)} permission on ${formatPermissionDate(permission?.date)} (${buildPermissionWindowText(permission)}) was approved by ${req.user.name} (${req.user.role}). Location: ${buildPermissionLocationText(permission)}. Current status: ${permission?.status}.`,
      nextApproverRole: permission?.workflow?.nextApproverRole || permission?.workflow?.nextApprover || null,
      priority: 'medium',
    }).catch((err) => console.error('[Notification] OT_PERMISSION_APPROVED failed:', err.message));

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

    notifyWorkflowEvent({
      module: 'ot_permission',
      eventType: 'OT_PERMISSION_REJECTED',
      record: permission,
      actor: req.user,
      title: `Permission Rejected: ${permission?.employeeId?.employee_name || permission?.employeeNumber}`,
      message: `${permission?.employeeId?.employee_name || permission?.employeeNumber}'s ${permissionTypeLabel(permission?.permissionType)} permission on ${formatPermissionDate(permission?.date)} (${buildPermissionWindowText(permission)}) was rejected by ${req.user.name} (${req.user.role}). Location: ${buildPermissionLocationText(permission)}. Current status: ${permission?.status}.${reason ? ` Reason: ${reason}` : ''}`,
      priority: 'high',
    }).catch((err) => console.error('[Notification] OT_PERMISSION_REJECTED failed:', err.message));

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

    const pType = permission.permissionType || 'mid_shift';
    if ((pType === 'late_in' || pType === 'early_out') && !permission.qrCode) {
      return res.status(400).json({
        success: false,
        message:
          pType === 'late_in'
            ? 'Late-in permission uses security Gate In QR from the OT & Permissions screen, not the outpass QR.'
            : 'Early-out permission uses security Gate Out QR from the OT & Permissions screen, not the outpass QR.',
        permissionType: pType,
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

