const PayrollRecord = require('../model/PayrollRecord');
const PayrollTransaction = require('../model/PayrollTransaction');
const Employee = require('../../employees/model/Employee');
const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const MonthlyAttendanceSummary = require('../../attendance/model/MonthlyAttendanceSummary');
const Loan = require('../../loans/model/Loan');
const payrollCalculationService = require('../services/payrollCalculationService');
const XLSX = require('xlsx');

/**
 * Payroll Controller
 * Handles payroll calculation, retrieval, and processing
 */

/**
 * @desc    Calculate payroll for an employee
 * @route   POST /api/payroll/calculate
 * @access  Private (Super Admin, Sub Admin, HR)
 */
// Shared payslip assembler (used by calculate & getPayslip)
async function buildPayslipData(employeeId, month) {
  const payrollRecord = await PayrollRecord.findOne({
    employeeId,
    month,
  }).populate({
    path: 'employeeId',
    select:
      'employee_name emp_no department_id designation_id gross_salary location bank_account_no pf_number esi_number',
    populate: [
      { path: 'department_id', select: 'name' },
      { path: 'designation_id', select: 'name' },
    ],
  });

  if (!payrollRecord) {
    throw new Error('Payslip not found. Please calculate payroll first.');
  }

  // Try pay register summary for rich totals; fallback to attendance summary
  const payRegisterSummary = await PayRegisterSummary.findOne({ employeeId, month });
  const attendanceSummary = await MonthlyAttendanceSummary.findOne({ employeeId, month });

  // Extract employee data with properly populated references
  const employee = payrollRecord.employeeId;

  // Department name
  let departmentName = 'N/A';
  if (employee?.department_id) {
    if (typeof employee.department_id === 'object' && employee.department_id.name) {
      departmentName = employee.department_id.name;
    } else if (employee.department_id.toString) {
      const Department = require('../../departments/model/Department');
      const dept = await Department.findById(employee.department_id).select('name');
      if (dept) departmentName = dept.name;
    }
  }

  // Designation name
  let designationName = 'N/A';
  if (employee?.designation_id) {
    if (typeof employee.designation_id === 'object' && employee.designation_id.name) {
      designationName = employee.designation_id.name;
    } else if (employee.designation_id.toString) {
      const Designation = require('../../departments/model/Designation');
      const desig = await Designation.findById(employee.designation_id).select('name');
      if (desig) designationName = desig.name;
    }
  }

  const perDay = payrollRecord.earnings.perDayBasicPay || 0;
  const payableShifts = payrollRecord.totalPayableShifts || 0;
  const presentDays =
    payRegisterSummary?.totals?.totalPresentDays ?? attendanceSummary?.totalPresentDays ?? null;
  const paidLeaveDays =
    payRegisterSummary?.totals?.totalPaidLeaveDays ??
    attendanceSummary?.paidLeaves ??
    attendanceSummary?.totalPaidLeaveDays ??
    null;
  const odDays =
    payRegisterSummary?.totals?.totalODDays ?? attendanceSummary?.totalODs ?? null;
  const otHours =
    payRegisterSummary?.totals?.totalOTHours ??
    attendanceSummary?.totalOTHours ??
    payrollRecord.earnings.otHours ??
    0;
  const monthDays = payrollRecord.totalDaysInMonth;
  const incentiveDays =
    presentDays !== null && paidLeaveDays !== null
      ? Math.max(0, payableShifts - presentDays - paidLeaveDays - (odDays || 0))
      : null;

  const earnedSalary =
    presentDays !== null ? perDay * presentDays : payrollRecord.earnings.payableAmount;
  const paidLeaveSalary = paidLeaveDays !== null ? perDay * paidLeaveDays : 0;
  const odSalary = odDays !== null ? perDay * odDays : 0;
  const incentive = incentiveDays !== null ? perDay * incentiveDays : payrollRecord.earnings.incentive;

  const totalAllowances = payrollRecord.earnings.totalAllowances || 0;
  const otPay = payrollRecord.earnings.otPay || 0;
  const grossSalary = earnedSalary + paidLeaveSalary + odSalary + incentive + otPay + totalAllowances;

  const payslip = {
    month: payrollRecord.monthName,
    monthNumber: payrollRecord.monthNumber,
    year: payrollRecord.year,
    employee: {
      emp_no: payrollRecord.emp_no,
      name: employee?.employee_name || 'N/A',
      department: departmentName,
      designation: designationName,
      location: employee?.location || '',
      bank_account_no: employee?.bank_account_no || '',
      pf_number: employee?.pf_number || '',
      esi_number: employee?.esi_number || '',
    },
    attendance: {
      monthDays,
      workingDays: null, // not stored; can be derived if holidays/weekoffs available
      presentDays,
      paidLeaveDays,
      odDays,
      incentiveDays,
      payableShifts,
      otHours,
    },
    earnings: {
      basicPay: payrollRecord.earnings.basicPay,
      perDay,
      earnedSalary,
      paidLeaveSalary,
      odSalary,
      incentive,
      otPay,
      allowances: payrollRecord.earnings.allowances,
      totalAllowances,
      grossSalary,
    },
    deductions: {
      attendanceDeduction: payrollRecord.deductions.attendanceDeduction,
      permissionDeduction: payrollRecord.deductions.permissionDeduction,
      leaveDeduction: payrollRecord.deductions.leaveDeduction,
      otherDeductions: payrollRecord.deductions.otherDeductions,
      totalOtherDeductions: payrollRecord.deductions.totalOtherDeductions,
      totalDeductions: payrollRecord.deductions.totalDeductions,
    },
    loanAdvance: {
      totalEMI: payrollRecord.loanAdvance.totalEMI,
      advanceDeduction: payrollRecord.loanAdvance.advanceDeduction,
    },
    arrears: {
      arrearsAmount: payrollRecord.arrearsAmount || 0,
      arrearsSettlements: payrollRecord.arrearsSettlements || [],
    },
    netSalary: payrollRecord.netSalary,
    totalPayableShifts: payrollRecord.totalPayableShifts,
    paidDays: payrollRecord.totalPayableShifts,
    status: payrollRecord.status,
  };

  return { payrollRecord, payslip };
}

