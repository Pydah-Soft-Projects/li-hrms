const mongoose = require('mongoose');
const Loan = require('../model/Loan');
const LoanSettings = require('../model/LoanSettings');
const Employee = require('../../employees/model/Employee');
const User = require('../../users/model/User');
const { getResolvedLoanSettings } = require('../../departments/controllers/departmentSettingsController');
const { resolveLoanWorkflowSettings } = require('../../departments/services/divisionWorkflowResolver');
const { getEmployeeIdsInScope } = require('../../shared/middleware/dataScopeMiddleware');
const { notifyWorkflowEvent } = require('../../notifications/services/notificationService');
const Division = require('../../departments/model/Division');
const Department = require('../../departments/model/Department');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const {
  calculateEMI,
  syncLoanMoneyAndPayrollSchedule,
  setNextPaymentDateFromInstallmentsPaid,
  computeLoanPayrollAnchors,
  applyRepaymentScheduleFromPayrollMonth,
  firstPayrollMonthKeyForRepaymentSchedule,
  needsFirstDeductionPayPeriodSelection,
  normalizePayrollMonthKey,
  repairOpenLoanForHistory,
  repairOpenSalaryAdvanceForHistory,
} = require('../services/loanHistoryRepairService');
const { nextLoanApplicationFormNumber } = require('../services/loanApplicationFormSequence');

/** Write calculateEMI schedule fields onto loan document. */
function applyCalculatedEmiToLoan(loan, emiResult) {
  if (!loan || !emiResult) return;
  if (!loan.loanConfig) loan.loanConfig = {};
  loan.loanConfig.emiAmount = emiResult.emiAmount;
  loan.loanConfig.finalEmiAmount = emiResult.finalEmiAmount ?? emiResult.emiAmount;
  loan.loanConfig.installmentSchedule = Array.isArray(emiResult.installmentSchedule) ? emiResult.installmentSchedule : [];
  loan.loanConfig.regularInstallmentCount = emiResult.regularInstallmentCount ?? 0;
  loan.loanConfig.requestedDuration = emiResult.requestedDuration ?? loan.duration;
  loan.loanConfig.totalInterest = emiResult.totalInterest;
  loan.loanConfig.totalAmount = emiResult.totalAmount;
  loan.interestAmount = emiResult.totalInterest;
  if (!loan.repayment) loan.repayment = {};
  loan.repayment.totalInstallments = emiResult.totalInstallments ?? loan.duration;
}

function emiResultToLoanConfig(emiResult, extras = {}) {
  return {
    emiAmount: emiResult.emiAmount,
    finalEmiAmount: emiResult.finalEmiAmount ?? emiResult.emiAmount,
    installmentSchedule: emiResult.installmentSchedule || [],
    regularInstallmentCount: emiResult.regularInstallmentCount ?? 0,
    requestedDuration: emiResult.requestedDuration,
    totalInterest: emiResult.totalInterest,
    totalAmount: emiResult.totalAmount,
    ...extras,
  };
}
const { getPresentPayPeriod } = require('../../shared/utils/dateUtils');
const { EMP_NO_SORT, EMP_NO_COLLATION } = require('../../shared/utils/employeeSort');
const {
  buildLoanApprovalChain,
  ensureLoanApprovalChain,
  isLoanFinalApprovalStep,
  syncChainAfterWorkflowAction,
} = require('../services/loanWorkflowService');

// ============================================
// NO HARDCODED BYPASS - Uses database setting: workflow.allowHigherAuthorityToApproveLowerLevels
// ============================================

/**
 * Internal helper to cast ids to ObjectId for aggregation pipelines
 */
const toObjectId = (id) => {
  if (!id) return id;
  if (Array.isArray(id)) return id.map(toObjectId).filter(Boolean);
  try {
    if (mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id.toString());
    }
  } catch (e) {
    return id;
  }
  return id;
};


/**
 * Find employee by emp_no (MongoDB only)
 */
const findEmployeeByEmpNo = async (empNo) => {
  if (!empNo) return null;
  return Employee.findOne({ emp_no: empNo });
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

// Helper to calculate early settlement amount
const calculateEarlySettlement = (loan, settlementDate = new Date()) => {
  if (loan.requestType !== 'loan' || !loan.loanConfig) {
    return null; // Only loans have interest calculation
  }

  const principal = loan.amount;
  const interestRate = loan.loanConfig.interestRate || 0;
  const originalDuration = loan.duration; // months
  const originalTotalAmount = loan.loanConfig.totalAmount || principal;
  const originalInterest = originalTotalAmount - principal;

  // Calculate months used (from disbursement or applied date)
  const startDate = loan.disbursement?.disbursedAt || loan.appliedAt || loan.createdAt;
  const monthsUsed = Math.ceil((settlementDate - new Date(startDate)) / (1000 * 60 * 60 * 24 * 30));
  const actualMonthsUsed = Math.max(1, Math.min(monthsUsed, originalDuration));

  // Recalculate interest only for months used
  let recalculatedInterest = 0;
  if (interestRate > 0) {
    // Simple interest calculation: Principal × Rate × (Months/12)
    recalculatedInterest = principal * (interestRate / 100) * (actualMonthsUsed / 12);
  }

  // Calculate what has been paid so far
  const totalPaid = loan.repayment?.totalPaid || 0;
  const installmentsPaid = loan.repayment?.installmentsPaid || 0;

  // Calculate remaining principal (original principal - principal portion of payments)
  // For simplicity, we'll calculate based on EMI payments made
  let principalPaid = 0;
  if (installmentsPaid > 0 && loan.loanConfig.emiAmount) {
    // Calculate principal portion from EMIs paid
    const emiAmount = loan.loanConfig.emiAmount;
    const monthlyInterest = principal * (interestRate / 100) / 12;
    const monthlyPrincipal = emiAmount - monthlyInterest;
    principalPaid = monthlyPrincipal * installmentsPaid;
  }

  const remainingPrincipal = Math.max(0, principal - principalPaid);

  // Settlement amount = Remaining Principal + Interest for used period - Interest already paid
  const interestAlreadyPaid = totalPaid - principalPaid;
  const settlementInterest = Math.max(0, recalculatedInterest - interestAlreadyPaid);
  const settlementAmount = remainingPrincipal + settlementInterest;

  // Calculate savings
  const remainingMonths = originalDuration - actualMonthsUsed;
  const interestForRemainingMonths = principal * (interestRate / 100) * (remainingMonths / 12);
  const interestSavings = Math.max(0, interestForRemainingMonths);

  return {
    principal,
    originalDuration,
    originalTotalAmount,
    originalInterest,
    actualMonthsUsed,
    remainingMonths,
    recalculatedInterest,
    totalPaid,
    principalPaid,
    remainingPrincipal,
    interestAlreadyPaid,
    settlementInterest,
    settlementAmount: Math.round(settlementAmount),
    interestSavings: Math.round(interestSavings),
    totalSavings: Math.round(interestSavings + (originalTotalAmount - (remainingPrincipal + recalculatedInterest))),
  };
};

// @desc    Get all loans (with filters)
// @route   GET /api/loans
// @access  Private
exports.getLoans = async (req, res) => {
  try {
    const { status, employeeId, department, requestType, page = 1, limit = 20 } = req.query;
    const filter = { isActive: true, ...(req.scopeFilter || {}) };

    if (status) filter.status = status;
    if (employeeId) filter.employeeId = employeeId;
    if (department) filter.department = department;
    if (requestType) filter.requestType = requestType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [loans, total, presentPayPeriod] = await Promise.all([
      Loan.find(filter)
        .populate('employeeId', 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id')
        .populate('division_id', 'name code')
        .populate('department', 'name')
        .populate('designation', 'name')
        .populate('appliedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Loan.countDocuments(filter),
      getPresentPayPeriod(),
    ]);

    res.status(200).json({
      success: true,
      count: loans.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: loans,
      presentPayPeriod,
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

    const [loans, presentPayPeriod] = await Promise.all([
      Loan.find(filter)
        .populate('employeeId', 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id')
        .populate('division_id', 'name code')
        .populate('department', 'name')
        .populate('designation', 'name')
        .sort({ createdAt: -1 }),
      getPresentPayPeriod(),
    ]);

    res.status(200).json({
      success: true,
      count: loans.length,
      data: loans,
      presentPayPeriod,
    });
  } catch (error) {
    console.error('Error fetching my loans:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch loans',
    });
  }
};

// @desc    Get guarantor candidates for current user
// @route   GET /api/loans/guarantor-candidates
// @access  Private
exports.getGuarantorCandidates = async (req, res) => {
  try {
    const { search = '', limit = 60 } = req.query;

    // Resolve current employee first (supports both employeeRef and emp_no based login)
    let selfEmployee = null;
    if (req.user.employeeRef) {
      selfEmployee = await findEmployeeByIdOrEmpNo(req.user.employeeRef);
    } else if (req.user.employeeId) {
      selfEmployee = await findEmployeeByEmpNo(req.user.employeeId);
    }

    if (!selfEmployee) {
      return res.status(400).json({
        success: false,
        message: 'Current user is not linked to an employee record',
      });
    }

    // Keep candidate scope safe: same division and optionally same department.
    const baseFilter = {
      is_active: true,
      _id: { $ne: selfEmployee._id },
    };
    if (selfEmployee.division_id) {
      baseFilter.division_id = selfEmployee.division_id;
    }
    if (selfEmployee.department_id) {
      baseFilter.department_id = selfEmployee.department_id;
    }

    if (search && String(search).trim()) {
      const rx = new RegExp(String(search).trim(), 'i');
      baseFilter.$or = [
        { emp_no: rx },
        { employee_name: rx },
      ];
    }

    const max = Math.min(Math.max(parseInt(limit, 10) || 60, 1), 200);
    const employees = await Employee.find(baseFilter)
      .select('emp_no employee_name department_id designation_id division_id')
      .populate('department_id', 'name')
      .populate('designation_id', 'name')
      .sort(EMP_NO_SORT)
      .collation(EMP_NO_COLLATION)
      .limit(max);

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees.map((e) => ({
        _id: e._id,
        emp_no: e.emp_no,
        employee_name: e.employee_name,
        department: e.department_id ? { _id: e.department_id._id, name: e.department_id.name } : null,
        designation: e.designation_id ? { _id: e.designation_id._id, name: e.designation_id.name } : null,
        division_id: e.division_id || null,
      })),
    });
  } catch (error) {
    console.error('Error fetching guarantor candidates:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch guarantor candidates',
    });
  }
};

// @desc    Calculate salary advance eligibility
// @route   GET /api/loans/calculate-eligibility
// @access  Private
exports.calculateEligibility = async (req, res) => {
  try {
    const { empNo } = req.query;

    // Get employee - either from query or from logged-in user
    let employee;
    if (empNo) {
      // Check if user has permission to check for others
      const hasPermission = ['hr', 'hod', 'manager', 'sub_admin', 'super_admin'].includes(req.user.role);
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to check eligibility for others'
        });
      }
      employee = await findEmployeeByEmpNo(empNo);
    } else {
      // Get for self
      if (req.user.employeeRef) {
        employee = await findEmployeeByIdOrEmpNo(req.user.employeeRef);
      } else if (req.user.employeeId) {
        employee = await findEmployeeByEmpNo(req.user.employeeId);
      }
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Get salary advance settings
    const settings = await LoanSettings.findOne({
      type: 'salary_advance',
      isActive: true
    });

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Salary advance settings not configured'
      });
    }

    // Get current month attendance (AttendanceDaily uses uppercase status: PRESENT, PARTIAL, HALF_DAY)
    const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const firstDayOfMonth = `${currentMonth}-01`;
    const today = now.toISOString().split('T')[0];
    const empNoForQuery = (employee.emp_no && String(employee.emp_no).toUpperCase()) || employee.emp_no;

    const attendance = await AttendanceDaily.find({
      employeeNumber: empNoForQuery,
      date: {
        $gte: firstDayOfMonth,
        $lte: today
      }
    }).select('status').lean();

    // Calculate days
    const applicationDate = now.getDate();
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = applicationDate;

    // Calculate days worked: PRESENT/PARTIAL = 1 day, HALF_DAY = 0.5 (match AttendanceDaily enum)
    const presentOrPartial = attendance.filter(a =>
      a.status === 'PRESENT' || a.status === 'PARTIAL'
    ).length;
    const halfDays = attendance.filter(a => a.status === 'HALF_DAY').length;
    const effectiveDaysWorked = presentOrPartial + (halfDays * 0.5);

    // Attendance percentage
    const attendancePercentage = daysElapsed > 0
      ? (effectiveDaysWorked / daysElapsed) * 100
      : 0;

    // Get salary (use gross_salary as basic pay as per user's instruction)
    const basicSalary = employee.gross_salary || 0;

    if (!basicSalary || basicSalary === 0) {
      return res.status(400).json({
        success: false,
        message: 'Salary information not available. Please contact HR.'
      });
    }

    // Calculate eligible amount (prorated for days elapsed)
    const eligibleAmount = (daysElapsed / totalDaysInMonth) * basicSalary;

    // Calculate prorated amount (based on attendance)
    const considerAttendance = settings.settings?.salaryBasedLimits?.considerAttendance !== false;
    const proratedAmount = considerAttendance
      ? eligibleAmount * (attendancePercentage / 100)
      : eligibleAmount;

    // Calculate max limit (% of basic salary from settings)
    const maxPercentage = settings.settings?.salaryBasedLimits?.advancePercentage || 50;
    const maxLimitAmount = (maxPercentage / 100) * basicSalary;

    // Final max allowed: when considerAttendance is true, cap by attendance-prorated amount; else by time-eligible amount
    const finalMaxAllowed = considerAttendance
      ? Math.min(proratedAmount, maxLimitAmount)
      : Math.min(eligibleAmount, maxLimitAmount);

    res.json({
      success: true,
      data: {
        // Date info
        applicationDate,
        daysElapsedInMonth: daysElapsed,
        totalDaysInMonth,

        // Attendance info
        daysWorked: effectiveDaysWorked,
        attendancePercentage: Math.round(attendancePercentage * 100) / 100,
        attendanceRecords: attendance.length,

        // Salary info
        basicSalary,

        // Calculated amounts
        eligibleAmount: Math.round(eligibleAmount),
        proratedAmount: Math.round(proratedAmount),
        maxLimitAmount: Math.round(maxLimitAmount),
        finalMaxAllowed: Math.round(finalMaxAllowed),

        // Settings
        maxPercentage,
        considerAttendance,

        // Employee info
        employeeName: employee.employee_name,
        empNo: employee.emp_no
      }
    });
  } catch (error) {
    console.error('Error calculating eligibility:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate eligibility'
    });
  }
};

