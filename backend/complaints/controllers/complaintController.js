const Complaint = require('../model/Complaint');
const Employee = require('../../employees/model/Employee');
const EmployeeHistory = require('../../employees/model/EmployeeHistory');
const { resolveComplaintWorkflowSettings } = require('../../departments/services/divisionWorkflowResolver');
const mongoose = require('mongoose');
const LeaveSettings = require('../../leaves/model/LeaveSettings');

// Helper to check if a user is allowed to act/approve a complaint step
async function canUserApproveComplaint(req, complaint, requiredRole) {
  const { checkJurisdiction } = require('../../shared/middleware/dataScopeMiddleware');
  if (!checkJurisdiction(req.user, complaint)) {
    return false;
  }

  const userRole = req.user.role;
  const userId = req.user._id.toString();
  const userEmpId = req.user.employeeRef || req.user.employeeId;

  // 1. Admin Override (Super Admins and Sub Admins can generally approve any step)
  if (['super_admin', 'sub_admin'].includes(userRole)) {
    return true;
  }

  let isAllowed = false;

  // 2. Check exact role match or special logic
  if (requiredRole === 'reporting_manager') {
    const managers = complaint.workflow?.reportingManagerIds || [];
    isAllowed = managers.includes(userId) || (userEmpId && managers.includes(userEmpId.toString()));
    
    // HOD fallback
    if (!isAllowed && userRole === 'hod') {
      const leaveDeptId = complaint.department_id?.toString();
      const leaveDivId = complaint.division_id?.toString();
      const mapping = req.user.divisionMapping?.find(m =>
        (m.division?._id || m.division)?.toString() === leaveDivId
      );
      isAllowed = mapping
        ? (!mapping.departments || mapping.departments.length === 0) || mapping.departments.some(d => (d?._id || d).toString() === leaveDeptId)
        : false;
    }
  } else if (requiredRole === 'hod') {
    if (userRole === 'hod') {
      const leaveDeptId = complaint.department_id?.toString();
      const leaveDivId = complaint.division_id?.toString();
      const mapping = req.user.divisionMapping?.find(m =>
        (m.division?._id || m.division)?.toString() === leaveDivId
      );
      isAllowed = mapping
        ? (!mapping.departments || mapping.departments.length === 0) || mapping.departments.some(d => (d?._id || d).toString() === leaveDeptId)
        : false;
    }
  } else if (userRole === requiredRole) {
    isAllowed = true;
  }

  if (isAllowed) {
    return true;
  }

  // 3. Setting: Allow higher authority to approve lower levels
  const settings = await LeaveSettings.getActiveSettings('complaint');
  const allowHigher = settings?.workflow?.allowHigherAuthorityToApproveLowerLevels === true;
  
  if (allowHigher && complaint.workflow?.approvalChain?.length > 0) {
    const chain = complaint.workflow.approvalChain.slice().sort((a, b) => (a.stepOrder ?? 999) - (b.stepOrder ?? 999));
    const roleOrder = chain.map(s => (s.role || '').toLowerCase()).filter(Boolean);
    const requiredIdx = roleOrder.indexOf(requiredRole.toLowerCase());
    let userIdx = roleOrder.indexOf(userRole.toLowerCase());
    
    if (userIdx === -1 && (userRole === 'hr' || userRole === 'super_admin')) {
      userIdx = roleOrder.indexOf('hr') !== -1 ? roleOrder.length : -1;
    }
    
    if (requiredIdx >= 0 && userIdx >= 0 && userIdx >= requiredIdx) {
      return true;
    }
  }

  return false;
}

// Helper to find employee by ID or Number
async function findEmployee(employeeId, empNo) {
  if (empNo) {
    return await Employee.findOne({ emp_no: String(empNo).toUpperCase() }).populate('department_id division_id');
  }
  if (employeeId) {
    return await Employee.findById(employeeId).populate('department_id division_id');
  }
  return null;
}

