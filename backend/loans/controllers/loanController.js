const mongoose = require('mongoose');
const Loan = require('../model/Loan');
const LoanSettings = require('../model/LoanSettings');
const Employee = require('../../employees/model/Employee');
const User = require('../../users/model/User');
const { isHRMSConnected, getEmployeeByIdMSSQL } = require('../../employees/config/mssqlHelper');

/**
 * Get employee settings from database
 */
const getEmployeeSettings = async () => {
  try {
    const Settings = require('../../settings/model/Settings');
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
 */
const findEmployeeByEmpNo = async (empNo) => {
  if (!empNo) return null;
  
  // Always try MongoDB first
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

// Helper to find employee by ID or emp_no
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
 * Loan Controller
 * Handles CRUD operations and approval workflow
 */

// Helper function to get workflow settings
const getWorkflowSettings = async (type) => {
  let settings = await LoanSettings.getActiveSettings(type);
  
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
        maxAmount: null,
        minAmount: 1000,
        maxDuration: 60,
        minDuration: 1,
      },
    };
  }
  
  return settings;
};

// Helper to calculate EMI for loans
const calculateEMI = (principal, interestRate, duration) => {
  if (interestRate === 0) {
    return principal / duration;
  }
  const monthlyRate = interestRate / 100 / 12;
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, duration)) / (Math.pow(1 + monthlyRate, duration) - 1);
  return Math.round(emi);
};

// @desc    Get all loans (with filters)
// @route   GET /api/loans
// @access  Private
exports.getLoans = async (req, res) => {
  try {
    const { status, employeeId, department, requestType, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true };

    if (status) filter.status = status;
    if (employeeId) filter.employeeId = employeeId;
    if (department) filter.department = department;
    if (requestType) filter.requestType = requestType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [loans, total] = await Promise.all([
      Loan.find(filter)
        .populate('employeeId', 'employee_name emp_no')
        .populate('department', 'name')
        .populate('designation', 'name')
        .populate('appliedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Loan.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: loans.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: loans,
    });
  } catch (error) {
    console.error('Error fetching loans:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch loans',
    });
  }
};

// @desc    Get my loans (for logged-in employee)
// @route   GET /api/loans/my
// @access  Private
exports.getMyLoans = async (req, res) => {
  try {
    const { status, requestType } = req.query;
    const filter = { 
      isActive: true,
      appliedBy: req.user._id,
    };

    if (status) filter.status = status;
    if (requestType) filter.requestType = requestType;

    const loans = await Loan.find(filter)
      .populate('department', 'name')
      .populate('designation', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: loans.length,
      data: loans,
    });
  } catch (error) {
    console.error('Error fetching my loans:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch loans',
    });
  }
};

// @desc    Get single loan
// @route   GET /api/loans/:id
// @access  Private
exports.getLoan = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate('employeeId', 'employee_name emp_no email phone_number')
      .populate('department', 'name code')
      .populate('designation', 'name')
      .populate('appliedBy', 'name email')
      .populate('workflow.history.actionBy', 'name email')
      .populate('approvals.hod.approvedBy', 'name email')
      .populate('approvals.hr.approvedBy', 'name email')
      .populate('approvals.final.approvedBy', 'name email')
      .populate('disbursement.disbursedBy', 'name email');

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan application not found',
      });
    }

    res.status(200).json({
      success: true,
      data: loan,
    });
  } catch (error) {
    console.error('Error fetching loan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch loan',
    });
  }
};