// @desc    Get single loan
// @route   GET /api/loans/:id
// @access  Private
async function ensureLoanApplicationFormNumber(loan) {
  if (loan.applicationFormNumber) return loan.applicationFormNumber;
  loan.applicationFormNumber = await nextLoanApplicationFormNumber();
  await loan.save();
  return loan.applicationFormNumber;
}

async function buildLoanApplicationPdfContext(loan) {
  const employeeId = loan.employeeId?._id || loan.employeeId;
  let previousAdvance = null;

  if (employeeId) {
    const prev = await Loan.findOne({
      employeeId,
      _id: { $ne: loan._id },
      isActive: true,
      status: { $in: ['disbursed', 'active', 'completed'] },
      appliedAt: { $lt: loan.appliedAt || loan.createdAt },
    })
      .sort({ appliedAt: -1 })
      .select('amount requestType disbursement.disbursedAt appliedAt')
      .lean();

    if (prev) {
      previousAdvance = {
        amount: prev.amount,
        drawnOnDate: prev.disbursement?.disbursedAt || prev.appliedAt,
        requestType: prev.requestType,
      };
    }
  }

  const division =
    loan.division_id && typeof loan.division_id === 'object'
      ? loan.division_id.name || ''
      : '';

  const grossSalary =
    loan.employeeId && typeof loan.employeeId === 'object'
      ? loan.employeeId.gross_salary
      : null;

  return {
    previousAdvance,
    grossSalary: grossSalary != null ? Number(grossSalary) : null,
    divisionName: division || null,
  };
}

exports.getLoan = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate(
        'employeeId',
        'employee_name emp_no gross_salary email phone_number bank_account_no bank_name bank_place ifsc_code',
      )
      .populate('department', 'name code')
      .populate('designation', 'name')
      .populate('division_id', 'name code')
      .populate('appliedBy', 'name email')
      .populate('workflow.history.actionBy', 'name email')
      .populate('approvals.hod.approvedBy', 'name email')
      .populate('approvals.manager.approvedBy', 'name email')
      .populate('approvals.hr.approvedBy', 'name email')
      .populate('approvals.final.approvedBy', 'name email')
      .populate('disbursement.disbursedBy', 'name email')
      .populate('cancellation.cancelledBy', 'name email')
      .populate('changeHistory.modifiedBy', 'name email')
      .populate({
        path: 'guarantors.employeeId',
        select: 'employee_name emp_no profilePhoto department_id designation_id division_id',
        populate: { path: 'department_id', select: 'name code' },
      });

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan application not found',
      });
    }

    if (loan.requestType === 'loan') {
      const updated = await syncLoanMoneyAndPayrollSchedule(loan);
      if (updated) {
        await loan.save();
      }
    }

    const wfSettings = await resolveLoanWorkflowSettings(loan.requestType, loan.division_id?._id || loan.division_id);
    ensureLoanApprovalChain(loan, wfSettings);
    loan.markModified('workflow');

    const presentPayPeriod = await getPresentPayPeriod();
    await ensureLoanApplicationFormNumber(loan);
    const applicationPdfContext = await buildLoanApplicationPdfContext(loan);

    res.status(200).json({
      success: true,
      data: loan,
      presentPayPeriod,
      applicationPdfContext,
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
      guarantorIds, // Array of employee IDs or emp_nos
    } = req.body;

    // Validate request type
    if (!['loan', 'salary_advance'].includes(requestType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request type. Must be "loan" or "salary_advance"',
      });
    }

    // Validate guarantors (at least two required for loans)
    if (requestType === 'loan' && (!guarantorIds || !Array.isArray(guarantorIds) || guarantorIds.length < 2)) {
      return res.status(400).json({
        success: false,
        error: 'At least two guarantors are required for a loan application',
      });
    }

    // Get employee - either from request body (HR applying for someone) or from user
    let employee;

    // Use empNo as primary identifier (from frontend)
    if (empNo) {
      // Check if user has permission to apply for others
      const hasRolePermission = ['hr', 'sub_admin', 'super_admin'].includes(req.user.role);

      console.log(`[Apply Loan] User ${req.user._id} (${req.user.role}) applying for employee ${empNo}`);
      console.log(`[Apply Loan] Has role permission: ${hasRolePermission} `);

      // Check workspace permissions if user has active workspace
      let hasWorkspacePermission = false;
      if (req.user.activeWorkspaceId) {
        try {
          const loanSettings = await LoanSettings.findOne({ type: requestType, isActive: true });
          if (loanSettings?.settings?.workspacePermissions) {
            const workspaceIdStr = String(req.user.activeWorkspaceId);
            const permissions = loanSettings.settings.workspacePermissions[workspaceIdStr];

            console.log(`[Apply Loan] Checking workspace ${workspaceIdStr} permissions: `, permissions);

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

      console.log(`[Apply Loan] Has workspace permission: ${hasWorkspacePermission} `);

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

    // Process Guarantors (only for loans)
    const processedGuarantors = [];
    if (requestType === 'loan' && guarantorIds && Array.isArray(guarantorIds)) {
      const uniqueGuarantorIds = new Set();

      for (const gId of guarantorIds) {
        const guarantor = await findEmployeeByIdOrEmpNo(gId);
        if (!guarantor) {
          return res.status(400).json({
            success: false,
            error: `Guarantor with ID ${gId} not found`,
          });
        }

        if (guarantor._id.toString() === employee._id.toString()) {
          return res.status(400).json({
            success: false,
            error: 'Applicant cannot be their own guarantor',
          });
        }

        if (uniqueGuarantorIds.has(guarantor._id.toString())) {
          continue; // Skip duplicate guarantors
        }

        uniqueGuarantorIds.add(guarantor._id.toString());
        processedGuarantors.push({
          employeeId: guarantor._id,
          emp_no: guarantor.emp_no,
          name: guarantor.employee_name,
          status: 'pending',
        });
      }

      if (processedGuarantors.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'At least two unique guarantors are required',
        });
      }
    }

    // Workflow: division override → global (limits still merged from department below)
    const workflowSettings = await resolveLoanWorkflowSettings(requestType, employee.division_id?._id || employee.division_id);

    // Get resolved settings (department + global fallback)
    let settings = workflowSettings.settings || {};
    if (employee.department_id) {
      const resolvedSettings = await getResolvedLoanSettings(employee.department_id, requestType, employee.division_id);
      if (resolvedSettings) {
        // Merge resolved settings with workflow settings
        // Map resolved settings (minTenure/maxTenure) to settings format (minDuration/maxDuration)
        settings = {
          ...settings,
          interestRate: resolvedSettings.interestRate ?? settings.interestRate,
          isInterestApplicable: resolvedSettings.isInterestApplicable ?? settings.isInterestApplicable,
          minDuration: resolvedSettings.minTenure ?? settings.minDuration,
          maxDuration: resolvedSettings.maxTenure ?? settings.maxDuration,
          minAmount: resolvedSettings.minAmount ?? settings.minAmount,
          maxAmount: resolvedSettings.maxAmount ?? settings.maxAmount,
          maxPerEmployee: resolvedSettings.maxPerEmployee ?? settings.maxPerEmployee,
          maxActivePerEmployee: resolvedSettings.maxActivePerEmployee ?? settings.maxActivePerEmployee,
          minServicePeriod: resolvedSettings.minServicePeriod ?? settings.minServicePeriod,
          // Keep workflow-specific settings from global
          eligibleDepartments: settings.eligibleDepartments,
          eligibleDesignations: settings.eligibleDesignations,
        };
      }
    }

    // Validate amount
    if (amount < (settings.minAmount || 1000)) {
      return res.status(400).json({
        success: false,
        error: `Amount must be at least ${settings.minAmount || 1000} `,
      });
    }

    if (settings.maxAmount && amount > settings.maxAmount) {
      return res.status(400).json({
        success: false,
        error: `Amount cannot exceed ${settings.maxAmount} `,
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
    let totalInterest = 0; // Declare in outer scope
    let firstEmiDueDate = null;

    if (requestType === 'loan') {
      const interestRate = settings.interestRate || 0;
      const emiResult = calculateEMI(amount, interestRate, duration);

      totalAmount = emiResult.totalAmount;
      totalInterest = emiResult.totalInterest;

      const anchors = await computeLoanPayrollAnchors(new Date(), emiResult.totalInstallments || duration);
      firstEmiDueDate = anchors.firstDueDate;

      loanConfig = emiResultToLoanConfig(emiResult, {
        interestRate,
        startDate: anchors.startDate,
        endDate: anchors.endDate,
      });
    } else {
      // Salary advance - calculate per cycle deduction
      const deductionPerCycle = amount / duration;
      advanceConfig = {
        deductionCycles: duration,
        deductionPerCycle: Math.round(deductionPerCycle),
      };
    }

    // Create loan application
    const loanPayload = {
      employeeId: employee._id,
      emp_no: employee.emp_no,
      requestType,
      amount,
      originalAmount: amount,
      reason,
      duration,
      interestAmount: requestType === 'loan' ? (totalInterest || 0) : 0,
      remarks,
      department: employee.department_id || employee.department,
      designation: employee.designation_id || employee.designation,
      division_id: employee.division_id || employee.division,
      appliedBy: req.user._id,
      appliedAt: new Date(),
      status: 'pending',
      advanceConfig,
      guarantors: processedGuarantors,
      repayment: {
        totalPaid: 0,
        remainingBalance: requestType === 'loan' ? totalAmount : amount,
        installmentsPaid: 0,
        totalInstallments: requestType === 'loan' ? (loanConfig.installmentSchedule?.length || duration) : duration,
        nextPaymentDate: requestType === 'loan' ? firstEmiDueDate : null,
      },
    };
    if (requestType === 'loan') {
      loanPayload.loanConfig = loanConfig;
    }
    const loan = new Loan(loanPayload);
    loan.applicationFormNumber = await nextLoanApplicationFormNumber();

    const wfSettings = await resolveLoanWorkflowSettings(requestType, employee.division_id?._id || employee.division_id);
    const approvalChain = buildLoanApprovalChain(wfSettings);
    const initialApprover = approvalChain[0]?.role || 'hod';
    const initialStep =
      initialApprover === 'final_authority' ? 'final' : ['hod', 'manager', 'hr'].includes(initialApprover) ? initialApprover : 'hod';

    loan.workflow = {
      currentStep: initialStep,
      nextApprover: initialApprover,
      nextApproverRole: initialApprover,
      finalAuthority: wfSettings?.workflow?.finalAuthority?.role || 'hr',
      approvalChain,
      isCompleted: false,
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
    };

    await loan.save();

    // Populate for response
    await loan.populate([
      { path: 'employeeId', select: 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id' },
      { path: 'department', select: 'name' },
      { path: 'designation', select: 'name' },
    ]);

    res.status(201).json({
      success: true,
      message: `${requestType === 'loan' ? 'Loan' : 'Salary advance'} application submitted successfully`,
      data: loan,
    });

    notifyWorkflowEvent({
      module: requestType === 'loan' ? 'loan' : 'salary_advance',
      eventType: requestType === 'loan' ? 'LOAN_APPLIED' : 'SALARY_ADVANCE_APPLIED',
      record: loan,
      actor: req.user,
      title: requestType === 'loan' ? 'Loan Request Submitted' : 'Salary Advance Request Submitted',
      message: `${requestType === 'loan' ? 'Loan' : 'Salary advance'} request submitted by ${req.user.name}.`,
      nextApproverRole: loan?.workflow?.nextApprover || null,
      priority: 'medium',
    }).catch((err) => console.error('[Notification] LOAN_APPLIED failed:', err.message));
  } catch (error) {
    console.error('Error applying loan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply for loan/advance',
    });
  }
};

// @desc    Get guarantor requests for the current user
// @route   GET /api/loans/guarantor-requests
// @access  Private
exports.getGuarantorRequests = async (req, res) => {
  try {
    const employeeId = req.user.employeeRef || req.user.employeeId;
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        error: 'Current user is not linked to an employee record',
      });
    }

    // Find employee to get their MongoDB ID if they only have emp_no
    let mongoEmployeeId = req.user.employeeRef;
    if (!mongoEmployeeId) {
      const employee = await findEmployeeByEmpNo(req.user.employeeId);
      if (employee) mongoEmployeeId = employee._id;
    }

    if (!mongoEmployeeId) {
      return res.status(404).json({
        success: false,
        error: 'Associated employee record not found',
      });
    }

    const loans = await Loan.find({
      'guarantors.employeeId': mongoEmployeeId,
      isActive: true,
    })
      .populate('employeeId', 'employee_name emp_no profilePhoto department_id designation_id division_id')
      .populate('department', 'name')
      .populate('designation', 'name')
      .sort({ appliedAt: -1 });

    res.status(200).json({
      success: true,
      count: loans.length,
      data: loans,
    });
  } catch (error) {
    console.error('Error fetching guarantor requests:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch guarantor requests',
    });
  }
};