function buildPayslipExcelRows(payslip) {
  return [
    {
      Month: payslip.month,
      Employee: payslip.employee.name,
      EmpNo: payslip.employee.emp_no,
      Department: payslip.employee.department,
      Designation: payslip.employee.designation,
      MonthDays: payslip.attendance.monthDays,
      PresentDays: payslip.attendance.presentDays,
      PaidLeaveDays: payslip.attendance.paidLeaveDays,
      ODDays: payslip.attendance.odDays,
      IncentiveDays: payslip.attendance.incentiveDays,
      PayableShifts: payslip.attendance.payableShifts,
      OTHours: payslip.attendance.otHours,
      BasicPay: payslip.earnings.basicPay,
      PerDay: payslip.earnings.perDay,
      EarnedSalary: payslip.earnings.earnedSalary,
      PaidLeaveSalary: payslip.earnings.paidLeaveSalary,
      ODSalary: payslip.earnings.odSalary,
      Incentive: payslip.earnings.incentive,
      OTPay: payslip.earnings.otPay,
      TotalAllowances: payslip.earnings.totalAllowances,
      Arrears: payslip.arrears?.arrearsAmount || 0, // Add arrears column before gross salary
      GrossSalary: payslip.earnings.grossSalary,
      AttendanceDeduction: payslip.deductions.attendanceDeduction,
      PermissionDeduction: payslip.deductions.permissionDeduction,
      LeaveDeduction: payslip.deductions.leaveDeduction,
      OtherDeductions: payslip.deductions.totalOtherDeductions,
      TotalDeductions: payslip.deductions.totalDeductions,
      EMI: payslip.loanAdvance.totalEMI,
      AdvanceDeduction: payslip.loanAdvance.advanceDeduction,
      NetSalary: payslip.netSalary,
      Status: payslip.status,
      AllowancesBreakdown: Array.isArray(payslip.earnings.allowances)
        ? JSON.stringify(payslip.earnings.allowances)
        : '',
      OtherDeductionsBreakdown: Array.isArray(payslip.deductions.otherDeductions)
        ? JSON.stringify(payslip.deductions.otherDeductions)
        : '',
    },
  ];
}