// @desc    Apply for loan/advance
// @route   POST /api/loans
// @access  Private
exports.applyLoan = async (req, res) => {
  try {
    const {
      requestType,
      amount,
      reason,
      duration,
      remarks,
      empNo, // Primary - emp_no for applying on behalf
      employeeId, // Legacy - for backward compatibility
    } = req.body;

    // Validate request type
    if (!['loan', 'salary_advance'].includes(requestType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request type. Must be "loan" or "salary_advance"',
      });
    }

    // Get employee - either from request body (HR applying for someone) or from user
    let employee;

    // Use empNo as primary identifier (from frontend)
    if (empNo) {
      // Check if user has permission to apply for others
      const hasRolePermission = ['hr', 'sub_admin', 'super_admin'].includes(req.user.role);
      
      console.log(`[Apply Loan] User ${req.user._id} (${req.user.role}) applying for employee ${empNo}`);
      console.log(`[Apply Loan] Has role permission: ${hasRolePermission}`);
      
      // Check workspace permissions if user has active workspace
      let hasWorkspacePermission = false;
      if (req.user.activeWorkspaceId) {
        try {
          const loanSettings = await LoanSettings.findOne({ type: requestType, isActive: true });
          if (loanSettings?.settings?.workspacePermissions) {
            const workspaceIdStr = String(req.user.activeWorkspaceId);
            const permissions = loanSettings.settings.workspacePermissions[workspaceIdStr];
            
            console.log(`[Apply Loan] Checking workspace ${workspaceIdStr} permissions:`, permissions);
            
            if (permissions) {
              // Handle both old format (boolean) and new format (object)
              if (typeof permissions === 'boolean') {
                hasWorkspacePermission = permissions;
              } else {
                hasWorkspacePermission = permissions.canApplyForOthers || false;
              }
            }
          }
        } catch (error) {
          console.error('[Apply Loan] Error checking workspace permissions:', error);
        }
      }
      
      console.log(`[Apply Loan] Has workspace permission: ${hasWorkspacePermission}`);
      
      // User must have either role permission OR workspace permission
      if (!hasRolePermission && !hasWorkspacePermission) {
        console.log(`[Apply Loan] ❌ Authorization denied - no role or workspace permission`);
        return res.status(403).json({
          success: false,
          error: 'Not authorized to apply loan/advance for others',
        });
      }
      
      console.log(`[Apply Loan] ✅ Authorization granted`);
      
      // Find employee by emp_no
      employee = await findEmployeeByEmpNo(empNo);
    } else if (employeeId) {
      // Legacy: Check if user has permission to apply for others
      const hasRolePermission = ['hr', 'sub_admin', 'super_admin'].includes(req.user.role);
      
      // Check workspace permissions
      let hasWorkspacePermission = false;
      if (req.user.activeWorkspaceId) {
        try {
          const loanSettings = await LoanSettings.findOne({ type: requestType, isActive: true });
          if (loanSettings?.settings?.workspacePermissions) {
            const workspaceIdStr = String(req.user.activeWorkspaceId);
            const permissions = loanSettings.settings.workspacePermissions[workspaceIdStr];
            if (permissions) {
              if (typeof permissions === 'boolean') {
                hasWorkspacePermission = permissions;
              } else {
                hasWorkspacePermission = permissions.canApplyForOthers || false;
              }
            }
          }
        } catch (error) {
          console.error('[Apply Loan] Error checking workspace permissions:', error);
        }
      }
      
      if (!hasRolePermission && !hasWorkspacePermission) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to apply loan/advance for others',
        });
      }
      
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
    const workflowSettings = await getWorkflowSettings(requestType);
    const settings = workflowSettings.settings || {};

    // Validate amount
    if (amount < (settings.minAmount || 1000)) {
      return res.status(400).json({
        success: false,
        error: `Amount must be at least ${settings.minAmount || 1000}`,
      });
    }

    if (settings.maxAmount && amount > settings.maxAmount) {
      return res.status(400).json({
        success: false,
        error: `Amount cannot exceed ${settings.maxAmount}`,
      });
    }

    // Validate duration
    if (duration < (settings.minDuration || 1)) {
      return res.status(400).json({
        success: false,
        error: `Duration must be at least ${settings.minDuration || 1} month(s)`,
      });
    }

    if (duration > (settings.maxDuration || 60)) {
      return res.status(400).json({
        success: false,
        error: `Duration cannot exceed ${settings.maxDuration || 60} months`,
      });
    }

    // Calculate loan-specific values
    let loanConfig = {};
    let advanceConfig = {};
    let totalAmount = amount;

    if (requestType === 'loan') {
      const interestRate = settings.interestRate || 0;
      const emiAmount = calculateEMI(amount, interestRate, duration);
      
      if (settings.isInterestApplicable && interestRate > 0) {
        totalAmount = amount + (amount * interestRate / 100 * duration / 12);
      }

      // Calculate start and end dates (start from next month)
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() + 1);
      startDate.setDate(1); // First day of next month
      
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + duration);

      loanConfig = {
        emiAmount,
        interestRate,
        startDate,
        endDate,
        totalAmount,
      };
    } else {
      // Salary advance - calculate per cycle deduction
      const deductionPerCycle = amount / duration;
      advanceConfig = {
        deductionCycles: duration,
        deductionPerCycle: Math.round(deductionPerCycle),
      };
    }

    // Create loan application
    const loan = new Loan({
      employeeId: employee._id,
      emp_no: employee.emp_no,
      requestType,
      amount,
      reason,
      duration,
      remarks,
      department: employee.department_id || employee.department,
      designation: employee.designation_id || employee.designation,
      appliedBy: req.user._id,
      appliedAt: new Date(),
      status: 'pending',
      loanConfig,
      advanceConfig,
      repayment: {
        totalPaid: 0,
        remainingBalance: requestType === 'loan' ? totalAmount : amount,
        installmentsPaid: 0,
        totalInstallments: duration,
        nextPaymentDate: requestType === 'loan' ? loanConfig.startDate : null,
      },
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
            comments: `${requestType === 'loan' ? 'Loan' : 'Salary advance'} application submitted`,
            timestamp: new Date(),
          },
        ],
      },
    });

    await loan.save();

    // Populate for response
    await loan.populate([
      { path: 'employeeId', select: 'employee_name emp_no' },
      { path: 'department', select: 'name' },
      { path: 'designation', select: 'name' },
    ]);

    res.status(201).json({
      success: true,
      message: `${requestType === 'loan' ? 'Loan' : 'Salary advance'} application submitted successfully`,
      data: loan,
    });
  } catch (error) {
    console.error('Error applying loan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply for loan/advance',
    });
  }
};