// @desc    Process guarantor action (accept/reject)
// @route   PUT /api/loans/:id/guarantor-action
// @access  Private
exports.processGuarantorAction = async (req, res) => {
  try {
    const { action, remarks } = req.body;
    const { id } = req.params;

    if (!['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Must be "accepted" or "rejected"',
      });
    }

    const loan = await Loan.findById(id);
    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan application not found',
      });
    }

    // Identify current user's employee record
    let mongoEmployeeId = req.user.employeeRef;
    if (!mongoEmployeeId) {
      const employee = await findEmployeeByEmpNo(req.user.employeeId);
      if (employee) mongoEmployeeId = employee._id;
    }

    if (!mongoEmployeeId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to perform guarantor actions',
      });
    }

    // Find the guarantor entry for this user
    const guarantorEntry = loan.guarantors.find(
      (g) => g.employeeId.toString() === mongoEmployeeId.toString()
    );

    if (!guarantorEntry) {
      return res.status(403).json({
        success: false,
        error: 'You are not listed as a guarantor for this loan',
      });
    }

    if (guarantorEntry.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `You have already ${guarantorEntry.status} this request`,
      });
    }

    // Update guarantor status
    guarantorEntry.status = action;
    guarantorEntry.actionAt = new Date();
    guarantorEntry.remarks = remarks;

    // Add to history
    loan.workflow.history.push({
      step: 'guarantor',
      action: action === 'accepted' ? 'approved' : 'rejected',
      actionBy: req.user._id,
      actionByName: req.user.name,
      actionByRole: 'guarantor',
      comments: remarks || `Guarantor ${action} the request`,
      timestamp: new Date(),
    });

    await loan.save();

    res.status(200).json({
      success: true,
      message: `Request successfully ${action}`,
      data: loan,
    });

    notifyWorkflowEvent({
      module: loan.requestType === 'loan' ? 'loan' : 'salary_advance',
      eventType: action === 'accepted' ? 'LOAN_GUARANTOR_ACCEPTED' : 'LOAN_GUARANTOR_REJECTED',
      record: loan,
      actor: req.user,
      title: `Guarantor ${action === 'accepted' ? 'Accepted' : 'Rejected'}: ${req.user.name}`,
      message: `${req.user.name} (${req.user.employeeId || 'guarantor'}) ${action} as guarantor for ${loan.requestType === 'loan' ? 'loan' : 'salary advance'} request of ${loan.emp_no}. Current loan status: ${loan.status}.`,
      nextApproverRole: loan?.workflow?.nextApprover || null,
      priority: action === 'rejected' ? 'high' : 'medium',
    }).catch((err) => console.error('[Notification] LOAN_GUARANTOR_ACTION failed:', err.message));
  } catch (error) {
    console.error('Error processing guarantor action:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process guarantor action',
    });
  }
};

const LOAN_EDIT_CLOSED_STATUSES = ['completed', 'cancelled', 'rejected'];
const LOAN_EDIT_FINANCIAL_ACTIVE = ['disbursed', 'active', 'approved'];

function canUserEditLoan(loan, user) {
  const role = user?.role;
  const isOwner = loan.appliedBy?.toString() === user?._id?.toString();
  const isAdmin = ['hr', 'sub_admin', 'super_admin', 'manager'].includes(role);
  if (LOAN_EDIT_CLOSED_STATUSES.includes(loan.status)) return false;
  if (isAdmin) return true;
  if (isOwner && ['draft', 'pending'].includes(loan.status)) return true;
  return false;
}

function canUserEditLoanFinancials(loan, user) {
  const role = user?.role;
  if (LOAN_EDIT_CLOSED_STATUSES.includes(loan.status)) return false;
  if (['super_admin', 'hr', 'sub_admin'].includes(role)) return true;
  if (LOAN_EDIT_FINANCIAL_ACTIVE.includes(loan.status)) return false;
  return ['draft', 'pending', 'hod_approved', 'manager_approved', 'hr_approved'].includes(loan.status);
}

function pushLoanChange(loan, changes, field, originalValue, newValue, user, reason) {
  if (originalValue === newValue) return;
  changes.push({
    field,
    originalValue,
    newValue,
    modifiedBy: user._id,
    modifiedByName: user.name,
    modifiedByRole: user.role,
    modifiedAt: new Date(),
    reason: reason || null,
  });
}