exports.calculatePayroll = async (req, res) => {
  try {
    const { employeeId, month } = req.body;

    if (!employeeId || !month) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and month are required',
      });
    }

    // Validate month format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month must be in YYYY-MM format',
      });
    }

    // Strategy: default = new engine. legacy = new engine but using all related data (attendance summary cross-check).
    const useLegacy = req.query.strategy === 'legacy';
    const calcFn = payrollCalculationService.calculatePayrollNew;

    // Extract arrears from request body (if provided)
    const arrears = req.body.arrears || [];

    const result = await calcFn(employeeId, month, req.user._id, {
      source: useLegacy ? 'all' : 'payregister',
      arrearsSettlements: arrears, // Pass arrears to calculation service
    });

    // If export is requested, return Excel immediately
    if (req.query.export === 'excel') {
      const { payslip } = await buildPayslipData(employeeId, month);
      const rows = buildPayslipExcelRows(payslip);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Payslip');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const filename = `payslip_${payslip.employee.emp_no || employeeId}_${month}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buf);
    }

    // Convert mongoose ref to object if needed to merge properties
    const responseData = result.payrollRecord.toObject ? result.payrollRecord.toObject() : result.payrollRecord;

    if (result.batchId) {
      responseData.batchId = result.batchId;
      responseData.payrollBatchId = result.batchId; // Also set standard field
    }

    res.status(200).json({
      success: true,
      message: 'Payroll calculated successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error calculating payroll:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error calculating payroll',
      error: error.message,
      code: error.code,
      batchId: error.batchId
    });
  }
};

/**
 * @desc    Export payroll payslips to Excel for the selected employees/month
 * @route   GET /api/payroll/export
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.exportPayrollExcel = async (req, res) => {
  try {
    const { month, departmentId, employeeIds } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month (YYYY-MM) is required',
      });
    }

    let targetEmployeeIds = [];
    if (employeeIds) {
      targetEmployeeIds = String(employeeIds)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    } else if (departmentId) {
      const emps = await Employee.find({ department_id: departmentId }).select('_id');
      targetEmployeeIds = emps.map((e) => e._id.toString());
    }

    const query = { month };
    if (targetEmployeeIds.length > 0) {
      query.employeeId = { $in: targetEmployeeIds };
    }

    const payrollRecords = await PayrollRecord.find(query).select('employeeId month');
    if (!payrollRecords || payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found for export. Please calculate payroll first.',
      });
    }

    const rows = [];
    for (const pr of payrollRecords) {
      try {
        const { payslip } = await buildPayslipData(pr.employeeId, pr.month);
        rows.push(...buildPayslipExcelRows(payslip));
      } catch (err) {
        console.error('Error building payslip for export:', err);
      }
    }

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payslip data available to export.',
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Payslips');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `payslips_${month}${departmentId ? `_dept_${departmentId}` : ''}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
  } catch (error) {
    console.error('Error exporting payroll:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error exporting payroll',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payroll record for an employee
 * @route   GET /api/payroll/:employeeId/:month
 * @access  Private
 */