// @desc    Get pending approvals for current user
// @route   GET /api/loans/pending-approvals
// @access  Private
exports.getPendingApprovals = async (req, res) => {
  try {
    const userRole = req.user.role;
    let filter = { isActive: true };

    // Determine what the user can approve based on their role
    if (userRole === 'hod') {
      filter['workflow.nextApprover'] = 'hod';
      if (req.user.department) {
        filter.department = req.user.department;
      }
    } else if (userRole === 'hr') {
      filter['workflow.nextApprover'] = { $in: ['hr', 'final_authority'] };
    } else if (['sub_admin', 'super_admin'].includes(userRole)) {
      filter.status = { $nin: ['approved', 'rejected', 'cancelled', 'completed'] };
    } else {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view pending approvals',
      });
    }

    const loans = await Loan.find(filter)
      .populate('employeeId', 'employee_name emp_no')
      .populate('department', 'name')
      .populate('designation', 'name')
      .sort({ appliedAt: -1 });

    res.status(200).json({
      success: true,
      count: loans.length,
      data: loans,
    });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pending approvals',
    });
  }
};

// @desc    Process loan action (approve/reject/forward)
// @route   PUT /api/loans/:id/action
// @access  Private (HOD, HR, Admin)
exports.processLoanAction = async (req, res) => {
  try {
    const { action, comments } = req.body;
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan application not found',
      });
    }

    const userRole = req.user.role;
    const currentApprover = loan.workflow.nextApprover;

    // Validate user can perform this action
    let canProcess = false;
    if (currentApprover === 'hod' && userRole === 'hod') {
      canProcess = !req.user.department || 
        loan.department?.toString() === req.user.department?.toString();
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
        error: 'Not authorized to process this loan application',
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
          loan.status = 'hod_approved';
          loan.approvals.hod = {
            status: 'approved',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };
          loan.workflow.currentStep = 'hr';
          loan.workflow.nextApprover = 'hr';
          historyEntry.action = 'approved';
        } else if (currentApprover === 'hr' || currentApprover === 'final_authority') {
          loan.status = 'approved';
          loan.approvals.hr = {
            status: 'approved',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };
          loan.workflow.currentStep = 'completed';
          loan.workflow.nextApprover = null;
          historyEntry.action = 'approved';
        }
        break;

      case 'reject':
        if (currentApprover === 'hod') {
          loan.status = 'hod_rejected';
          loan.approvals.hod = {
            status: 'rejected',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };
        } else {
          loan.status = 'hr_rejected';
          loan.approvals.hr = {
            status: 'rejected',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };
        }
        loan.workflow.currentStep = 'completed';
        loan.workflow.nextApprover = null;
        historyEntry.action = 'rejected';
        break;

      case 'forward':
        if (currentApprover !== 'hod') {
          return res.status(400).json({
            success: false,
            error: 'Only HOD can forward loan applications',
          });
        }
        loan.status = 'hod_approved';
        loan.approvals.hod = {
          status: 'forwarded',
          approvedBy: req.user._id,
          approvedAt: new Date(),
          comments,
        };
        loan.workflow.currentStep = 'hr';
        loan.workflow.nextApprover = 'hr';
        historyEntry.action = 'forwarded';
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action',
        });
    }

    loan.workflow.history.push(historyEntry);
    await loan.save();

    await loan.populate([
      { path: 'employeeId', select: 'employee_name emp_no' },
      { path: 'department', select: 'name' },
    ]);

    res.status(200).json({
      success: true,
      message: `Loan ${action}ed successfully`,
      data: loan,
    });
  } catch (error) {
    console.error('Error processing loan action:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process loan action',
    });
  }
};

