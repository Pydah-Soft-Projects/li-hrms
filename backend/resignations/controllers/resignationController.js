const ResignationRequest = require('../model/ResignationRequest');
const ResignationSettings = require('../model/ResignationSettings');
const Employee = require('../../employees/model/Employee');
const { getEmployeeIdsInScope } = require('../../shared/middleware/dataScopeMiddleware');

function buildWorkflowVisibilityFilter(user) {
  if (!user) return { _id: null };
  const role = (user.role || '').toLowerCase();
  const roleVariants = [role, role.replace('_', '')];
  const filter = {
    $or: [
      { 'workflow.approvalChain': { $elemMatch: { role: { $in: roleVariants } } } },
      { 'workflow.reportingManagerIds': user._id.toString() },
    ],
  };
  if (['super_admin', 'sub_admin'].includes(role)) return {};
  return filter;
}

// @desc    Create resignation request (opens workflow)
// @route   POST /api/resignations
// @access  Private (HR, manager, super_admin, etc. - who can set left date)
exports.createResignationRequest = async (req, res) => {
  try {
    let { emp_no, leftDate, remarks } = req.body;
    const userRole = (req.user?.role || '').toLowerCase();
    const isEmployeeSelf = userRole === 'employee';
    if (isEmployeeSelf) {
      emp_no = req.user?.employeeId || req.user?.emp_no;
      if (!emp_no) {
        return res.status(400).json({ success: false, message: 'Your employee record could not be identified. Please contact HR.' });
      }
    }
    if (!emp_no || !leftDate) {
      return res.status(400).json({ success: false, message: 'Employee number and left date are required' });
    }
    const leftDateObj = new Date(leftDate);
    if (isNaN(leftDateObj.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid left date' });
    }
    if (isEmployeeSelf && (req.body.emp_no && String(req.body.emp_no).toUpperCase() !== String(emp_no).toUpperCase())) {
      return res.status(403).json({ success: false, message: 'You can only submit a resignation for yourself.' });
    }

    const settings = await ResignationSettings.getActiveSettings();
    const noticePeriodDays = Math.max(0, Number(settings?.noticePeriodDays) || 0);
    if (noticePeriodDays > 0) {
      // Compare calendar days only (parse YYYY-MM-DD at noon UTC to avoid timezone shift)
      const leftDateStr = String(leftDate).slice(0, 10);
      const leftDay = new Date(leftDateStr + 'T12:00:00.000Z');
      const minDate = new Date();
      minDate.setUTCHours(12, 0, 0, 0);
      minDate.setUTCDate(minDate.getUTCDate() + noticePeriodDays);
      if (leftDay.getTime() < minDate.getTime()) {
        return res.status(400).json({
          success: false,
          message: `Notice period is ${noticePeriodDays} day(s). Last working date must be at least ${noticePeriodDays} days from today.`,
        });
      }
    }

    const employee = await Employee.findOne({ emp_no: String(emp_no).toUpperCase() })
      .populate('department_id', 'name')
      .populate('division_id', 'name');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    if (employee.leftDate) {
      return res.status(400).json({ success: false, message: 'Employee already has a left date' });
    }

    const workflowEnabled = settings?.workflow?.isEnabled !== false;
    const reportingManagers = employee.dynamicFields?.reporting_to || employee.dynamicFields?.reporting_to_ || [];
    const hasReportingManager = Array.isArray(reportingManagers) && reportingManagers.length > 0;

    // Build approval chain same as Leave/OD: Reporting Manager or HOD first, then steps from settings (skip duplicate HOD)
    const approvalSteps = [];
    if (hasReportingManager) {
      approvalSteps.push({
        stepOrder: 1,
        role: 'reporting_manager',
        label: 'Reporting Manager Approval',
        status: 'pending',
        isCurrent: true,
      });
    } else {
      approvalSteps.push({
        stepOrder: 1,
        role: 'hod',
        label: 'HOD Approval',
        status: 'pending',
        isCurrent: true,
      });
    }
    if (workflowEnabled && settings?.workflow?.steps?.length) {
      settings.workflow.steps.forEach((step) => {
        const role = (step.approverRole || '').toLowerCase();
        if (role !== 'hod' && role !== 'reporting_manager') {
          approvalSteps.push({
            stepOrder: approvalSteps.length + 1,
            role: step.approverRole,
            label: step.stepName || `${(step.approverRole || '').toUpperCase()} Approval`,
            status: 'pending',
            isCurrent: false,
          });
        }
      });
    }
    if (approvalSteps.length === 0) {
      approvalSteps.push({
        stepOrder: 1,
        role: 'hr',
        label: 'HR Approval',
        status: 'pending',
        isCurrent: true,
      });
    }

    const firstRole = approvalSteps[0]?.role || 'hr';
    const finalAuthority = settings?.workflow?.finalAuthority?.role || 'hr';

    const resignation = new ResignationRequest({
      employeeId: employee._id,
      emp_no: employee.emp_no,
      leftDate: leftDateObj,
      remarks: remarks || '',
      status: 'pending',
      requestedBy: req.user._id,
      workflow: {
        currentStepRole: firstRole,
        nextApproverRole: firstRole,
        isCompleted: false,
        approvalChain: approvalSteps,
        finalAuthority,
        reportingManagerIds: hasReportingManager ? reportingManagers.map((m) => (m._id || m).toString()) : [],
        history: [
          {
            step: 'submitted',
            action: 'submitted',
            actionBy: req.user._id,
            actionByName: req.user.name,
            actionByRole: req.user.role,
            comments: 'Resignation request submitted',
            timestamp: new Date(),
          },
        ],
      },
    });
    await resignation.save();

    const populated = await ResignationRequest.findById(resignation._id)
      .populate('employeeId', 'employee_name emp_no department_id division_id')
      .populate('requestedBy', 'name email')
      .lean();

    res.status(201).json({
      success: true,
      message: 'Resignation request submitted. It will be processed through the approval flow.',
      data: populated,
    });
  } catch (error) {
    console.error('Error creating resignation request:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create resignation request',
    });
  }
};