exports.getPayrollRecord = async (req, res) => {
  try {
    const { employeeId, month } = req.params;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month must be in YYYY-MM format',
      });
    }

    const payrollRecord = await PayrollRecord.findOne({
      employeeId,
      month,
    })
      .populate('employeeId', 'employee_name emp_no department_id designation_id')
      .populate('attendanceSummaryId')
      .populate('calculatedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('processedBy', 'name email');

    if (!payrollRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    res.status(200).json({
      success: true,
      data: payrollRecord,
    });
  } catch (error) {
    console.error('Error fetching payroll record:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll record',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payroll records for multiple employees
 * @route   GET /api/payroll
 * @access  Private
 */
exports.getPayrollRecords = async (req, res) => {
  try {
    const { month, employeeId, departmentId, status } = req.query;

    const query = {};

    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({
          success: false,
          message: 'Month must be in YYYY-MM format',
        });
      }
      query.month = month;
    }

    if (employeeId) {
      query.employeeId = employeeId;
    }

    if (status) {
      query.status = status;
    }

    // If departmentId is provided, filter by employees in that department
    let employeeIds = null;
    if (departmentId) {
      const employees = await Employee.find({ department_id: departmentId }).select('_id');
      employeeIds = employees.map((emp) => emp._id);
      if (employeeIds.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
        });
      }
      query.employeeId = { $in: employeeIds };
    }

    const payrollRecords = await PayrollRecord.find(query)
      .populate('employeeId', 'employee_name emp_no department_id designation_id')
      .sort({ month: -1, emp_no: 1 })
      .limit(1000); // Limit to prevent large queries

    res.status(200).json({
      success: true,
      count: payrollRecords.length,
      data: payrollRecords,
    });
  } catch (error) {
    console.error('Error fetching payroll records:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll records',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payroll transactions for a payroll record
 * @route   GET /api/payroll/:payrollRecordId/transactions
 * @access  Private
 */
exports.getPayrollTransactions = async (req, res) => {
  try {
    const { payrollRecordId } = req.params;

    const transactions = await PayrollTransaction.find({
      payrollRecordId,
    }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    console.error('Error fetching payroll transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll transactions',
      error: error.message,
    });
  }
};

/**
 * @desc    Approve payroll record
 * @route   PUT /api/payroll/:payrollRecordId/approve
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.approvePayroll = async (req, res) => {
  try {
    const { payrollRecordId } = req.params;
    const { comments } = req.body;

    const payrollRecord = await PayrollRecord.findById(payrollRecordId);

    if (!payrollRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found',
      });
    }

    if (payrollRecord.status === 'processed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve already processed payroll',
      });
    }

    payrollRecord.status = 'approved';
    payrollRecord.approvedBy = req.user._id;
    payrollRecord.approvedAt = new Date();
    payrollRecord.approvedComments = comments || null;

    await payrollRecord.save();

    res.status(200).json({
      success: true,
      message: 'Payroll approved successfully',
      data: payrollRecord,
    });
  } catch (error) {
    console.error('Error approving payroll:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving payroll',
      error: error.message,
    });
  }
};

/**
 * @desc    Process payroll (update loan/advance records)
 * @route   PUT /api/payroll/:payrollRecordId/process
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.processPayroll = async (req, res) => {
  try {
    const { payrollRecordId } = req.params;

    const result = await payrollCalculationService.processPayroll(
      payrollRecordId,
      req.user._id
    );

    res.status(200).json({
      success: true,
      message: 'Payroll processed successfully',
      data: result.payrollRecord,
    });
  } catch (error) {
    console.error('Error processing payroll:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing payroll',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payslip for an employee
 * @route   GET /api/payroll/payslip/:employeeId/:month
 * @access  Private
 */
exports.getPayslip = async (req, res) => {
  try {
    const { employeeId, month } = req.params;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month must be in YYYY-MM format',
      });
    }

    const { payslip } = await buildPayslipData(employeeId, month);

    res.status(200).json({
      success: true,
      data: payslip,
    });
  } catch (error) {
    console.error('Error fetching payslip:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payslip',
      error: error.message,
    });
  }
};

/**
 * @desc    Recalculate payroll for an employee
 * @route   POST /api/payroll/recalculate
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.recalculatePayroll = async (req, res) => {
  try {
    const { employeeId, month } = req.body;

    if (!employeeId || !month) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and month are required',
      });
    }

    // Check if payroll record exists
    const existingRecord = await PayrollRecord.findOne({ employeeId, month });

    if (existingRecord && existingRecord.status === 'processed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot recalculate processed payroll',
      });
    }

    // Calculate payroll
    const result = await payrollCalculationService.calculatePayroll(
      employeeId,
      month,
      req.user._id
    );

    res.status(200).json({
      success: true,
      message: 'Payroll recalculated successfully',
      data: result.payrollRecord,
    });
  } catch (error) {
    console.error('Error recalculating payroll:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error recalculating payroll',
      error: error.message,
    });
  }
};

/**
 * @desc    Get payroll transactions with analytics for a month
 * @route   GET /api/payroll/transactions/analytics
 * @access  Private
 */