// @desc    Cancel loan application
// @route   PUT /api/loans/:id/cancel
// @access  Private
exports.cancelLoan = async (req, res) => {
  try {
    const { reason } = req.body;
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan application not found',
      });
    }

    if (!loan.canCancel()) {
      return res.status(400).json({
        success: false,
        error: 'Loan cannot be cancelled in current status',
      });
    }

    const isOwner = loan.appliedBy.toString() === req.user._id.toString();
    const isAdmin = ['hr', 'sub_admin', 'super_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to cancel this loan',
      });
    }

    loan.status = 'cancelled';
    loan.cancellation = {
      cancelledBy: req.user._id,
      cancelledAt: new Date(),
      reason: reason || 'Cancelled by user',
    };
    loan.workflow.currentStep = 'completed';
    loan.workflow.nextApprover = null;
    loan.workflow.history.push({
      step: 'cancellation',
      action: 'cancelled',
      actionBy: req.user._id,
      actionByName: req.user.name,
      actionByRole: req.user.role,
      comments: reason || 'Loan application cancelled',
      timestamp: new Date(),
    });

    await loan.save();

    res.status(200).json({
      success: true,
      message: 'Loan cancelled successfully',
      data: loan,
    });
  } catch (error) {
    console.error('Error cancelling loan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel loan',
    });
  }
};