// @desc    Apply for a complaint
// @route   POST /api/complaints
// @access  Private
exports.applyComplaint = async (req, res) => {
  try {
    const { employeeId, empNo, complaintType, imageUrl, remarks } = req.body;

    if (!remarks) {
      return res.status(400).json({ success: false, error: 'Remarks are required.' });
    }
    if (!complaintType) {
      return res.status(400).json({ success: false, error: 'Complaint type is required.' });
    }

    // Resolve target employee
    let employee = null;
    if (employeeId || empNo) {
      employee = await findEmployee(employeeId, empNo);
    } else {
      // Fallback to self
      const empId = req.user.employeeRef || req.user.employeeId;
      if (empId) {
        employee = await findEmployee(empId, null);
      }
    }

    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee details not found.' });
    }

    // Fetch dynamic workflow settings
    const workflowSettings = await resolveComplaintWorkflowSettings(employee.division_id?._id || employee.division_id);

    // Build the workflow chain
    const approvalSteps = [];
    const reportingManagers = employee.dynamicFields?.reporting_to || employee.dynamicFields?.reporting_to_ || [];
    const hasReportingManager = Array.isArray(reportingManagers) && reportingManagers.length > 0;

    const hasConfiguredSteps = workflowSettings?.workflow?.steps && workflowSettings.workflow.steps.length > 0;

    if (hasConfiguredSteps) {
      // Follow the configured steps exactly!
      workflowSettings.workflow.steps.forEach((step, idx) => {
        approvalSteps.push({
          stepOrder: idx + 1,
          role: step.approverRole,
          label: step.stepName || `${step.approverRole.toUpperCase()} Approval`,
          status: 'pending',
          isCurrent: idx === 0, // Make the first step current
        });
      });
    } else {
      // Default fallback chain: Reporting Manager (if exists) -> HOD
      if (hasReportingManager) {
        approvalSteps.push({
          stepOrder: 1,
          role: 'reporting_manager',
          label: 'Reporting Manager Approval',
          status: 'pending',
          isCurrent: true,
        });
        // Default step 2: HOD
        approvalSteps.push({
          stepOrder: 2,
          role: 'hod',
          label: 'HOD Approval',
          status: 'pending',
          isCurrent: false,
        });
      } else {
        // Fallback step 1: HOD
        approvalSteps.push({
          stepOrder: 1,
          role: 'hod',
          label: 'HOD Approval',
          status: 'pending',
          isCurrent: true,
        });
      }
    }

    const workflowData = {
      currentStepRole: approvalSteps[0]?.role || null,
      nextApproverRole: approvalSteps[0]?.role || null,
      approvalChain: approvalSteps,
      reportingManagerIds: hasReportingManager ? reportingManagers.map((m) => (m._id || m).toString()) : [],
      finalAuthority: workflowSettings?.workflow?.finalAuthority?.role || 'hr',
      history: [
        {
          step: 'employee',
          action: 'submitted',
          actionBy: req.user._id,
          actionByName: req.user.name || req.user.email,
          actionByRole: req.user.role,
          comments: 'Complaint application submitted',
          timestamp: new Date(),
        },
      ],
    };

    const complaint = new Complaint({
      employeeId: employee._id,
      emp_no: employee.emp_no,
      employeeName: employee.employee_name,
      complaintType,
      imageUrl,
      remarks,
      division_id: employee.division_id?._id || employee.division_id,
      division_name: employee.division_id?.name || '',
      department_id: employee.department_id?._id || employee.department_id,
      department_name: employee.department_id?.name || '',
      designation: employee.designation_id?.name || employee.designation || '',
      appliedBy: req.user._id,
      appliedAt: new Date(),
      status: approvalSteps.length > 0 ? 'pending' : 'approved',
      workflow: workflowData,
    });

    await complaint.save();

    // Log event in EmployeeHistory
    try {
      await EmployeeHistory.create({
        emp_no: employee.emp_no,
        event: 'complaint_submitted',
        performedBy: req.user._id,
        performedByName: req.user.name || req.user.email,
        performedByRole: req.user.role,
        details: { complaintId: complaint._id, complaintType },
        comments: 'Complaint submitted successfully',
      });
    } catch (historyError) {
      console.error('Failed to write complaint history:', historyError);
    }

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: complaint,
    });
  } catch (error) {
    console.error('Error applying for complaint:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to submit complaint.' });
  }
};

