const PayrollRecord = require('../model/PayrollRecord');
const PayrollTransaction = require('../model/PayrollTransaction');
const Employee = require('../../employees/model/Employee');
const User = require('../../users/model/User');
const Settings = require('../../settings/model/Settings');
const Loan = require('../../loans/model/Loan');
const payrollCalculationService = require('../services/payrollCalculationService');
const XLSX = require('xlsx');
const PayRegisterSummary = require('../../pay-register/model/PayRegisterSummary');
const MonthlyAttendanceSummary = require('../../attendance/model/MonthlyAttendanceSummary');
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
      'employee_name emp_no department_id division_id designation_id gross_salary location bank_account_no bank_name salary_mode doj pf_number esi_number dynamicFields',
    populate: [
      { path: 'department_id', select: 'name' },
      { path: 'division_id', select: 'name' },
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

  // Division name
  let divisionName = 'N/A';
  if (employee?.division_id) {
    if (typeof employee.division_id === 'object' && employee.division_id.name) {
      divisionName = employee.division_id.name;
    } else if (employee.division_id.toString) {
      const Division = require('../../departments/model/Division');
      const div = await Division.findById(employee.division_id).select('name');
      if (div) divisionName = div.name;
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
    presentDays !== null
      ? (payableShifts - presentDays)
      : (payrollRecord.attendance?.extraDays || 0);

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
      division: divisionName,
      designation: designationName,
      location: employee?.location || '',
      bank_account_no: employee?.bank_account_no || '',
      bank_name: employee?.bank_name || '',
      payment_mode: employee?.salary_mode || employee?.dynamicFields?.salary_mode || employee?.dynamicFields?.payment_mode || 'Bank Transfer',
      date_of_joining: employee?.doj || '',
      pf_number: employee?.pf_number || '',
      esi_number: employee?.esi_number || '',
    },
    attendance: {
      // Use new attendance breakdown if available, fallback to old fields
      totalDaysInMonth: payrollRecord.attendance?.totalDaysInMonth || monthDays,
      monthDays: payrollRecord.attendance?.totalDaysInMonth || monthDays,
      presentDays: payrollRecord.attendance?.presentDays || presentDays,
      paidLeaveDays: payrollRecord.attendance?.paidLeaveDays || paidLeaveDays,
      odDays: payrollRecord.attendance?.odDays || odDays,
      weeklyOffs: payrollRecord.attendance?.weeklyOffs || 0,
      holidays: payrollRecord.attendance?.holidays || 0,
      absentDays: payrollRecord.attendance?.absentDays || 0,
      payableShifts: payrollRecord.attendance?.payableShifts || payableShifts,
      extraDays: payrollRecord.attendance?.extraDays || 0,
      totalPaidDays: payrollRecord.attendance?.totalPaidDays || 0,
      otHours: payrollRecord.attendance?.otHours || otHours,
      otDays: payrollRecord.attendance?.otDays || 0,
      earnedSalary: payrollRecord.attendance?.earnedSalary || earnedSalary,
      lopDays: payRegisterSummary?.totals?.totalLopDays || 0,
      incentiveDays: incentiveDays, // Keep for backward compatibility
      workingDays: null, // Can be derived if needed
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
    paidDays: payrollRecord.attendance?.paidDays || (presentDays + (payRegisterSummary?.totals?.totalWeeklyOffs || 0) + (payRegisterSummary?.totals?.totalHolidays || 0) + (odDays || 0) + (paidLeaveDays || 0)),
    roundOff: payrollRecord.roundOff || 0,
    status: payrollRecord.status,
  };

  return { payrollRecord, payslip };
}

/**
 * Build Excel row with normalized columns (all employees have same columns)
 * @param {Object} payslip - Payslip data
 * @param {Set} allAllowanceNames - All unique allowance names across all employees
 * @param {Set} allDeductionNames - All unique deduction names across all employees
 * @param {Number} serialNo - Serial number for S.No column
 */
function buildPayslipExcelRowsNormalized(payslip, allAllowanceNames, allDeductionNames, serialNo) {
  const row = {
    'S.No': serialNo,
    'Employee Code': payslip.employee.emp_no || '',
    'Name': payslip.employee.name || '',
    'Designation': payslip.employee.designation || '',
    'Department': payslip.employee.department || '',
    'Division': payslip.employee.division || '',
    'Date of Joining': payslip.employee.date_of_joining ? new Date(payslip.employee.date_of_joining).toLocaleDateString() : '',
    'Payment Mode': payslip.employee.payment_mode || '',
    'Bank Name': payslip.employee.bank_name || '',
    'Bank Account No': payslip.employee.bank_account_no || '',
    'BASIC': payslip.earnings.basicPay || 0,
  };

  // Create a map of employee's allowances for quick lookup
  const employeeAllowances = {};
  if (Array.isArray(payslip.earnings.allowances)) {
    payslip.earnings.allowances.forEach(allowance => {
      employeeAllowances[allowance.name] = allowance.amount || 0;
    });
  }

  // Add ALL allowance columns (with 0 if employee doesn't have it)
  allAllowanceNames.forEach(allowanceName => {
    row[allowanceName] = employeeAllowances[allowanceName] || 0;
  });

  row['TOTAL GROSS SALARY'] = payslip.earnings.grossSalary || 0;

  // Attendance
  row['Month Days'] = payslip.attendance?.monthDays || payslip.attendance?.totalDaysInMonth || 0;
  row['Present Days'] = payslip.attendance?.presentDays || 0;
  row['Week Offs'] = payslip.attendance?.weeklyOffs || 0;
  row['Paid Leaves'] = payslip.attendance?.paidLeaveDays || 0;
  row['OD Days'] = payslip.attendance?.odDays || 0;
  row['Absents'] = payslip.attendance?.absentDays || 0;
  row['LOP\'s'] = payslip.attendance?.lopDays || 0;
  row['Payable Shifts'] = payslip.attendance?.payableShifts || 0;
  row['Extra Days'] = payslip.attendance?.extraDays || 0;
  row['Total Paid Days'] = payslip.paidDays || 0;

  // Net earnings
  row['Net Basic'] = payslip.attendance?.earnedSalary || payslip.earnings.earnedSalary || 0;

  // Add ALL net allowance columns (with 0 if employee doesn't have it)
  allAllowanceNames.forEach(allowanceName => {
    row[`Net ${allowanceName}`] = employeeAllowances[allowanceName] || 0;
  });

  row['Total Earnings'] = (payslip.attendance?.earnedSalary || 0) + (payslip.earnings.totalAllowances || 0);

  // Create a map of employee's deductions for quick lookup
  const employeeDeductions = {};
  if (Array.isArray(payslip.deductions?.otherDeductions)) {
    payslip.deductions.otherDeductions.forEach(deduction => {
      employeeDeductions[deduction.name] = deduction.amount || 0;
    });
  }

  // Add ALL deduction columns (with 0 if employee doesn't have it)
  allDeductionNames.forEach(deductionName => {
    row[deductionName] = employeeDeductions[deductionName] || 0;
  });

  row['Fines'] = 0;
  row['Salary Advance'] = payslip.loanAdvance?.advanceDeduction || 0;
  row['Total Deductions'] = payslip.deductions?.totalDeductions || 0;

  // OT & Incentives
  row['OT Days'] = payslip.attendance?.otDays || 0;
  row['OT Hours'] = payslip.attendance?.otHours || 0;
  row['OT Amount'] = payslip.earnings?.otPay || 0;
  row['Incentives'] = (payslip.earnings?.incentive || 0) + (payslip.extraDaysPay || 0);
  row['Other Amount'] = 0;
  row['Total Other Earnings'] = (row['OT Amount']) + (row['Incentives']);

  // Arrears
  row['Arrears'] = payslip.arrears?.arrearsAmount || 0;

  // Final
  row['NET SALARY'] = payslip.netSalary || 0;
  row['Round Off'] = payslip.roundOff || 0;
  row['FINAL SALARY'] = payslip.netSalary || 0;

  return row;
}

/**
 * Build Excel row for single payslip (backward compatibility)
 */
function buildPayslipExcelRows(payslip) {
  // For single payslip export, collect allowances/deductions from that payslip only
  const allAllowanceNames = new Set();
  const allDeductionNames = new Set();

  if (Array.isArray(payslip.earnings?.allowances)) {
    payslip.earnings.allowances.forEach(a => allAllowanceNames.add(a.name));
  }
  if (Array.isArray(payslip.deductions?.otherDeductions)) {
    payslip.deductions.otherDeductions.forEach(d => allDeductionNames.add(d.name));
  }

  return [buildPayslipExcelRowsNormalized(payslip, allAllowanceNames, allDeductionNames, 1)];
}

// OLD FUNCTION (kept for reference, not used)
function buildPayslipExcelRowsOld(payslip) {
  // Build row with dynamic allowances and deductions
  const row = {
    // Employee Information
    'S.No': '', // Will be added during loop
    'Employee Code': payslip.employee.emp_no || '',
    'Name': payslip.employee.name || '',
    'Designation': payslip.employee.designation || '',
    'Department': payslip.employee.department || '',
    'Division': '', // Add if available in future

    // Basic Salary
    'BASIC': payslip.earnings.basicPay || 0,
  };

  // ===== DYNAMIC ALLOWANCES (Gross) =====
  // Add each allowance as a separate column (e.g., "DA", "HRA", "CONV", etc.)
  if (Array.isArray(payslip.earnings.allowances)) {
    payslip.earnings.allowances.forEach(allowance => {
      const columnName = allowance.name || 'Unknown Allowance';
      row[columnName] = allowance.amount || 0;
    });
  }

  // Total Gross Salary
  row['TOTAL GROSS SALARY'] = payslip.earnings.grossSalary || 0;

  // ===== ATTENDANCE BREAKDOWN =====
  row['Month Days'] = payslip.attendance?.monthDays || payslip.attendance?.totalDaysInMonth || 0;
  row['Present Days'] = payslip.attendance?.presentDays || 0;
  row['Week Offs'] = payslip.attendance?.weeklyOffs || 0;
  row['Paid Leaves'] = payslip.attendance?.paidLeaveDays || 0;
  row['OD Days'] = payslip.attendance?.odDays || 0;
  row['Absents'] = payslip.attendance?.absentDays || 0;
  row['LOP\'s'] = 0; // Loss of Pay - can be calculated if needed
  row['Payable Shifts'] = payslip.attendance?.payableShifts || 0;
  row['Extra Days'] = payslip.attendance?.extraDays || 0;
  row['Total Paid Days'] = payslip.attendance?.totalPaidDays || 0;

  // ===== NET EARNINGS (Based on Attendance) =====
  row['Net Basic'] = payslip.attendance?.earnedSalary || payslip.earnings.earnedSalary || 0;

  // Add Net Allowances (same as gross allowances in most cases, but can be prorated)
  if (Array.isArray(payslip.earnings.allowances)) {
    payslip.earnings.allowances.forEach(allowance => {
      const netColumnName = `Net ${allowance.name}`;
      row[netColumnName] = allowance.amount || 0;
    });
  }

  row['Total Earnings'] = (payslip.attendance?.earnedSalary || 0) + (payslip.earnings.totalAllowances || 0);

  // ===== DYNAMIC DEDUCTIONS =====
  // Add each deduction as a separate column (e.g., "PF", "ESI", "Prof.Tax", etc.)
  if (Array.isArray(payslip.deductions?.otherDeductions)) {
    payslip.deductions.otherDeductions.forEach(deduction => {
      const columnName = deduction.name || 'Unknown Deduction';
      row[columnName] = deduction.amount || 0;
    });
  }

  // Other standard deductions
  row['Fines'] = 0; // Add if available
  row['Salary Advance'] = payslip.loanAdvance?.advanceDeduction || 0;
  row['Total Deductions'] = payslip.deductions?.totalDeductions || 0;

  // ===== OT & INCENTIVES =====
  row['OT Days'] = payslip.attendance?.otDays || 0;
  row['OT Hours'] = payslip.attendance?.otHours || 0;
  row['OT Amount'] = payslip.earnings?.otPay || 0;
  row['Incentives'] = payslip.earnings?.incentive || 0;
  row['Other Amount'] = 0; // Add if available
  row['Total Other Earnings'] = (payslip.earnings?.otPay || 0) + (payslip.earnings?.incentive || 0);

  // ===== ARREARS =====
  row['Arrears'] = payslip.arrears?.arrearsAmount || 0;

  // ===== FINAL SALARY =====
  row['NET SALARY'] = payslip.netSalary || 0;
  row['Round Off'] = 0; // Add rounding logic if needed
  row['FINAL SALARY'] = Math.round(payslip.netSalary || 0);

  return [row];
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

    // Case 1: Specific employees provided
    if (employeeIds) {
      targetEmployeeIds = String(employeeIds)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    }
    // Case 2: Filter by Division and/or Department (or just scope)
    else {
      // Start with base scope filter
      const filter = { ...req.scopeFilter };

      // Apply filters if provided
      if (req.query.divisionId) {
        filter.division_id = req.query.divisionId;
      }

      if (departmentId) {
        filter.department_id = departmentId;
      }

      // If any filter is active (including scope), fetch employees
      if (Object.keys(filter).length > 0) {
        // If query parameters were provided OR scope exists, we filter based on that
        const emps = await Employee.find(filter).select('_id');
        targetEmployeeIds = emps.map((e) => e._id.toString());
      }
    }

    const query = { month };

    // Only apply employee filter if we found specific employees to target. 
    // If no targetEmployeeIds but no filters were applied (superadmin full export), we export ALL matching month.
    // However, if filters WERE applied (e.g. division/dept) but returned 0 employees, we should query with empty list to return 0 records.

    // Check if any filter was active
    const filteringActive = employeeIds || req.query.divisionId || departmentId || (req.scopeFilter && Object.keys(req.scopeFilter).length > 0);

    if (filteringActive) {
      // If filtering is active, we MUST limit by employeeId. 
      // If targetEmployeeIds is empty, it means no employees matched the filter -> Should return 0 results.
      if (targetEmployeeIds.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No employees found matching the selected filters.',
        });
      }
      query.employeeId = { $in: targetEmployeeIds };
    }

    // --- OPTIMIZATION START for OOM Prevention ---

    // Step 1: Aggregate ALL unique allowance and deduction names upfront (instead of iterating payslips later)
    // This avoids needing to hold all payslip objects in memory just to find keys.
    const uniqueKeysAggregation = await PayrollRecord.aggregate([
      { $match: query },
      {
        $project: {
          allowances: "$earnings.allowances.name",
          deductions: "$deductions.otherDeductions.name"
        }
      },
      {
        $facet: {
          "allowances": [
            { $unwind: "$allowances" },
            { $group: { _id: null, names: { $addToSet: "$allowances" } } }
          ],
          "deductions": [
            { $unwind: "$deductions" },
            { $group: { _id: null, names: { $addToSet: "$deductions" } } }
          ]
        }
      }
    ]);

    const allAllowanceNames = new Set(uniqueKeysAggregation[0]?.allowances[0]?.names || []);
    const allDeductionNames = new Set(uniqueKeysAggregation[0]?.deductions[0]?.names || []);

    console.log(`\n📊 Excel Export Optimized: Found ${allAllowanceNames.size} unique allowances and ${allDeductionNames.size} unique deductions from DB aggregation.`);

    // Step 2: Stream process records instead of loading all payslips at once
    // We fetch a cursor or just iterate the find result (if manageable size)
    // For large datasets, cursor is safer but requires keeping connection open. 
    // Given standard limits, looping find result is usually okay if we don't map it to another heavy array first.

    // Fetch records sorted by employee ID
    const payrollRecords = await PayrollRecord.find(query)
      .select('employeeId month')
      .populate('employeeId', 'emp_no')
      .sort({ 'employeeId.emp_no': 1 })
      .lean(); // Use lean() for smaller object size if possible (though we need populate to work) - actually populate works with lean in some versions but safer without if methods needed. PayrollRecord has no methods used here.

    if (!payrollRecords || payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found for export. Please calculate payroll first.',
      });
    }

    const rows = [];
    let processedCount = 0;

    // Process one by one to keep memory usage low
    for (const pr of payrollRecords) {
      try {
        // Build single payslip
        const { payslip } = await buildPayslipData(pr.employeeId, pr.month);

        // Immediately convert to row (lightweight flat object)
        // Pass the pre-calculated allowance/deduction names
        const row = buildPayslipExcelRowsNormalized(payslip, allAllowanceNames, allDeductionNames, processedCount + 1);
        rows.push(row);

        processedCount++;

        // Optional: periodic GC hint or logging
        if (processedCount % 100 === 0) {
          if (global.gc) { global.gc(); } // requires expose-gc flag, usually not available in prod but harmless check
        }
      } catch (err) {
        console.error(`Error processing export row (Emp: ${pr.employeeId}):`, err);
      }
    }

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid payslip data could be generated.',
      });
    }

    // Step 3: Generate Excel (This still uses memory but 'rows' is much lighter than 'payslips')
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
 * @desc    Get payroll record by ID
 * @route   GET /api/payroll/record/:id
 * @access  Private
 */