// @desc    Disburse loan (mark as disbursed)
// @route   PUT /api/loans/:id/disburse
// @access  Private (HR, Admin)
exports.disburseLoan = async (req, res) => {
  try {
    const { disbursementMethod, transactionReference, remarks } = req.body;
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan application not found',
      });
    }

    if (loan.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Only approved loans can be disbursed',
      });
    }

    // Only HR and Admin can disburse
    if (!['hr', 'sub_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to disburse loans',
      });
    }

    loan.status = 'disbursed';
    loan.disbursement = {
      disbursedBy: req.user._id,
      disbursedAt: new Date(),
      disbursementMethod: disbursementMethod || 'bank_transfer',
      transactionReference,
      remarks,
    };

    // Initialize repayment tracking if not exists
    if (!loan.repayment) {
      loan.repayment = {
        totalPaid: 0,
        remainingBalance: loan.requestType === 'loan' ? (loan.loanConfig?.totalAmount || loan.amount) : loan.amount,
        installmentsPaid: 0,
        totalInstallments: loan.duration,
      };
    }

    // Add transaction log for disbursement
    loan.transactions.push({
      transactionType: 'disbursement',
      amount: loan.requestType === 'loan' ? (loan.loanConfig?.totalAmount || loan.amount) : loan.amount,
      transactionDate: new Date(),
      processedBy: req.user._id,
      remarks: remarks || `${loan.requestType === 'loan' ? 'Loan' : 'Salary advance'} disbursed`,
    });

    loan.workflow.history.push({
      step: 'disbursement',
      action: 'disbursed',
      actionBy: req.user._id,
      actionByName: req.user.name,
      actionByRole: req.user.role,
      comments: remarks || 'Loan disbursed',
      timestamp: new Date(),
    });

    await loan.save();

    await loan.populate([
      { path: 'employeeId', select: 'employee_name emp_no' },
      { path: 'disbursement.disbursedBy', select: 'name email' },
    ]);

    res.status(200).json({
      success: true,
      message: 'Loan disbursed successfully',
      data: loan,
    });
  } catch (error) {
    console.error('Error disbursing loan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to disburse loan',
    });
  }
};

// @desc    Record EMI payment for a loan
// @route   POST /api/loans/:id/pay-emi
// @access  Private (HR, Sub Admin, Super Admin)
exports.payEMI = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentDate, remarks, payrollCycle } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Payment amount is required and must be greater than 0',
      });
    }

    const loan = await Loan.findById(id).populate('employeeId', 'employee_name emp_no');

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
    }

    if (loan.requestType !== 'loan') {
      return res.status(400).json({
        success: false,
        error: 'This endpoint is only for loan EMI payments',
      });
    }

    if (!['disbursed', 'active'].includes(loan.status)) {
      return res.status(400).json({
        success: false,
        error: 'Loan must be disbursed or active to record payments',
      });
    }

    // Check if payment exceeds remaining balance
    const remainingBalance = loan.repayment.remainingBalance || loan.loanConfig.totalAmount || loan.amount;
    if (amount > remainingBalance) {
      return res.status(400).json({
        success: false,
        error: `Payment amount (₹${amount}) exceeds remaining balance (₹${remainingBalance})`,
      });
    }

    // Record transaction
    const transaction = {
      transactionType: 'emi_payment',
      amount: amount,
      transactionDate: paymentDate ? new Date(paymentDate) : new Date(),
      payrollCycle: payrollCycle || null,
      processedBy: req.user._id,
      remarks: remarks || 'EMI payment recorded',
    };

    loan.transactions.push(transaction);

    // Update repayment totals
    loan.repayment.totalPaid = (loan.repayment.totalPaid || 0) + amount;
    loan.repayment.remainingBalance = (loan.loanConfig.totalAmount || loan.amount) - loan.repayment.totalPaid;
    loan.repayment.installmentsPaid = (loan.repayment.installmentsPaid || 0) + 1;
    loan.repayment.lastPaymentDate = transaction.transactionDate;

    // Calculate next payment date (if not fully paid)
    if (loan.repayment.remainingBalance > 0 && loan.loanConfig.startDate) {
      const monthsPaid = loan.repayment.installmentsPaid;
      const nextDate = new Date(loan.loanConfig.startDate);
      nextDate.setMonth(nextDate.getMonth() + monthsPaid);
      loan.repayment.nextPaymentDate = nextDate;
    } else {
      loan.repayment.nextPaymentDate = null;
    }

    // Update status if fully paid
    if (loan.repayment.remainingBalance <= 0) {
      loan.status = 'completed';
      loan.repayment.remainingBalance = 0;
    } else if (loan.status === 'disbursed') {
      loan.status = 'active';
    }

    await loan.save();

    await loan.populate([
      { path: 'employeeId', select: 'employee_name emp_no' },
      { path: 'transactions.processedBy', select: 'name email' },
    ]);

    res.status(200).json({
      success: true,
      message: 'EMI payment recorded successfully',
      data: loan,
    });
  } catch (error) {
    console.error('Error recording EMI payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record EMI payment',
    });
  }
};