// @desc    Get current user's complaints
// @route   GET /api/complaints/my
// @access  Private
exports.getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ appliedBy: req.user._id, isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: complaints });
  } catch (error) {
    console.error('Error getting my complaints:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch complaints.' });
  }
};

// @desc    Get single complaint
// @route   GET /api/complaints/:id
// @access  Private
exports.getComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id).lean();
    if (!complaint || !complaint.isActive) {
      return res.status(404).json({ success: false, error: 'Complaint not found.' });
    }
    res.status(200).json({ success: true, data: complaint });
  } catch (error) {
    console.error('Error getting complaint:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch complaint details.' });
  }
};

// @desc    Get complaints pending user approval
// @route   GET /api/complaints/pending-approvals
// @access  Private
exports.getPendingApprovals = async (req, res) => {
  try {
    // Find all complaints that are pending and have an active step
    const pendingComplaints = await Complaint.find({
      status: { $nin: ['approved', 'rejected', 'cancelled'] },
      isActive: true,
      'workflow.currentStepRole': { $ne: null }
    }).populate('employeeId').lean();

    const filtered = [];

    for (const comp of pendingComplaints) {
      const activeStep = comp.workflow.approvalChain.find(step => step.status === 'pending');
      if (!activeStep) continue;

      const requiredRole = activeStep.role;
      const isAllowed = await canUserApproveComplaint(req, comp, requiredRole);

      if (isAllowed) {
        filtered.push(comp);
      }
    }

    res.status(200).json({ success: true, data: filtered });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending approvals.' });
  }
};

// @desc    Get all complaints (scoped)
// @route   GET /api/complaints
// @access  Private
exports.getComplaints = async (req, res) => {
  try {
    const query = {
      ...req.scopeFilter,
      isActive: true
    };

    const complaints = await Complaint.find(query).sort({ createdAt: -1 }).lean();
    res.status(200).json({ success: true, data: complaints });
  } catch (error) {
    console.error('Error getting all complaints:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch complaints list.' });
  }
};