// @desc    Update loan/advance application
// @route   PUT /api/loans/:id
// @access  Private
exports.updateLoan = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan/Advance application not found',
      });
    }

    if (!canUserEditLoan(loan, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this loan/advance',
      });
    }

    const changeReason = req.body.changeReason?.trim() || null;
    const recalculate = req.body.recalculate === true || req.body.recalculate === 'true';
    const canEditFinancials = canUserEditLoanFinancials(loan, req.user);
    const isSuperAdmin = req.user.role === 'super_admin';
    const changes = [];

    const scalarFields = ['amount', 'reason', 'duration', 'remarks'];
    const financialScalars = ['amount', 'duration'];

    for (const field of scalarFields) {
      if (req.body[field] === undefined) continue;
      if (financialScalars.includes(field) && !canEditFinancials) {
        return res.status(403).json({
          success: false,
          error: `Not authorized to change ${field} for this loan status`,
        });
      }
      let newValue = req.body[field];
      if (field === 'amount') newValue = parseFloat(newValue);
      if (field === 'duration') newValue = parseInt(newValue, 10);
      if (Number.isNaN(newValue)) {
        return res.status(400).json({ success: false, error: `Invalid ${field}` });
      }
      const originalValue = loan[field];
      if (originalValue !== newValue) {
        pushLoanChange(loan, changes, field, originalValue, newValue, req.user, changeReason);
        loan[field] = newValue;
      }
    }

    if (loan.requestType === 'loan' && req.body.interestRate !== undefined) {
      if (!canEditFinancials) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to change interest rate for this loan status',
        });
      }
      const newRate = parseFloat(req.body.interestRate);
      if (Number.isNaN(newRate) || newRate < 0) {
        return res.status(400).json({ success: false, error: 'Invalid interest rate' });
      }
      if (!loan.loanConfig) loan.loanConfig = {};
      const oldRate = loan.loanConfig.interestRate ?? 0;
      if (oldRate !== newRate) {
        pushLoanChange(loan, changes, 'interestRate', oldRate, newRate, req.user, changeReason);
        loan.loanConfig.interestRate = newRate;
        loan.markModified('loanConfig');
      }
    }

    if (req.body.firstDeductionPayrollMonth !== undefined && loan.requestType === 'loan') {
      if (!canEditFinancials) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to change deduction schedule for this loan status',
        });
      }
      const ym = normalizePayrollMonthKey(req.body.firstDeductionPayrollMonth);
      if (!ym) {
        return res.status(400).json({ success: false, error: 'Invalid first deduction month (use YYYY-MM)' });
      }
      if (!loan.approvals) loan.approvals = {};
      if (!loan.approvals.final) loan.approvals.final = {};
      const oldYm = loan.approvals.final.firstDeductionPayrollMonth || null;
      if (oldYm !== ym) {
        pushLoanChange(loan, changes, 'firstDeductionPayrollMonth', oldYm, ym, req.user, changeReason);
        loan.approvals.final.firstDeductionPayrollMonth = ym;
        loan.markModified('approvals');
      }
    }

    if (loan.requestType === 'salary_advance' && req.body.deductionStartCycle !== undefined) {
      if (!canEditFinancials) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to change deduction start cycle for this advance status',
        });
      }
      const ym = normalizePayrollMonthKey(req.body.deductionStartCycle);
      if (!ym) {
        return res.status(400).json({ success: false, error: 'Invalid deduction start cycle (use YYYY-MM)' });
      }
      if (!loan.advanceConfig) loan.advanceConfig = {};
      const oldYm = loan.advanceConfig.deductionStartCycle || null;
      if (oldYm !== ym) {
        pushLoanChange(loan, changes, 'deductionStartCycle', oldYm, ym, req.user, changeReason);
        loan.advanceConfig.deductionStartCycle = ym;
        loan.markModified('advanceConfig');
      }
    }

    if (isSuperAdmin && req.body.status !== undefined) {
      const oldStatus = loan.status;
      const newStatus = req.body.status;
      if (oldStatus !== newStatus) {
        pushLoanChange(loan, changes, 'status', oldStatus, newStatus, req.user, req.body.statusChangeReason || changeReason);
        loan.status = newStatus;
        if (!loan.workflow.history) loan.workflow.history = [];
        loan.workflow.history.push({
          step: 'admin',
          action: 'status_changed',
          actionBy: req.user._id,
          actionByName: req.user.name,
          actionByRole: req.user.role,
          comments: `Status changed from ${oldStatus} to ${newStatus}${req.body.statusChangeReason ? ': ' + req.body.statusChangeReason : ''}`,
          timestamp: new Date(),
        });
        if (newStatus === 'pending') {
          loan.workflow.currentStep = 'hod';
          loan.workflow.nextApprover = 'hod';
        } else if (newStatus === 'hod_approved') {
          loan.workflow.currentStep = 'hr';
          loan.workflow.nextApprover = 'hr';
        } else if (newStatus === 'hr_approved') {
          loan.workflow.currentStep = 'final';
          loan.workflow.nextApprover = 'final_authority';
        } else if (newStatus === 'approved') {
          loan.workflow.currentStep = 'final';
          loan.workflow.nextApprover = null;
        }
      }
    }

    const financialFieldChanged = changes.some((c) =>
      ['amount', 'duration', 'interestRate', 'firstDeductionPayrollMonth', 'deductionStartCycle'].includes(c.field)
    );

    if (financialFieldChanged && !changeReason) {
      return res.status(400).json({
        success: false,
        error: 'Reason for change is required when updating financial fields',
      });
    }

    if (changes.length > 0) {
      if (!loan.changeHistory) loan.changeHistory = [];
      loan.changeHistory.push(...changes);
    }

    const shouldRecalculate =
      recalculate ||
      (financialFieldChanged &&
        !['draft', 'pending'].includes(loan.status) &&
        LOAN_EDIT_FINANCIAL_ACTIVE.includes(loan.status));

    const firstDeductionChanged = changes.some((c) => c.field === 'firstDeductionPayrollMonth');
    if (firstDeductionChanged && loan.requestType === 'loan' && loan.approvals?.final?.firstDeductionPayrollMonth) {
      await applyRepaymentScheduleFromPayrollMonth(loan, loan.approvals.final.firstDeductionPayrollMonth);
    }

    if (shouldRecalculate && financialFieldChanged) {
      if (loan.requestType === 'loan') {
        await repairOpenLoanForHistory(loan);
      } else {
        await repairOpenSalaryAdvanceForHistory(loan);
      }
    } else if (financialFieldChanged) {
      const settings = await LoanSettings.findOne({ type: loan.requestType, isActive: true });
      const amount = Number(loan.amount);
      const duration = Number(loan.duration);
      if (settings && amount > 0 && duration > 0) {
        if (loan.requestType === 'loan') {
          if (!loan.loanConfig) loan.loanConfig = {};
          const rate =
            loan.loanConfig.interestRate !== undefined && loan.loanConfig.interestRate !== null
              ? Number(loan.loanConfig.interestRate)
              : settings.interestRate || 0;
          const emiResult = calculateEMI(amount, rate, duration);
          const scheduleLocked = Boolean(loan.approvals?.final?.firstDeductionPayrollMonth);
          applyCalculatedEmiToLoan(loan, emiResult);
          loan.loanConfig.interestRate = rate;
          const totalPaid = Number(loan.repayment.totalPaid) || 0;
          loan.repayment.remainingBalance = Math.max(0, emiResult.totalAmount - totalPaid);
          if (!scheduleLocked && !['disbursed', 'active'].includes(loan.status)) {
            const ref = loan.appliedAt || loan.createdAt || new Date();
            const anchors = await computeLoanPayrollAnchors(ref, emiResult.totalInstallments || duration);
            loan.loanConfig.startDate = anchors.startDate;
            loan.loanConfig.endDate = anchors.endDate;
          }
          loan.markModified('loanConfig');
          loan.markModified('repayment');
        } else {
          if (!loan.advanceConfig) loan.advanceConfig = {};
          loan.advanceConfig.deductionCycles = duration;
          loan.advanceConfig.deductionPerCycle = Math.round(amount / duration);
          if (!loan.repayment) loan.repayment = {};
          loan.repayment.totalInstallments = duration;
          const totalPaid = Number(loan.repayment.totalPaid) || 0;
          loan.repayment.remainingBalance = Math.max(0, amount - totalPaid);
          loan.markModified('advanceConfig');
          loan.markModified('repayment');
        }
      }
    }

    if (recalculate && !financialFieldChanged && ['disbursed', 'active', 'approved'].includes(loan.status)) {
      if (loan.requestType === 'loan') {
        await syncLoanMoneyAndPayrollSchedule(loan);
      } else {
        await repairOpenSalaryAdvanceForHistory(loan);
      }
    }

    await loan.save();

    try {
      await loan.populate([
        { path: 'employeeId', select: 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id' },
        { path: 'department', select: 'name' },
        { path: 'designation', select: 'name' },
        { path: 'changeHistory.modifiedBy', select: 'name email role' },
      ]);
    } catch (populateErr) {
      // Populate failure should not fail the update itself (e.g. missing model registration in isolated scripts).
      console.warn('Populate failed in updateLoan:', populateErr?.message || populateErr);
    }

    res.status(200).json({
      success: true,
      message: `${loan.requestType === 'loan' ? 'Loan' : 'Salary advance'} updated successfully`,
      data: loan,
      changes,
      recalculated: shouldRecalculate || (recalculate && !financialFieldChanged),
    });
  } catch (error) {
    console.error('Error updating loan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update loan/advance',
    });
  }
};

const REPAYMENT_CORRECTION_STATUSES = ['disbursed', 'active'];

function canCorrectLoanRepayment(loan, user) {
  if (LOAN_EDIT_CLOSED_STATUSES.includes(loan.status)) return false;
  if (!REPAYMENT_CORRECTION_STATUSES.includes(loan.status)) return false;
  return ['hr', 'sub_admin', 'super_admin', 'manager'].includes(user?.role);
}

function getLoanTotalRecoverable(loan) {
  if (loan.requestType === 'loan') {
    const totalAmount = Number(loan.loanConfig?.totalAmount);
    if (totalAmount > 0) return totalAmount;
    return Number(loan.amount) || 0;
  }
  return Number(loan.amount) || 0;
}