exports.getPayrollTransactionsWithAnalytics = async (req, res) => {
  try {
    const { month, employeeId, departmentId } = req.query;

    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'Month is required (YYYY-MM format)',
      });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month must be in YYYY-MM format',
      });
    }

    // Build query for payroll records
    const payrollQuery = { month };
    if (employeeId) {
      payrollQuery.employeeId = employeeId;
    }
    if (departmentId) {
      const employees = await Employee.find({ department_id: departmentId }).select('_id');
      const employeeIds = employees.map((emp) => emp._id);
      if (employeeIds.length === 0) {
        return res.status(200).json({
          success: true,
          transactions: [],
          analytics: {
            totalEarnings: 0,
            totalDeductions: 0,
            totalNetSalary: 0,
            salaryAdvanceRecovered: 0,
            loanRecovered: 0,
            totalRemainingLoans: 0,
            totalRemainingSalaryAdvances: 0,
          },
        });
      }
      payrollQuery.employeeId = { $in: employeeIds };
    }

    // Get all payroll records for the month
    const payrollRecords = await PayrollRecord.find(payrollQuery)
      .populate('employeeId', 'employee_name emp_no department_id designation_id')
      .select('_id employeeId emp_no month');

    const payrollRecordIds = payrollRecords.map((record) => record._id);

    // Get all transactions for these payroll records
    const transactions = await PayrollTransaction.find({
      payrollRecordId: { $in: payrollRecordIds },
    })
      .populate('employeeId', 'employee_name emp_no')
      .populate('payrollRecordId', 'month')
      .sort({ createdAt: 1 });

    // Calculate analytics
    let totalEarnings = 0;
    let totalDeductions = 0;
    let totalNetSalary = 0;
    let salaryAdvanceRecovered = 0;
    let loanRecovered = 0;

    // Process transactions
    transactions.forEach((transaction) => {
      if (transaction.category === 'earning') {
        totalEarnings += Math.abs(transaction.amount);
      } else if (transaction.category === 'deduction') {
        totalDeductions += Math.abs(transaction.amount);
      }

      if (transaction.transactionType === 'salary_advance') {
        salaryAdvanceRecovered += Math.abs(transaction.amount);
      } else if (transaction.transactionType === 'loan_emi') {
        loanRecovered += Math.abs(transaction.amount);
      } else if (transaction.transactionType === 'net_salary') {
        totalNetSalary += Math.abs(transaction.amount);
      }
    });

    // Calculate total remaining loans and salary advances
    // Get all active loans and salary advances
    const activeLoans = await Loan.find({
      requestType: 'loan',
      status: { $in: ['active', 'disbursed'] },
      isActive: true,
    }).select('repayment.remainingBalance amount');

    const activeSalaryAdvances = await Loan.find({
      requestType: 'salary_advance',
      status: { $in: ['active', 'disbursed'] },
      isActive: true,
    }).select('repayment.remainingBalance amount');

    const totalRemainingLoans = activeLoans.reduce(
      (sum, loan) => sum + (loan.repayment?.remainingBalance || loan.amount || 0),
      0
    );

    const totalRemainingSalaryAdvances = activeSalaryAdvances.reduce(
      (sum, advance) => sum + (advance.repayment?.remainingBalance || advance.amount || 0),
      0
    );

    // Format transactions for response
    const formattedTransactions = transactions.map((transaction) => ({
      _id: transaction._id,
      employeeName: transaction.employeeId?.employee_name || 'N/A',
      emp_no: transaction.emp_no,
      transactionType: transaction.transactionType,
      category: transaction.category,
      description: transaction.description,
      amount: transaction.amount,
      month: transaction.month,
      createdAt: transaction.createdAt,
      details: transaction.details,
    }));

    res.status(200).json({
      success: true,
      month,
      transactions: formattedTransactions,
      analytics: {
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        totalNetSalary: Math.round(totalNetSalary * 100) / 100,
        salaryAdvanceRecovered: Math.round(salaryAdvanceRecovered * 100) / 100,
        loanRecovered: Math.round(loanRecovered * 100) / 100,
        totalRemainingLoans: Math.round(totalRemainingLoans * 100) / 100,
        totalRemainingSalaryAdvances: Math.round(totalRemainingSalaryAdvances * 100) / 100,
        totalRecords: payrollRecords.length,
        totalTransactions: transactions.length,
      },
    });
  } catch (error) {
    console.error('Error fetching payroll transactions with analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payroll transactions with analytics',
      error: error.message,
    });
  }
};