// @desc    Get pending resignation approvals for current user
// @route   GET /api/resignations/pending-approvals
// @access  Private
exports.getPendingApprovals = async (req, res) => {
  try {
    const userRole = (req.user.role || '').toLowerCase();
    const filter = { status: 'pending' };

    if (['super_admin', 'sub_admin'].includes(userRole)) {
      // no employee scope
    } else {
      const roleVariants = [userRole];
      if (userRole === 'hr') roleVariants.push('final_authority');
      filter.$or = [
        { 'workflow.approvalChain': { $elemMatch: { role: { $in: roleVariants } } } },
        { 'workflow.reportingManagerIds': req.user._id.toString() },
      ];
      const employeeIds = await getEmployeeIdsInScope(req.user);
      filter.employeeId = employeeIds.length ? { $in: employeeIds } : { $in: [] };
    }

    const list = await ResignationRequest.find(filter)
      .populate('employeeId', 'employee_name emp_no department_id division_id')
      .populate('requestedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    console.error('Error fetching pending resignation approvals:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pending approvals',
    });
  }
};

// @desc    Approve or reject resignation request
// @route   PUT /api/resignations/:id/approve
// @access  Private
exports.approveResignationRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comments } = req.body; // action: 'approve' | 'reject'
    const resignation = await ResignationRequest.findById(id)
      .populate('employeeId')
      .populate('requestedBy', 'name email');
    if (!resignation) {
      return res.status(404).json({ success: false, message: 'Resignation request not found' });
    }
    if (resignation.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request is no longer pending' });
    }

    const chain = resignation.workflow?.approvalChain || [];
    const activeIndex = chain.findIndex((s) => s.status === 'pending');
    if (activeIndex === -1) {
      return res.status(400).json({ success: false, message: 'No pending approval step' });
    }
    const step = chain[activeIndex];
    const userRole = (req.user.role || '').toLowerCase();
    const isReportingManager = resignation.workflow?.reportingManagerIds?.includes(req.user._id.toString());
    const isSuperOrSubAdmin = ['super_admin', 'sub_admin'].includes(userRole);
    const canAct =
      isSuperOrSubAdmin ||
      step.role === userRole ||
      (step.role === 'reporting_manager' && isReportingManager) ||
      (step.role === 'final_authority' && userRole === 'hr') ||
      (resignation.workflow.finalAuthority === userRole && ['hr'].includes(userRole));
    if (!canAct) {
      return res.status(403).json({
        success: false,
        message: `Only ${step.role} can act on this step`,
      });
    }

    const isApprove = action === 'approve';
    step.status = isApprove ? 'approved' : 'rejected';
    step.actionBy = req.user._id;
    step.actionByName = req.user.name;
    step.actionByRole = userRole;
    step.comments = comments || '';
    step.updatedAt = new Date();

    resignation.workflow.history.push({
      step: step.role,
      action: isApprove ? 'approved' : 'rejected',
      actionBy: req.user._id,
      actionByName: req.user.name,
      actionByRole: userRole,
      comments: comments || '',
      timestamp: new Date(),
    });

    const nextIndex = activeIndex + 1;
    const isLastStep = nextIndex >= chain.length;

    if (!isApprove) {
      resignation.status = 'rejected';
      resignation.workflow.isCompleted = true;
      resignation.workflow.currentStepRole = null;
      resignation.workflow.nextApproverRole = null;
      await resignation.save();
      return res.status(200).json({
        success: true,
        message: 'Resignation request rejected',
        data: resignation,
      });
    }

    if (isLastStep) {
      resignation.status = 'approved';
      resignation.workflow.isCompleted = true;
      resignation.workflow.currentStepRole = null;
      resignation.workflow.nextApproverRole = null;
      await resignation.save();

      const emp = await Employee.findById(resignation.employeeId._id || resignation.employeeId);
      if (emp) {
        emp.leftDate = resignation.leftDate;
        emp.leftReason = resignation.remarks || null;
        // Do not set is_active = false here: account stays active until last working date (leftDate).
        // Auth and listings treat employee as inactive only when leftDate is in the past.
        await emp.save();
      }

      return res.status(200).json({
        success: true,
        message: 'Resignation approved. Employee left date has been set. Account remains active until last working date.',
        data: resignation,
      });
    }

    const nextStep = chain[nextIndex];
    nextStep.status = 'pending';
    nextStep.isCurrent = true;
    resignation.workflow.currentStepRole = nextStep.role;
    resignation.workflow.nextApproverRole = nextStep.role;
    await resignation.save();

    res.status(200).json({
      success: true,
      message: 'Resignation approved at this step. Forwarded to next approver.',
      data: resignation,
    });
  } catch (error) {
    console.error('Error approving resignation:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process approval',
    });
  }
};

// @desc    Get resignation requests (by employee or all for scope)
// @route   GET /api/resignations
// @access  Private
exports.getResignationRequests = async (req, res) => {
  try {
    const { emp_no } = req.query;
    const filter = {};
    const userRole = (req.user.role || '').toLowerCase();
    if (emp_no) filter.emp_no = String(emp_no).toUpperCase();
    else if (userRole === 'employee') {
      const myEmployeeId = req.user.employeeRef
        || (req.user.employeeId && (await Employee.findOne({ emp_no: String(req.user.employeeId).toUpperCase() }).select('_id').lean())?._id)
        || req.user._id;
      if (myEmployeeId) filter.employeeId = myEmployeeId;
      else filter.employeeId = { $in: [] };
    } else if (userRole !== 'super_admin' && userRole !== 'sub_admin') {
      const employeeIds = await getEmployeeIdsInScope(req.user);
      if (employeeIds.length) filter.employeeId = { $in: employeeIds };
    }
    const list = await ResignationRequest.find(filter)
      .populate('employeeId', 'employee_name emp_no department_id division_id')
      .populate('requestedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    console.error('Error fetching resignation requests:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch resignation requests',
    });
  }
};