// @desc    Correct repayment totals after disbursement (opening balance / migration)
// @route   PUT /api/loans/:id/repayment-correction
// @access  Private (HR/Admin)
exports.correctLoanRepayment = async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ success: false, error: 'Loan/Advance application not found' });
    }
    if (!canCorrectLoanRepayment(loan, req.user)) {
      return res.status(403).json({
        success: false,
        error: 'Repayment correction is only allowed for disbursed/active loans by HR/Admin',
      });
    }

    const changeReason = req.body.changeReason?.trim();
    if (!changeReason) {
      return res.status(400).json({
        success: false,
        error: 'Remarks / reason for correction is required',
      });
    }

    const hasTotalPaid = req.body.totalPaid !== undefined && req.body.totalPaid !== '';
    const hasInstallmentsPaid = req.body.installmentsPaid !== undefined && req.body.installmentsPaid !== '';
    const hasRemaining = req.body.remainingBalance !== undefined && req.body.remainingBalance !== '';
    const hasTotalInstallments = req.body.totalInstallments !== undefined && req.body.totalInstallments !== '';

    if (!hasTotalPaid && !hasInstallmentsPaid && !hasRemaining && !hasTotalInstallments) {
      return res.status(400).json({
        success: false,
        error: 'Provide at least one of: totalPaid, installmentsPaid, remainingBalance, totalInstallments',
      });
    }

    if (!loan.repayment) loan.repayment = {};
    const changes = [];
    const totalRecoverable = getLoanTotalRecoverable(loan);

    if (hasTotalInstallments) {
      const totalInstallments = parseInt(req.body.totalInstallments, 10);
      if (Number.isNaN(totalInstallments) || totalInstallments < 1) {
        return res.status(400).json({ success: false, error: 'Invalid total installments' });
      }
      const old = loan.repayment.totalInstallments ?? loan.duration;
      if (old !== totalInstallments) {
        pushLoanChange(loan, changes, 'repayment.totalInstallments', old, totalInstallments, req.user, changeReason);
        loan.repayment.totalInstallments = totalInstallments;
        loan.duration = totalInstallments;
        if (loan.requestType === 'salary_advance' && loan.advanceConfig) {
          loan.advanceConfig.deductionCycles = totalInstallments;
          loan.advanceConfig.deductionPerCycle = Math.round(Number(loan.amount) / totalInstallments);
          loan.markModified('advanceConfig');
        }
      }
    } else if (!loan.repayment.totalInstallments) {
      loan.repayment.totalInstallments = Number(loan.duration) || 1;
    }

    if (hasInstallmentsPaid) {
      const installmentsPaid = parseInt(req.body.installmentsPaid, 10);
      if (Number.isNaN(installmentsPaid) || installmentsPaid < 0) {
        return res.status(400).json({ success: false, error: 'Invalid installments paid' });
      }
      const totalInst = Number(loan.repayment.totalInstallments) || Number(loan.duration) || 1;
      if (installmentsPaid > totalInst) {
        return res.status(400).json({
          success: false,
          error: `Installments paid cannot exceed total installments (${totalInst})`,
        });
      }
      const old = Number(loan.repayment.installmentsPaid) || 0;
      if (old !== installmentsPaid) {
        pushLoanChange(loan, changes, 'repayment.installmentsPaid', old, installmentsPaid, req.user, changeReason);
        loan.repayment.installmentsPaid = installmentsPaid;
      }
    }

    if (hasTotalPaid) {
      const totalPaid = parseFloat(req.body.totalPaid);
      if (Number.isNaN(totalPaid) || totalPaid < 0) {
        return res.status(400).json({ success: false, error: 'Invalid total paid amount' });
      }
      if (totalRecoverable > 0 && totalPaid > totalRecoverable) {
        return res.status(400).json({
          success: false,
          error: `Total paid cannot exceed total recoverable (₹${totalRecoverable})`,
        });
      }
      const old = Number(loan.repayment.totalPaid) || 0;
      if (old !== totalPaid) {
        pushLoanChange(loan, changes, 'repayment.totalPaid', old, totalPaid, req.user, changeReason);
        loan.repayment.totalPaid = totalPaid;
      }
    }

    if (hasRemaining) {
      const remainingBalance = parseFloat(req.body.remainingBalance);
      if (Number.isNaN(remainingBalance) || remainingBalance < 0) {
        return res.status(400).json({ success: false, error: 'Invalid remaining balance' });
      }
      if (totalRecoverable > 0 && remainingBalance > totalRecoverable) {
        return res.status(400).json({
          success: false,
          error: `Remaining balance cannot exceed total recoverable (₹${totalRecoverable})`,
        });
      }
      const old = Number(loan.repayment.remainingBalance) || 0;
      if (old !== remainingBalance) {
        pushLoanChange(loan, changes, 'repayment.remainingBalance', old, remainingBalance, req.user, changeReason);
        loan.repayment.remainingBalance = remainingBalance;
      }
    } else if (hasTotalPaid && totalRecoverable > 0) {
      const totalPaid = Number(loan.repayment.totalPaid) || 0;
      const remainingBalance = Math.max(0, totalRecoverable - totalPaid);
      const old = Number(loan.repayment.remainingBalance) || 0;
      if (old !== remainingBalance) {
        pushLoanChange(loan, changes, 'repayment.remainingBalance', old, remainingBalance, req.user, changeReason);
        loan.repayment.remainingBalance = remainingBalance;
      }
    }

    if (req.body.remarks !== undefined) {
      const newRemarks = String(req.body.remarks).trim();
      if (loan.remarks !== newRemarks) {
        pushLoanChange(loan, changes, 'remarks', loan.remarks, newRemarks, req.user, changeReason);
        loan.remarks = newRemarks;
      }
    } else {
      const stamp = `[Repayment correction ${new Date().toISOString().slice(0, 10)}] ${changeReason}`;
      loan.remarks = loan.remarks ? `${loan.remarks}\n${stamp}` : stamp;
    }

    if (changes.length > 0) {
      if (!loan.changeHistory) loan.changeHistory = [];
      loan.changeHistory.push(...changes);

      if (!loan.transactions) loan.transactions = [];
      loan.transactions.push({
        transactionType: 'adjustment',
        amount: 0,
        transactionDate: new Date(),
        processedBy: req.user._id,
        remarks: changeReason,
      });
    }

    const remaining = Number(loan.repayment.remainingBalance) || 0;
    if (remaining <= 0) {
      loan.repayment.remainingBalance = 0;
      loan.repayment.nextPaymentDate = null;
      if (loan.status !== 'completed') {
        pushLoanChange(loan, changes, 'status', loan.status, 'completed', req.user, changeReason);
        loan.status = 'completed';
        if (!loan.workflow.history) loan.workflow.history = [];
        loan.workflow.history.push({
          step: 'admin',
          action: 'status_changed',
          actionBy: req.user._id,
          actionByName: req.user.name,
          actionByRole: req.user.role,
          comments: `Marked completed after repayment correction: ${changeReason}`,
          timestamp: new Date(),
        });
      }
    } else if (loan.status === 'completed') {
      loan.status = 'active';
    } else {
      try {
        await setNextPaymentDateFromInstallmentsPaid(loan);
      } catch (scheduleErr) {
        console.warn('setNextPaymentDateFromInstallmentsPaid failed:', scheduleErr?.message || scheduleErr);
      }
    }

    loan.markModified('repayment');
    await loan.save();

    try {
      await loan.populate([
        { path: 'employeeId', select: 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id' },
        { path: 'department', select: 'name' },
        { path: 'designation', select: 'name' },
      ]);
    } catch (populateErr) {
      console.warn('Populate failed in correctLoanRepayment:', populateErr?.message || populateErr);
    }

    const totalInst = Number(loan.repayment.totalInstallments) || Number(loan.duration) || 0;
    const paidInst = Number(loan.repayment.installmentsPaid) || 0;

    res.status(200).json({
      success: true,
      message: 'Repayment status updated successfully',
      data: loan,
      changes,
      summary: {
        totalRecoverable,
        totalPaid: loan.repayment.totalPaid,
        remainingBalance: loan.repayment.remainingBalance,
        installmentsPaid: paidInst,
        installmentsRemaining: Math.max(0, totalInst - paidInst),
        totalInstallments: totalInst,
      },
    });
  } catch (error) {
    console.error('Error correcting loan repayment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to correct repayment',
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

    // Determine what the user can approve based on their role (use divisionMapping for scope)
    if (userRole === 'hod') {
      filter['workflow.nextApprover'] = 'hod';
      const scopedEmployeeIds = await getEmployeeIdsInScope(req.user);
      if (scopedEmployeeIds.length > 0) {
        filter.employeeId = { $in: scopedEmployeeIds };
      } else {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
    } else if (userRole === 'manager') {
      filter['workflow.nextApprover'] = 'manager';
      const scopedEmployeeIds = await getEmployeeIdsInScope(req.user);
      if (scopedEmployeeIds.length > 0) {
        filter.employeeId = { $in: scopedEmployeeIds };
      } else {
        return res.status(200).json({ success: true, count: 0, data: [] });
      }
    } else if (userRole === 'hr') {
      filter['workflow.nextApprover'] = { $in: ['hr', 'final_authority'] };
    } else if (['sub_admin', 'super_admin'].includes(userRole)) {
      filter.status = { $nin: ['approved', 'rejected', 'cancelled', 'completed', 'disbursed', 'active', 'hod_rejected', 'manager_rejected', 'hr_rejected'] };
    } else {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view pending approvals',
      });
    }

    const loans = await Loan.find(filter)
      .populate('employeeId', 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id')
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
// @access  Private (HOD, Manager, HR, Admin)
exports.processLoanAction = async (req, res) => {
  try {
    const { action, comments, approvalAmount, approvalInterestRate, firstDeductionPayrollMonth } = req.body;
    const loan = await Loan.findById(req.params.id)
      .populate('division_id')
      .populate('employeeId', 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id');

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan application not found',
      });
    }

    if (loan.workflow.currentStep === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'This application has already been processed and is in a terminal state.',
      });
    }

    const userRole = req.user.role;
    const currentApprover = loan.workflow.nextApprover;
    if (!currentApprover) {
      return res.status(400).json({
        success: false,
        error: 'Current approval step is missing from the record.',
      });
    }
    const isSuperAdmin = ['super_admin', 'sub_admin'].includes(userRole);
    const isHR = userRole === 'hr';

    // Active workflow for this loan (division override → global)
    const settings = await resolveLoanWorkflowSettings(loan.requestType, loan.division_id?._id || loan.division_id);
    ensureLoanApprovalChain(loan, settings);
    const allowBypass = settings?.workflow?.allowHigherAuthorityToApproveLowerLevels || false;

    // Validate user can perform this action
    let canProcess = false;

    if (isSuperAdmin) {
      // Super Admin can process if it's their step OR if bypass is enabled
      if (allowBypass || ['hr', 'admin', 'super_admin', 'final_authority'].includes(currentApprover)) {
        canProcess = true;
      }
    }

    if (!canProcess && isHR) {
      // HR can process if it's their step OR if bypass is enabled (they are considered higher than HOD/Manager)
      if (['hr', 'final_authority'].includes(currentApprover)) {
        canProcess = true;
      } else if (allowBypass) {
        canProcess = true;
      }
    }

    if (!canProcess && currentApprover === 'reporting_manager') {
      // 1. Check if user is the assigned Reporting Manager
      const targetEmployee = await Employee.findById(loan.employeeId);
      const managers = targetEmployee?.dynamicFields?.reporting_to;

      if (managers && Array.isArray(managers) && managers.length > 0) {
        const userIdStr = req.user._id.toString();
        canProcess = managers.some(m => (m._id || m).toString() === userIdStr);
      }

      // 2. Fallback to HOD if no managers assigned OR if user is an HOD for the employee
      if (!canProcess && userRole === 'hod') {
        const loanDeptId = (loan.department_id || loan.department)?.toString();
        const loanDivId = (loan.division_id || loan.division)?.toString();
        const mapping = req.user.divisionMapping?.find(m =>
          (m.division?._id || m.division)?.toString() === loanDivId
        );
        canProcess = mapping
          ? (!mapping.departments || mapping.departments.length === 0) || mapping.departments.some(d => (d?._id || d).toString() === loanDeptId)
          : false;
      }
    } else if (['hr', 'final_authority'].includes(currentApprover) && userRole === 'hr') {
      canProcess = true;
    }

    if (!canProcess) {
      return res.status(403).json({
        success: false,
        error: `Not authorized to process this application (Current Approver: ${currentApprover})`,
      });
    }

    // Handle Updates if provided during approval (Amount or Interest Rate)
    const isAuthorizedForEdits = ['super_admin', 'hr', 'sub_admin'].includes(userRole);
    let configChanged = false;

    if (action === 'approve' && isAuthorizedForEdits) {
      // 1. Handle Interest Rate Update (only for loans)
      if (loan.requestType === 'loan' && approvalInterestRate !== undefined && !isNaN(parseFloat(approvalInterestRate))) {
        const newRate = parseFloat(approvalInterestRate);
        if (!loan.loanConfig) loan.loanConfig = {};
        if (newRate !== loan.loanConfig.interestRate) {
          const oldRate = loan.loanConfig.interestRate || 0;
          loan.loanConfig.interestRate = newRate;
          configChanged = true;

          loan.changeHistory.push({
            field: 'interestRate',
            originalValue: oldRate,
            newValue: newRate,
            modifiedBy: req.user._id,
            modifiedByName: req.user.name,
            modifiedByRole: userRole,
            modifiedAt: new Date(),
            reason: comments || `Interest rate adjusted to ${newRate}% during ${currentApprover} approval`,
          });
        }
      }

      // 2. Handle Amount Update
      if (approvalAmount !== undefined && !isNaN(parseFloat(approvalAmount)) && parseFloat(approvalAmount) !== loan.amount) {
        const oldAmount = loan.amount;
        const newAmount = parseFloat(approvalAmount);
        loan.amount = newAmount;
        configChanged = true;

        loan.changeHistory.push({
          field: 'amount',
          originalValue: oldAmount,
          newValue: newAmount,
          modifiedBy: req.user._id,
          modifiedByName: req.user.name,
          modifiedByRole: userRole,
          modifiedAt: new Date(),
          reason: comments || `Amount adjusted to ₹${newAmount.toLocaleString()} during ${currentApprover} approval`,
        });
      }

      // 3. Recalculate configurations if anything changed
      if (configChanged) {
        if (loan.requestType === 'loan') {
          if (!loan.loanConfig) loan.loanConfig = {};
          const currentAmount = loan.amount;
          const currentRate = loan.loanConfig.interestRate || 0;
          const duration = loan.duration;
          const emiResult = calculateEMI(currentAmount, currentRate, duration);
          applyCalculatedEmiToLoan(loan, emiResult);
        } else {
          // Salary advance - recalculate per cycle deduction
          loan.advanceConfig.deductionPerCycle = Math.round(loan.amount / loan.duration);
          loan.repayment.totalInstallments = loan.duration;
        }
      }
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

    // DYAMIC WORKFLOW ROUTING ENGINE
    const workflowSteps = settings?.workflow?.steps || [];
    const currentStepConfig = workflowSteps.find(s => s.approverRole === currentApprover && s.isActive);

    // Determine the next step in the chain
    let nextStepOrder = currentStepConfig ? currentStepConfig.nextStepOnApprove : null;
    let nextRole = null;
    let nextStepEnum = 'completed';
    let isFinalStep = false;

    // Special Logic: If current is the default HOD (not in dynamic steps), move to Step 1
    if (currentApprover === 'hod' && !currentStepConfig) {
      const firstStep = workflowSteps.find(s => s.stepOrder === 1 && s.isActive);
      if (firstStep) {
        nextRole = firstStep.approverRole;
        if (['hod', 'manager', 'hr'].includes(nextRole)) nextStepEnum = nextRole;
        else nextStepEnum = 'final';
      } else {
        // No dynamic steps - go to final authority
        const finalAuth = settings?.workflow?.finalAuthority;
        if (finalAuth && finalAuth.role) {
          nextRole = 'final_authority';
          nextStepEnum = 'final';
        } else {
          isFinalStep = true;
        }
      }
    } else if (nextStepOrder !== null) {
      const nextStep = workflowSteps.find(s => s.stepOrder === nextStepOrder && s.isActive);
      if (nextStep) {
        nextRole = nextStep.approverRole;
        // Map role to workflow enum
        if (['hod', 'manager', 'hr'].includes(nextRole)) nextStepEnum = nextRole;
        else nextStepEnum = 'final';
      }
    } else {
      // Check for final authority
      const finalAuth = settings?.workflow?.finalAuthority;
      if (finalAuth && finalAuth.role && currentApprover !== 'final_authority') {
        nextRole = 'final_authority';
        nextStepEnum = 'final';
      } else {
        isFinalStep = true;
      }
    }

    // AUTH CHECK FOR FOR FINAL AUTHORITY
    if (currentApprover === 'final_authority' || isFinalStep) {
      const finalAuth = settings?.workflow?.finalAuthority;
      let authorized = false;
      if (isSuperAdmin) authorized = true;
      else if (finalAuth) {
        if (finalAuth.role === 'hr' && userRole === 'hr') {
          if (finalAuth.anyHRCanApprove) authorized = true;
          else if (finalAuth.authorizedHRUsers?.some(id => id.toString() === req.user._id.toString())) authorized = true;
        } else if (finalAuth.role === 'specific_user') {
          if (finalAuth.userId?.toString() === req.user._id.toString()) authorized = true;
        }
      } else if (isHR) {
        authorized = true; // Fallback to HR if no final auth defined
      }

      if (!authorized) {
        return res.status(403).json({
          success: false,
          error: 'You are not authorized for final authority action.',
        });
      }
      isFinalStep = true; // Ensure terminal state
    }

    switch (action) {
      case 'approve':
        historyEntry.action = 'approved';

        // Apply dynamic status and routing
        if (!isFinalStep) {
          loan.status = currentStepConfig?.approvedStatus || `${currentApprover}_approved`;
          loan.workflow.currentStep = nextStepEnum;
          loan.workflow.nextApprover = nextRole;

          // Add special marker for higher authority action in history
          if (allowBypass && (isSuperAdmin || isHR)) {
            historyEntry.comments = `${comments || ''} (Action by Higher Authority: ${userRole})`;
          }

          // Legacy approval record
          if (currentApprover && loan.approvals[currentApprover]) {
            loan.approvals[currentApprover] = {
              status: 'approved',
              approvedBy: req.user._id,
              approvedAt: new Date(),
              comments,
            };
          }
        } else {
          // Final Approval — first deduction pay period required
          if (!firstDeductionPayrollMonth) {
            return res.status(400).json({
              success: false,
              error: 'First deduction pay period is required for final approval (YYYY-MM).',
            });
          }
          let lockedPayrollMonth;
          try {
            lockedPayrollMonth = await applyRepaymentScheduleFromPayrollMonth(loan, firstDeductionPayrollMonth);
          } catch (scheduleErr) {
            return res.status(400).json({
              success: false,
              error: scheduleErr.message || 'Invalid first deduction pay period',
            });
          }
          loan.status = 'approved';
          loan.workflow.currentStep = 'completed';
          loan.workflow.nextApprover = null;
          loan.approvals.final = {
            status: 'approved',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
            firstDeductionPayrollMonth: lockedPayrollMonth,
          };
        }
        break;

      case 'reject':
        historyEntry.action = 'rejected';

        // Add special marker for higher authority rejection
        if (allowBypass && (isSuperAdmin || isHR) && !isFinalStep) {
          historyEntry.comments = `${comments || ''} (Action by Higher Authority)`;
        }

        // Apply dynamic status and routing (moves to next step even on reject as per user request)
        if (!isFinalStep) {
          loan.status = currentStepConfig?.rejectedStatus || `${currentApprover}_rejected`;
          loan.workflow.currentStep = nextStepEnum;
          loan.workflow.nextApprover = nextRole;

          // Legacy approval record
          if (currentApprover && loan.approvals[currentApprover]) {
            loan.approvals[currentApprover] = {
              status: 'rejected',
              approvedBy: req.user._id,
              approvedAt: new Date(),
              comments,
            };
          }
        } else {
          // Final Rejection
          loan.status = 'rejected';
          loan.workflow.currentStep = 'completed';
          loan.workflow.nextApprover = null;
          loan.approvals.final = {
            status: 'rejected',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };
        }
        break;

      case 'forward':
        historyEntry.action = 'forwarded';
        if (currentApprover === 'hod') {
          loan.status = 'hod_approved';
          loan.approvals.hod = {
            status: 'forwarded',
            approvedBy: req.user._id,
            approvedAt: new Date(),
            comments,
          };

          // Logic for manual forward would go here
          loan.workflow.currentStep = 'hr';
          loan.workflow.nextApprover = 'hr';
        }
        break;

      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    syncChainAfterWorkflowAction(loan, {
      currentApprover,
      action: historyEntry.action,
      isFinalStep: action === 'approve' && loan.workflow.currentStep === 'completed',
      nextRole: loan.workflow.nextApprover,
    });
    ensureLoanApprovalChain(loan, settings);
    loan.workflow.nextApproverRole = loan.workflow.nextApprover;
    loan.workflow.isCompleted = loan.workflow.currentStep === 'completed';

    loan.workflow.history.push(historyEntry);
    loan.markModified('workflow');
    await loan.save();

    res.status(200).json({
      success: true,
      message: `Loan application ${action}d successfully`,
      data: loan,
    });

    notifyWorkflowEvent({
      module: loan.requestType === 'loan' ? 'loan' : 'salary_advance',
      eventType:
        action === 'approve'
          ? loan.requestType === 'loan'
            ? 'LOAN_APPROVED'
            : 'SALARY_ADVANCE_APPROVED'
          : action === 'reject'
            ? loan.requestType === 'loan'
              ? 'LOAN_REJECTED'
              : 'SALARY_ADVANCE_REJECTED'
            : 'LOAN_WORKFLOW_UPDATED',
      record: loan,
      actor: req.user,
      title: `${loan.requestType === 'loan' ? 'Loan' : 'Salary Advance'} ${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Updated'}`,
      message: `${loan.requestType === 'loan' ? 'Loan' : 'Salary advance'} request ${action}d by ${req.user.name}.`,
      nextApproverRole: loan?.workflow?.nextApprover || null,
      priority: action === 'reject' ? 'high' : 'medium',
    }).catch((err) => console.error('[Notification] LOAN_ACTION failed:', err.message));
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

    notifyWorkflowEvent({
      module: loan.requestType === 'loan' ? 'loan' : 'salary_advance',
      eventType: loan.requestType === 'loan' ? 'LOAN_CANCELLED' : 'SALARY_ADVANCE_CANCELLED',
      record: loan,
      actor: req.user,
      title: `${loan.requestType === 'loan' ? 'Loan' : 'Salary Advance'} Cancelled`,
      message: `${loan.requestType === 'loan' ? 'Loan' : 'Salary advance'} request cancelled.`,
      priority: 'high',
    }).catch((err) => console.error('[Notification] LOAN_CANCELLED failed:', err.message));
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
    const { disbursementMethod, transactionReference, remarks, firstDeductionPayrollMonth } = req.body;
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

    // Check if all guarantors have accepted
    const pendingGuarantors = loan.guarantors.filter((g) => g.status !== 'accepted');
    if (pendingGuarantors.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot disburse: ${pendingGuarantors.length} guarantor(s) have not yet accepted the request`,
        pendingGuarantors: pendingGuarantors.map((g) => g.name),
      });
    }

    // Only HR and Admin can disburse
    if (!['hr', 'sub_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to disburse loans',
      });
    }

    if (needsFirstDeductionPayPeriodSelection(loan)) {
      if (!firstDeductionPayrollMonth) {
        return res.status(400).json({
          success: false,
          error: 'First deduction pay period is required before disbursement (YYYY-MM).',
          requiresFirstDeductionPayrollMonth: true,
        });
      }
      let lockedPayrollMonth;
      try {
        lockedPayrollMonth = await applyRepaymentScheduleFromPayrollMonth(loan, firstDeductionPayrollMonth);
      } catch (scheduleErr) {
        return res.status(400).json({
          success: false,
          error: scheduleErr.message || 'Invalid first deduction pay period',
        });
      }
      if (!loan.approvals) loan.approvals = {};
      if (!loan.approvals.final) {
        loan.approvals.final = {
          status: 'approved',
          approvedAt: new Date(),
          comments: 'First deduction pay period set at disbursement (legacy record)',
        };
      }
      loan.approvals.final.firstDeductionPayrollMonth = lockedPayrollMonth;
      loan.markModified('approvals');
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
      amount: loan.amount,
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

    await syncLoanMoneyAndPayrollSchedule(loan, { fromDisburse: true });

    if (loan.requestType === 'salary_advance') {
      if (!loan.advanceConfig) loan.advanceConfig = {};
      if (!loan.advanceConfig.deductionStartCycle && !loan.approvals?.final?.firstDeductionPayrollMonth) {
        loan.advanceConfig.deductionStartCycle = await firstPayrollMonthKeyForRepaymentSchedule(loan);
      }
      await setNextPaymentDateFromInstallmentsPaid(loan);
      loan.markModified('advanceConfig');
      loan.markModified('repayment');
    }

    await loan.save();

    await loan.populate([
      { path: 'employeeId', select: 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id' },
      { path: 'disbursement.disbursedBy', select: 'name email' },
    ]);

    res.status(200).json({
      success: true,
      message: 'Loan disbursed successfully',
      data: loan,
    });

    notifyWorkflowEvent({
      module: loan.requestType === 'loan' ? 'loan' : 'salary_advance',
      eventType: loan.requestType === 'loan' ? 'LOAN_DISBURSED' : 'SALARY_ADVANCE_DISBURSED',
      record: loan,
      actor: req.user,
      title: `${loan.requestType === 'loan' ? 'Loan' : 'Salary Advance'} Disbursed`,
      message: `${loan.requestType === 'loan' ? 'Loan' : 'Salary advance'} was disbursed.`,
      priority: 'high',
    }).catch((err) => console.error('[Notification] LOAN_DISBURSED failed:', err.message));
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
    const { amount, paymentDate, remarks, payrollCycle, isEarlySettlement } = req.body;

    const loan = await Loan.findById(id).populate('employeeId', 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id');

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

    let paymentAmount = amount;
    let settlementDetails = null;

    // Handle early settlement
    if (isEarlySettlement) {
      const settlementDate = paymentDate ? new Date(paymentDate) : new Date();
      settlementDetails = calculateEarlySettlement(loan, settlementDate);

      if (!settlementDetails) {
        return res.status(400).json({
          success: false,
          error: 'Unable to calculate early settlement amount',
        });
      }

      paymentAmount = settlementDetails.settlementAmount;
    } else {
      // Regular EMI payment validation
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Payment amount is required and must be greater than 0',
        });
      }

      // Check if payment exceeds remaining balance
      const remainingBalance = loan.repayment.remainingBalance || loan.loanConfig.totalAmount || loan.amount;
      if (amount > remainingBalance) {
        return res.status(400).json({
          success: false,
          error: `Payment amount(₹${amount}) exceeds remaining balance(₹${remainingBalance})`,
        });
      }
    }

    // Record transaction
    const transaction = {
      transactionType: isEarlySettlement ? 'early_settlement' : 'emi_payment',
      amount: paymentAmount,
      transactionDate: paymentDate ? new Date(paymentDate) : new Date(),
      payrollCycle: payrollCycle || null,
      processedBy: req.user._id,
      remarks: remarks || (isEarlySettlement ? 'Early settlement payment' : 'EMI payment recorded'),
    };

    loan.transactions.push(transaction);

    // Update repayment totals
    loan.repayment.totalPaid = (loan.repayment.totalPaid || 0) + paymentAmount;

    if (isEarlySettlement) {
      // For early settlement, set remaining balance to 0
      loan.repayment.remainingBalance = 0;
      loan.repayment.installmentsPaid = loan.duration; // Mark all installments as paid
    } else {
      loan.repayment.remainingBalance = (loan.loanConfig.totalAmount || loan.amount) - loan.repayment.totalPaid;
      loan.repayment.installmentsPaid = (loan.repayment.installmentsPaid || 0) + 1;
    }

    loan.repayment.lastPaymentDate = transaction.transactionDate;

    if (loan.requestType === 'loan' && !isEarlySettlement) {
      await setNextPaymentDateFromInstallmentsPaid(loan);
    } else if (loan.repayment.remainingBalance <= 0 || isEarlySettlement) {
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
      { path: 'employeeId', select: 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id' },
      { path: 'transactions.processedBy', select: 'name email' },
    ]);

    res.status(200).json({
      success: true,
      message: isEarlySettlement ? 'Early settlement payment recorded successfully' : 'EMI payment recorded successfully',
      data: loan,
      settlementDetails: isEarlySettlement ? settlementDetails : null,
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

    const loan = await Loan.findById(id).populate('employeeId', 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id');

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
        error: `Payment amount(₹${amount}) exceeds remaining balance(₹${remainingBalance})`,
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
      loan.repayment.nextPaymentDate = null;
    } else if (loan.status === 'disbursed') {
      loan.status = 'active';
    }

    if (!loan.advanceConfig) loan.advanceConfig = {};
    const pc = payrollCycle != null ? String(payrollCycle).trim() : '';
    if (pc && /^\d{4}-\d{2}$/.test(pc) && !loan.advanceConfig.deductionStartCycle) {
      loan.advanceConfig.deductionStartCycle = pc;
    }
    if (loan.repayment.remainingBalance > 0) {
      await setNextPaymentDateFromInstallmentsPaid(loan);
    }

    loan.markModified('advanceConfig');
    loan.markModified('repayment');

    await loan.save();

    await loan.populate([
      { path: 'employeeId', select: 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id' },
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

// @desc    Get early settlement preview for a loan
// @route   GET /api/loans/:id/settlement-preview
// @access  Private
exports.getSettlementPreview = async (req, res) => {
  try {
    const { id } = req.params;
    const { settlementDate } = req.query; // Optional: settlement date (default: now)

    const loan = await Loan.findById(id)
      .populate('employeeId', 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id')
      .select('requestType amount duration loanConfig repayment disbursement appliedAt createdAt status');

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan/Advance not found',
      });
    }

    // Only loans have interest calculation
    if (loan.requestType !== 'loan') {
      return res.status(400).json({
        success: false,
        error: 'Early settlement calculation is only available for loans',
      });
    }

    // Check if loan is disbursed/active
    if (!['disbursed', 'active'].includes(loan.status)) {
      return res.status(400).json({
        success: false,
        error: 'Loan must be disbursed or active for settlement calculation',
      });
    }

    const settlementDateObj = settlementDate ? new Date(settlementDate) : new Date();
    const currentSettlement = calculateEarlySettlement(loan, settlementDateObj);

    // Calculate next month settlement
    const nextMonthDate = new Date(settlementDateObj);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const nextMonthSettlement = calculateEarlySettlement(loan, nextMonthDate);

    if (!currentSettlement) {
      return res.status(400).json({
        success: false,
        error: 'Unable to calculate settlement amount',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        current: currentSettlement,
        nextMonth: nextMonthSettlement,
        loanDetails: {
          principal: loan.amount,
          originalDuration: loan.duration,
          interestRate: loan.loanConfig?.interestRate || 0,
          originalTotalAmount: loan.loanConfig?.totalAmount || loan.amount,
        },
      },
    });
  } catch (error) {
    console.error('Error calculating settlement preview:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate settlement preview',
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
      .populate('employeeId', 'employee_name emp_no profilePhoto gross_salary department_id designation_id division_id')
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

// @desc    Get loan report summary (stats + grouped data)
// @route   GET /api/loans/reports/summary
// @access  Private
exports.getLoanReportSummary = async (req, res) => {
  try {
    const { divisionId, departmentId, employeeId, groupBy, requestType, status } = req.query;

    const query = { isActive: true, ...(req.scopeFilter || {}) };

    if (requestType) query.requestType = requestType;
    if (status) query.status = status;
    else query.status = { $in: ['disbursed', 'active', 'completed'] }; // Default to shown active/completed loans

    // Filter by Division/Department/Employee
    if (employeeId && employeeId !== 'all') {
      const empIds = String(employeeId).split(',').filter(id => id && id !== 'all');
      if (empIds.length > 0) {
        query.employeeId = { $in: empIds.map(toObjectId) };
      }
    } else if (departmentId && departmentId !== 'all') {
      const deptIds = String(departmentId).split(',').filter(id => id && id !== 'all');
      if (deptIds.length > 0) {
        query.department = { $in: deptIds.map(toObjectId) };
      }
    } else if (divisionId && divisionId !== 'all') {
      const divIds = String(divisionId).split(',').filter(id => id && id !== 'all');
      if (divIds.length > 0) {
        query.division_id = { $in: divIds.map(toObjectId) };
      }
    }

    // Calculate overall stats
    const statsData = await Loan.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalDistributed: { $sum: "$amount" },
          totalRecovered: { $sum: "$repayment.totalPaid" },
          totalOutstanding: { $sum: "$repayment.remainingBalance" },
          totalInterest: { $sum: "$loanConfig.totalInterest" }
        }
      }
    ]);

    const stats = statsData[0] || {
      totalDistributed: 0,
      totalRecovered: 0,
      totalOutstanding: 0,
      totalInterest: 0
    };

    // Grouped summaries — single aggregation instead of per-child queries
    let summaries = [];
    if (groupBy === 'division' || groupBy === 'department' || groupBy === 'employee') {
      const groupField =
        groupBy === 'division' ? '$division_id' : groupBy === 'department' ? '$department' : '$employeeId';

      const grouped = await Loan.aggregate([
        { $match: query },
        {
          $group: {
            _id: groupField,
            distributed: { $sum: '$amount' },
            recovered: { $sum: '$repayment.totalPaid' },
            outstanding: { $sum: '$repayment.remainingBalance' },
            interest: { $sum: '$loanConfig.totalInterest' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 0 }, _id: { $ne: null } } },
      ]);

      const groupIds = grouped.map((g) => g._id).filter(Boolean);
      let nameMap = new Map();

      if (groupBy === 'division' && groupIds.length > 0) {
        const docs = await Division.find({ _id: { $in: groupIds } }).select('name').lean();
        nameMap = new Map(docs.map((d) => [d._id.toString(), d.name]));
      } else if (groupBy === 'department' && groupIds.length > 0) {
        const docs = await Department.find({ _id: { $in: groupIds } }).select('name').lean();
        nameMap = new Map(docs.map((d) => [d._id.toString(), d.name]));
      } else if (groupBy === 'employee' && groupIds.length > 0) {
        const docs = await Employee.find({ _id: { $in: groupIds } })
          .select('employee_name emp_no')
          .lean();
        nameMap = new Map(
          docs.map((e) => [e._id.toString(), `${e.employee_name} (${e.emp_no})`])
        );
      }

      summaries = grouped.map((g) => ({
        id: g._id,
        name: nameMap.get(String(g._id)) || 'Unknown',
        distributed: g.distributed,
        recovered: g.recovered,
        outstanding: g.outstanding,
        interest: g.interest,
        count: g.count,
      }));
    }

    // Detailed records for current view (paginated)
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const [loans, total] = await Promise.all([
      Loan.find(query)
        .populate('employeeId', 'employee_name emp_no profilePhoto department_id designation_id division_id')
        .populate('department', 'name')
        .populate('division_id', 'name')
        .sort({ appliedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Loan.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      stats,
      summaries,
      data: loans,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error in getLoanReportSummary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Export loan report as XLSX
 * @route   GET /api/loans/reports/export
 * @access  Private
 */
exports.exportLoanReport = async (req, res) => {
  try {
    const { divisionId, departmentId, employeeId, requestType, status } = req.query;

    const query = { isActive: true, ...(req.scopeFilter || {}) };
    if (requestType) query.requestType = requestType;
    if (status) query.status = status;
    else query.status = { $in: ['disbursed', 'active', 'completed'] };

    if (employeeId && employeeId !== 'all') {
      const empIds = String(employeeId).split(',').filter(id => id && id !== 'all');
      query.employeeId = { $in: empIds.map(toObjectId) };
    } else if (departmentId && departmentId !== 'all') {
      const deptIds = String(departmentId).split(',').filter(id => id && id !== 'all');
      query.department = { $in: deptIds.map(toObjectId) };
    } else if (divisionId && divisionId !== 'all') {
      const divIds = String(divisionId).split(',').filter(id => id && id !== 'all');
      query.division_id = { $in: divIds.map(toObjectId) };
    }

    const loans = await Loan.find(query)
      .populate('employeeId', 'employee_name emp_no profilePhoto department_id designation_id division_id')
      .populate('department', 'name')
      .populate('division_id', 'name')
      .populate('designation', 'name')
      .sort({ appliedAt: -1 })
      .lean();

    const rows = loans.map((loan, index) => ({
      'S.No': index + 1,
      'Emp No': loan.employeeId?.emp_no || loan.emp_no,
      'Employee Name': loan.employeeId?.employee_name || 'N/A',
      'Division': loan.division_id?.name || 'N/A',
      'Department': loan.department?.name || 'N/A',
      'Designation': loan.designation?.name || 'N/A',
      'Type': loan.requestType === 'loan' ? 'Loan' : 'Salary Advance',
      'Amount': loan.amount,
      'Recovered': loan.repayment?.totalPaid || 0,
      'Outstanding': loan.repayment?.remainingBalance || 0,
      'Interest': loan.loanConfig?.totalInterest || 0,
      'Total Payable': (loan.amount || 0) + (loan.loanConfig?.totalInterest || 0),
      'Status': loan.status,
      'Applied Date': loan.appliedAt ? dayjs(loan.appliedAt).format('DD-MMM-YYYY') : 'N/A',
      'Disbursed Date': loan.disbursement?.disbursedAt ? dayjs(loan.disbursement.disbursedAt).format('DD-MMM-YYYY') : 'N/A'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Loans Report');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=loans_report_${dayjs().format('YYYYMMDD')}.xlsx`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error('Error in exportLoanReport:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Export loan report as PDF with premium styling
 * @route   GET /api/loans/reports/export-pdf
 * @access  Private
 */
exports.exportLoanReportPDF = async (req, res) => {
  try {
    const { divisionId, departmentId, employeeId, requestType, status } = req.query;

    const query = { isActive: true, ...(req.scopeFilter || {}) };
    if (requestType) query.requestType = requestType;
    if (status) query.status = status;
    else query.status = { $in: ['disbursed', 'active', 'completed'] };

    if (employeeId && employeeId !== 'all') {
      const empIds = String(employeeId).split(',').filter(id => id && id !== 'all');
      query.employeeId = { $in: empIds.map(toObjectId) };
    } else if (departmentId && departmentId !== 'all') {
      const deptIds = String(departmentId).split(',').filter(id => id && id !== 'all');
      query.department = { $in: deptIds.map(toObjectId) };
    } else if (divisionId && divisionId !== 'all') {
      const divIds = String(divisionId).split(',').filter(id => id && id !== 'all');
      query.division_id = { $in: divIds.map(toObjectId) };
    }

    const loans = await Loan.find(query)
      .populate('employeeId', 'employee_name emp_no profilePhoto department_id designation_id division_id')
      .populate('department', 'name')
      .populate('division_id', 'name')
      .sort({ appliedAt: -1 })
      .lean();

    const doc = new PDFDocument({ 
      margin: { top: 30, bottom: 0, left: 30, right: 30 }, 
      size: 'A4', 
      layout: 'landscape',
      bufferPages: true
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=loans_report_${dayjs().format('YYYYMMDD')}.pdf`);
    doc.pipe(res);

    const MARGIN = 30;
    const innerW = doc.page.width - MARGIN * 2;
    const formatINR = (val) => Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    const drawCard = (x, y, w, h, title, value, color) => {
      doc.save();
      doc.roundedRect(x, y, w, h, 8).fill(`${color}10`); // Light fill
      doc.roundedRect(x, y, w, h, 8).lineWidth(0.5).strokeColor(color).stroke();

      doc.fontSize(8).font('Helvetica-Bold').fillColor(color).text(title.toUpperCase(), x + 10, y + 10);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e293b').text(`₹${formatINR(value)}`, x + 10, y + 22);
      doc.restore();
    };

    // Header
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1e1b4b').text('Loans & Salary Advances Report', MARGIN, MARGIN);
    doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(`Generated on: ${dayjs().format('DD MMM YYYY, HH:mm')}`, MARGIN, MARGIN + 22);

    // Summary Cards
    const stats = {
      distributed: loans.reduce((sum, l) => sum + (l.amount || 0), 0),
      recovered: loans.reduce((sum, l) => sum + (l.repayment?.totalPaid || 0), 0),
      outstanding: loans.reduce((sum, l) => sum + (l.repayment?.remainingBalance || 0), 0),
      interest: loans.reduce((sum, l) => sum + (l.loanConfig?.totalInterest || 0), 0)
    };

    const cardW = (innerW - 40) / 4;
    let cardX = MARGIN;
    let cardY = MARGIN + 45;

    drawCard(cardX, cardY, cardW, 50, 'Total Distributed', stats.distributed, '#4f46e5');
    cardX += cardW + 13.3;
    drawCard(cardX, cardY, cardW, 50, 'Total Recovered', stats.recovered, '#059669');
    cardX += cardW + 13.3;
    drawCard(cardX, cardY, cardW, 50, 'Total Outstanding', stats.outstanding, '#e11d48');
    cardX += cardW + 13.3;
    drawCard(cardX, cardY, cardW, 50, 'Total Interest', stats.interest, '#0284c7');

    // Table
    const tableTop = cardY + 70;
    const colWidths = [25, 50, 140, 100, 70, 70, 70, 70, 90, 70];
    const columns = ['#', 'Emp No', 'Employee Name', 'Department', 'Principal', 'Interest', 'Total', 'Paid', 'Balance', 'Status'];
    const colAligns = ['center', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'center'];

    let currentY = tableTop;

    // Header Row
    doc.save();
    doc.roundedRect(MARGIN, currentY, innerW, 20, 4).fill('#4f46e5');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');

    let currentX = MARGIN + 5;
    columns.forEach((col, i) => {
      doc.text(col, currentX, currentY + 6, { width: colWidths[i] - 10, align: colAligns[i] });
      currentX += colWidths[i];
    });
    doc.restore();

    currentY += 20;
    doc.font('Helvetica').fontSize(8).fillColor('#334155');

    loans.forEach((loan, index) => {
      if (currentY > 530) {
        doc.addPage({ 
          layout: 'landscape', 
          margin: { top: 30, bottom: 0, left: 30, right: 30 } 
        });
        currentY = 40;

        // Redraw Header on new page
        doc.save();
        doc.roundedRect(MARGIN, currentY, innerW, 20, 4).fill('#4f46e5');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
        let hX = MARGIN + 5;
        columns.forEach((col, i) => {
          doc.text(col, hX, currentY + 6, { width: colWidths[i] - 10, align: colAligns[i] });
          hX += colWidths[i];
        });
        doc.restore();
        currentY += 20;
        doc.font('Helvetica').fontSize(7.5).fillColor('#334155');
      }

      // Zebra striping
      if (index % 2 === 1) {
        doc.save().fillColor('#f8fafc').rect(MARGIN, currentY, innerW, 18).fill().restore();
      }

      currentX = MARGIN + 5;
      doc.text(index + 1, currentX, currentY + 5, { width: colWidths[0] - 10, align: colAligns[0] });
      currentX += colWidths[0];
      doc.text(loan.employeeId?.emp_no || loan.emp_no, currentX, currentY + 5, { width: colWidths[1] - 10, align: colAligns[1] });
      currentX += colWidths[1];
      doc.text(loan.employeeId?.employee_name || 'N/A', currentX, currentY + 5, { width: colWidths[2] - 10, align: colAligns[2], ellipsis: true });
      currentX += colWidths[2];
      doc.text(loan.department?.name || 'N/A', currentX, currentY + 5, { width: colWidths[3] - 10, align: colAligns[3], ellipsis: true });
      currentX += colWidths[3];
      doc.text(formatINR(loan.amount), currentX, currentY + 5, { width: colWidths[4] - 10, align: colAligns[4] });
      currentX += colWidths[4];
      doc.text(formatINR(loan.loanConfig?.totalInterest || 0), currentX, currentY + 5, { width: colWidths[5] - 10, align: colAligns[5] });
      currentX += colWidths[5];
      doc.text(formatINR((loan.amount || 0) + (loan.loanConfig?.totalInterest || 0)), currentX, currentY + 5, { width: colWidths[6] - 10, align: colAligns[6] });
      currentX += colWidths[6];
      doc.text(formatINR(loan.repayment?.totalPaid || 0), currentX, currentY + 5, { width: colWidths[7] - 10, align: colAligns[7] });
      currentX += colWidths[7];
      doc.text(formatINR(loan.repayment?.remainingBalance || 0), currentX, currentY + 5, { width: colWidths[8] - 10, align: colAligns[8] });
      currentX += colWidths[8];

      // Status Badge in PDF
      const s = loan.status;
      const sColor = s === 'completed' ? '#059669' : (s === 'active' || s === 'disbursed' ? '#2563eb' : '#64748b');
      doc.save().font('Helvetica-Bold').fillColor(sColor).text(s.toUpperCase(), currentX, currentY + 5, { width: colWidths[9] - 10, align: colAligns[9] }).restore();

      currentY += 18;
    });

    // Footer
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor('#94a3b8').text(
        `Page ${i + 1} of ${pages.count}  |  Generated by HRMS System`,
        MARGIN,
        doc.page.height - 20,
        { align: 'center', width: innerW }
      );
    }

    doc.end();
  } catch (error) {
    console.error('Error in exportLoanReportPDF:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