// @desc    Approve/Reject complaint step
// @route   PUT /api/complaints/:id/action
// @access  Private
exports.processComplaintAction = async (req, res) => {
  try {
    const { action, comments } = req.body;
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint || !complaint.isActive) {
      return res.status(404).json({ success: false, error: 'Complaint not found.' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action. Must be approve or reject.' });
    }

    if (['approved', 'rejected', 'cancelled'].includes(complaint.status)) {
      return res.status(400).json({ success: false, error: `Complaint is already ${complaint.status}` });
    }

    // Find active step
    const approvalChain = complaint.workflow.approvalChain || [];
    const activeStepIndex = approvalChain.findIndex(step => step.status === 'pending');
    if (activeStepIndex === -1) {
      return res.status(400).json({ success: false, error: 'No pending approval step found.' });
    }

    const activeStep = approvalChain[activeStepIndex];
    const requiredRole = activeStep.role;

    const isAuthorized = await canUserApproveComplaint(req, complaint, requiredRole);

    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'You are not authorized to approve this step.' });
    }

     // Process action
    if (action === 'approve') {
      activeStep.status = 'approved';
      activeStep.isCurrent = false;
      activeStep.actionByName = req.user.name || req.user.email;
      activeStep.actionBy = req.user._id;
      activeStep.updatedAt = new Date();
      activeStep.comments = comments || `${requiredRole.toUpperCase()} Approved`;

      // Find next pending step
      const nextStep = approvalChain.slice(activeStepIndex + 1).find(step => step.status === 'pending');

      if (nextStep) {
        nextStep.isCurrent = true;
        complaint.status = `${requiredRole}_approved`;
        complaint.workflow.currentStepRole = nextStep.role;
        complaint.workflow.nextApproverRole = nextStep.role;
      } else {
        // Final approval
        complaint.status = 'approved';
        complaint.workflow.currentStepRole = null;
        complaint.workflow.nextApproverRole = null;
      }

      complaint.workflow.history.push({
        step: requiredRole,
        action: 'approved',
        actionBy: req.user._id,
        actionByName: req.user.name || req.user.email,
        actionByRole: req.user.role,
        comments: comments || `${requiredRole.toUpperCase()} Approved`,
        timestamp: new Date(),
      });
    } else {
      // Rejection - terminates the workflow
      activeStep.status = 'rejected';
      activeStep.isCurrent = false;
      activeStep.actionByName = req.user.name || req.user.email;
      activeStep.actionBy = req.user._id;
      activeStep.updatedAt = new Date();
      activeStep.comments = comments || `${requiredRole.toUpperCase()} Rejected`;
      complaint.status = 'rejected';
      complaint.workflow.currentStepRole = null;
      complaint.workflow.nextApproverRole = null;

      complaint.workflow.history.push({
        step: requiredRole,
        action: 'rejected',
        actionBy: req.user._id,
        actionByName: req.user.name || req.user.email,
        actionByRole: req.user.role,
        comments: comments || `${requiredRole.toUpperCase()} Rejected`,
        timestamp: new Date(),
      });
    }

    // Mark Mongoose nested paths as modified
    complaint.markModified('workflow');
    complaint.markModified('workflow.approvalChain');
    complaint.markModified('workflow.history');
    await complaint.save();

    // Log history
    try {
      await EmployeeHistory.create({
        emp_no: complaint.emp_no,
        event: action === 'approve' ? 'complaint_approved' : 'complaint_rejected',
        performedBy: req.user._id,
        performedByName: req.user.name || req.user.email,
        performedByRole: req.user.role,
        details: { complaintId: complaint._id, step: requiredRole, comments },
        comments: `Complaint status changed to ${complaint.status}`,
      });
    } catch (eHistory) {
      console.error('History logger error:', eHistory);
    }

    res.status(200).json({ success: true, message: `Complaint ${action}d successfully`, data: complaint });
  } catch (error) {
    console.error('Error processing complaint action:', error);
    res.status(500).json({ success: false, error: 'Failed to process action.' });
  }
};

// @desc    Cancel complaint
// @route   PUT /api/complaints/:id/cancel
// @access  Private
exports.cancelComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint || !complaint.isActive) {
      return res.status(404).json({ success: false, error: 'Complaint not found.' });
    }

    if (complaint.appliedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Only the applicant can cancel this complaint.' });
    }

    if (['approved', 'rejected', 'cancelled'].includes(complaint.status)) {
      return res.status(400).json({ success: false, error: `Complaint is already ${complaint.status}` });
    }

    complaint.status = 'cancelled';
    complaint.workflow.currentStepRole = null;
    complaint.workflow.nextApproverRole = null;
    complaint.workflow.history.push({
      step: 'employee',
      action: 'cancelled',
      actionBy: req.user._id,
      actionByName: req.user.name || req.user.email,
      actionByRole: req.user.role,
      comments: 'Cancelled by applicant',
      timestamp: new Date(),
    });

    complaint.markModified('workflow');
    await complaint.save();

    res.status(200).json({ success: true, message: 'Complaint cancelled successfully.', data: complaint });
  } catch (error) {
    console.error('Error cancelling complaint:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel complaint.' });
  }
};