// @desc    Record advance deduction payment
// @route   POST /api/loans/:id/pay-advance
// @access  Private (HR, Sub Admin, Super Admin)
exports.payAdvance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentDate, remarks, payrollCycle } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Payment amount is required and must be greater than 0',
      });
    }

    const loan = await Loan.findById(id).populate('employeeId', 'employee_name emp_no');

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Salary advance not found',
      });
    }

    if (loan.requestType !== 'salary_advance') {
      return res.status(400).json({
        success: false,
        error: 'This endpoint is only for salary advance deductions',
      });
    }

    if (!['disbursed', 'active'].includes(loan.status)) {
      return res.status(400).json({
        success: false,
        error: 'Salary advance must be disbursed or active to record payments',
      });
    }

    // Check if payment exceeds remaining balance
    const remainingBalance = loan.repayment.remainingBalance || loan.amount;
    if (amount > remainingBalance) {
      return res.status(400).json({
        success: false,
        error: `Payment amount (₹${amount}) exceeds remaining balance (₹${remainingBalance})`,
      });
    }

    // Record transaction
    const transaction = {
      transactionType: 'advance_deduction',
      amount: amount,
      transactionDate: paymentDate ? new Date(paymentDate) : new Date(),
      payrollCycle: payrollCycle || null,
      processedBy: req.user._id,
      remarks: remarks || 'Advance deduction recorded',
    };

    loan.transactions.push(transaction);

    // Update repayment totals
    loan.repayment.totalPaid = (loan.repayment.totalPaid || 0) + amount;
    loan.repayment.remainingBalance = loan.amount - loan.repayment.totalPaid;
    loan.repayment.installmentsPaid = (loan.repayment.installmentsPaid || 0) + 1;
    loan.repayment.lastPaymentDate = transaction.transactionDate;

    // Update status if fully paid
    if (loan.repayment.remainingBalance <= 0) {
      loan.status = 'completed';
      loan.repayment.remainingBalance = 0;
    } else if (loan.status === 'disbursed') {
      loan.status = 'active';
    }

    await loan.save();

    await loan.populate([
      { path: 'employeeId', select: 'employee_name emp_no' },
      { path: 'transactions.processedBy', select: 'name email' },
    ]);

    res.status(200).json({
      success: true,
      message: 'Advance deduction recorded successfully',
      data: loan,
    });
  } catch (error) {
    console.error('Error recording advance deduction:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record advance deduction',
    });
  }
};

// @desc    Get transaction history for a loan/advance
// @route   GET /api/loans/:id/transactions
// @access  Private
exports.getTransactions = async (req, res) => {
  try {
    const { id } = req.params;

    const loan = await Loan.findById(id)
      .populate('employeeId', 'employee_name emp_no')
      .populate('transactions.processedBy', 'name email')
      .select('transactions requestType amount loanConfig advanceConfig repayment');

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan/Advance not found',
      });
    }

    // Sort transactions by date (newest first)
    const transactions = loan.transactions.sort((a, b) => {
      return new Date(b.transactionDate || b.createdAt) - new Date(a.transactionDate || a.createdAt);
    });

    res.status(200).json({
      success: true,
      data: {
        transactions,
        summary: {
          totalAmount: loan.requestType === 'loan' ? (loan.loanConfig.totalAmount || loan.amount) : loan.amount,
          totalPaid: loan.repayment.totalPaid || 0,
          remainingBalance: loan.repayment.remainingBalance || 0,
          installmentsPaid: loan.repayment.installmentsPaid || 0,
          totalInstallments: loan.repayment.totalInstallments || loan.duration,
          requestType: loan.requestType,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch transactions',
    });
  }
};