exports.getPayrollRecordById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[GET /payroll/record/${id}] Fetching payroll record...`);

    const payrollRecord = await PayrollRecord.findById(id)
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id designation_id location bank_account_no pf_number esi_number uan_number pan_number',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'designation_id', select: 'name' }
        ]
      })
      .populate('attendanceSummaryId')
      .populate('calculationMetadata.calculatedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('processedBy', 'name email');

    if (!payrollRecord) {
      console.warn(`[GET /payroll/record/${id}] Payroll record NOT FOUND in database`);
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
    console.error('Error fetching payroll record by ID:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching payroll record',
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
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id designation_id location bank_account_no pf_number esi_number',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'designation_id', select: 'name' }
        ]
      })
      .populate('attendanceSummaryId')
      .populate('calculationMetadata.calculatedBy', 'name email')
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

    const query = { ...req.scopeFilter };

    // Debugging Payslip Issue
    console.log('[getPayrollRecords] Params:', { month, employeeId, departmentId, status });
    console.log('[getPayrollRecords] User Role:', req.user.role);
    console.log('[getPayrollRecords] Scope:', JSON.stringify(req.scopeFilter));
    console.log('[getPayrollRecords] Initial Query:', JSON.stringify(query));

    // Role-based filtering
    const isAdmin = ['super_admin', 'sub_admin', 'hr'].includes(req.user.role);

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
    } else if (!isAdmin) {
      // If not admin and no employeeId is provided, force employee filter to current user's employeeId
      if (!req.user.employee) {
        return res.status(403).json({ success: false, message: 'Access denied: No employee profile found' });
      }
      query.employeeId = req.user.employee;
    }

    // Secondary security check for non-admins
    if (!isAdmin && query.employeeId && query.employeeId.toString() !== req.user.employee?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only view your own records' });
    }

    if (status) {
      query.status = status;
    }

    // Apply Payslip Settings for non-admins
    if (!isAdmin) {
      // 1. Check if release is required
      const releaseRequiredSetting = await Settings.findOne({ key: 'payslip_release_required' });
      if (releaseRequiredSetting && releaseRequiredSetting.value === true) {
        query.isReleased = true;
      }

      // 2. Filter by history window
      const historyMonthsSetting = await Settings.findOne({ key: 'payslip_history_months' });
      if (historyMonthsSetting && historyMonthsSetting.value > 0) {
        const monthsOffset = parseInt(historyMonthsSetting.value);
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - monthsOffset);

        const cutoffMonth = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`;
        query.month = { ...query.month, $gte: cutoffMonth };
      }
    }

    // If departmentId, divisionId, designationId or search is provided, filter by employees in that scope
    const { divisionId, designationId, search } = req.query;
    if (departmentId || divisionId || designationId || search) {
      const empQuery = { ...req.scopeFilter };
      if (departmentId) empQuery.department_id = departmentId;
      if (divisionId) empQuery.division_id = divisionId;
      if (designationId) empQuery.designation_id = designationId;

      if (search) {
        empQuery.$or = [
          { employee_name: { $regex: search, $options: 'i' } },
          { emp_no: { $regex: search, $options: 'i' } }
        ];
      }

      const employees = await Employee.find(empQuery).select('_id');
      const employeeIdsInRange = employees.map((emp) => emp._id);

      if (employeeIdsInRange.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
        });
      }

      // If we already have a specific employeeId filter, intersect it
      if (query.employeeId) {
        const rangeSet = new Set(employeeIdsInRange.map(id => id.toString()));
        if (query.employeeId.$in) {
          query.employeeId.$in = query.employeeId.$in.filter(id => rangeSet.has(id.toString()));
          if (query.employeeId.$in.length === 0) return res.status(200).json({ success: true, count: 0, data: [] });
        } else {
          if (!rangeSet.has(query.employeeId.toString())) {
            return res.status(200).json({ success: true, count: 0, data: [] });
          }
        }
      } else {
        query.employeeId = { $in: employeeIdsInRange };
      }
    }

    const payrollRecords = await PayrollRecord.find(query)
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id designation_id location bank_account_no pf_number esi_number',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'designation_id', select: 'name' }
        ]
      })
      .sort({ month: -1, emp_no: 1 })
      .limit(1000); // Limit to prevent large queries

    console.log(`[getPayrollRecords] Final Query executed:`, JSON.stringify(query));
    console.log(`[getPayrollRecords] Found ${payrollRecords.length} records.`);

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

    // Check permissions
    const isAdmin = ['super_admin', 'sub_admin', 'hr'].includes(req.user.role);
    if (!isAdmin && employeeId.toString() !== req.user.employee?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Verify settings for non-admins
    if (!isAdmin) {
      const payrollRecord = await PayrollRecord.findOne({ employeeId, month });
      if (!payrollRecord) {
        return res.status(404).json({ success: false, message: 'Payslip not found' });
      }

      // Check Release status
      const releaseRequiredSetting = await Settings.findOne({ key: 'payslip_release_required' });
      if (releaseRequiredSetting && releaseRequiredSetting.value === true && !payrollRecord.isReleased) {
        return res.status(403).json({ success: false, message: 'Payslip not yet released' });
      }

      // Check History months
      const historyMonthsSetting = await Settings.findOne({ key: 'payslip_history_months' });
      if (historyMonthsSetting && historyMonthsSetting.value > 0) {
        const monthsOffset = parseInt(historyMonthsSetting.value);
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - monthsOffset);
        const cutoffMonth = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`;

        if (month < cutoffMonth) {
          return res.status(403).json({ success: false, message: 'Historical payslip access limit exceeded' });
        }
      }
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
 * @desc    Get payslip data for download (tracks download count)
 * @route   GET /api/payroll/download/:employeeId/:month
 * @access  Private
 */
exports.downloadPayslip = async (req, res) => {
  try {
    const { employeeId, month } = req.params;

    // Permissions check
    const isAdmin = ['super_admin', 'sub_admin', 'hr'].includes(req.user.role);
    if (!isAdmin && employeeId.toString() !== req.user.employee?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const payrollRecord = await PayrollRecord.findOne({ employeeId, month });
    if (!payrollRecord) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }

    // Check download limits for non-admins
    if (!isAdmin) {
      const downloadLimitSetting = await Settings.findOne({ key: 'payslip_download_limit' });
      const limit = downloadLimitSetting ? parseInt(downloadLimitSetting.value) : 0;

      if (limit > 0 && (payrollRecord.downloadCount || 0) >= limit) {
        return res.status(403).json({
          success: false,
          message: `Download limit reached (${limit}). Please contact HR for assistance.`
        });
      }

      // Increment download count
      payrollRecord.downloadCount = (payrollRecord.downloadCount || 0) + 1;
      await payrollRecord.save();
    }

    const { payslip } = await buildPayslipData(employeeId, month);

    res.status(200).json({
      success: true,
      message: 'Download tracked successfully',
      data: payslip,
      downloadCount: payrollRecord.downloadCount,
    });
  } catch (error) {
    console.error('Error tracking payslip download:', error);
    res.status(500).json({
      success: false,
      message: 'Error tracking download',
      error: error.message,
    });
  }
};

/**
 * @desc    Release payslips for a specific month/department
 * @route   PUT /api/payroll/release
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.releasePayslips = async (req, res) => {
  try {
    const { month, departmentId, employeeIds } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month (YYYY-MM) is required',
      });
    }

    const query = { month, status: { $in: ['approved', 'processed'] } };

    if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
      query.employeeId = { $in: employeeIds };
    } else if (departmentId) {
      // Find employees in department
      const employees = await Employee.find({ department_id: departmentId }).select('_id');
      const deptEmpIds = employees.map(e => e._id);
      query.employeeId = { $in: deptEmpIds };
    }

    const updateResult = await PayrollRecord.updateMany(
      query,
      { $set: { isReleased: true } }
    );

    res.status(200).json({
      success: true,
      message: `Released ${updateResult.modifiedCount} payslips for ${month}`,
      modifiedCount: updateResult.modifiedCount,
    });
  } catch (error) {
    console.error('Error releasing payslips:', error);
    res.status(500).json({
      success: false,
      message: 'Error releasing payslips',
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
      .populate({
        path: 'employeeId',
        select: 'employee_name emp_no department_id designation_id pf_number esi_number',
        populate: [
          { path: 'department_id', select: 'name' },
          { path: 'designation_id', select: 'name' }
        ]
      })
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

/**
 * @desc    Bulk calculate payroll for employees matching filters
 * @route   POST /api/payroll/bulk-calculate
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.calculatePayrollBulk = async (req, res) => {
  try {
    const { month, divisionId, departmentId, strategy } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month (YYYY-MM) is required',
      });
    }

    // Dynamic query for active employees
    console.log('[Bulk Payroll] Req.scopeFilter:', JSON.stringify(req.scopeFilter));

    const query = { ...req.scopeFilter, is_active: true };
    if (divisionId) query.division_id = divisionId;
    if (departmentId) query.department_id = departmentId;

    console.log('[Bulk Payroll] Final Query:', JSON.stringify(query));
    console.log('[Bulk Payroll] Filters - Division:', divisionId, 'Department:', departmentId, 'Month:', month);

    const employees = await Employee.find(query).select('_id');

    console.log('[Bulk Payroll] Found employees:', employees.length);

    if (!employees || employees.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'No active employees found matching the filters',
      });
    }

    const useLegacy = strategy === 'legacy';
    const payrollCalculationService = require('../services/payrollCalculationService');
    const calcFn = payrollCalculationService.calculatePayrollNew;

    let successCount = 0;
    let failCount = 0;
    const batchIds = new Set();
    const errors = [];

    // Sequential processing to avoid overwhelming the database/S3/BullMQ
    // and to safely handle batch locks individually
    for (const emp of employees) {
      try {
        const result = await calcFn(emp._id.toString(), month, req.user._id, {
          source: useLegacy ? 'all' : 'payregister',
        });

        if (result.batchId) {
          batchIds.add(result.batchId.toString());
        }
        successCount++;
      } catch (err) {
        failCount++;
        errors.push({ employeeId: emp._id, message: err.message });
        console.error(`[Bulk Calc] Failed for ${emp._id}:`, err.message);
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk calculation complete: ${successCount} success, ${failCount} failed`,
      data: {
        totalProcessed: employees.length,
        successCount,
        failCount,
        batchIds: Array.from(batchIds),
        errors: errors.slice(0, 10), // Return only first 10 errors for brevity
      },
    });
  } catch (error) {
    console.error('Error in bulk payroll calculation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error during bulk calculation',
    });
  }
};

/**
 * @desc    Get attendance data for a range of months for an employee
 * @route   GET /api/payroll/attendance-range
 * @access  Private
 */
exports.getAttendanceDataRange = async (req, res) => {
  try {
    const { employeeId, startMonth, endMonth } = req.query;

    if (!employeeId || !startMonth || !endMonth) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, start month, and end month are required'
      });
    }

    // Fetch payroll records for the range
    // Since month is "YYYY-MM", string comparison works for range
    const records = await PayrollRecord.find({
      employeeId,
      month: { $gte: startMonth, $lte: endMonth }
    }).select('month totalDaysInMonth attendance.totalPaidDays');

    res.status(200).json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('Error fetching attendance data range:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance data range',
      error: error.message
    });
  }
};
