/**
 * Normalized 2nd-salary row shape (same columns as Excel export).
 * @param {Object} record - SecondSalaryRecord (lean)
 * @param {Set<string>} allAllowanceNames
 * @param {Set<string>} allDeductionNames
 * @param {number} serialNo
 */
function buildSecondSalaryExcelRowsNormalized(record, allAllowanceNames, allDeductionNames, serialNo) {
  const employee = record.employeeId;
  const row = {
    'S.No': serialNo,
    'Employee Code': record.emp_no || employee?.emp_no || '',
    Name: employee?.employee_name || 'N/A',
    Designation: employee?.designation_id?.name || 'N/A',
    Department: employee?.department_id?.name || 'N/A',
    Division: record.division_id?.name || employee?.division_id?.name || 'N/A',
    'Date of Joining': employee?.doj ? new Date(employee.doj).toLocaleDateString() : '',
    'Payment Mode': employee?.salary_mode || '',
    'Bank Name': employee?.bank_name || '',
    'Bank Account No': employee?.bank_account_no || '',
    BASIC: record.earnings?.basicPay || 0,
  };

  const employeeAllowances = {};
  if (record.earnings && Array.isArray(record.earnings.allowances)) {
    record.earnings.allowances.forEach((allowance) => {
      if (allowance && allowance.name) {
        employeeAllowances[allowance.name] = allowance.amount || 0;
      }
    });
  }

  allAllowanceNames.forEach((allowanceName) => {
    row[allowanceName] = employeeAllowances[allowanceName] || 0;
  });

  row['TOTAL GROSS SALARY'] = record.earnings?.grossSalary || 0;

  row['Month Days'] = record.totalDaysInMonth || 0;
  row['Present Days'] = record.attendance?.presentDays || 0;
  row['Week Offs'] = record.attendance?.weeklyOffs || 0;
  row['Paid Leaves'] = record.attendance?.paidLeaveDays || 0;
  row['OD Days'] = record.attendance?.odDays || 0;
  row.Absents = record.attendance?.absentDays || 0;
  row["LOP's"] = record.attendance?.lopDays || 0;
  row['Payable Shifts'] = record.attendance?.payableShifts || 0;
  row['Extra Days'] = record.attendance?.extraDays || 0;
  row['Total Paid Days'] = record.attendance?.totalPaidDays || 0;
  row['Attendance Deduction Days'] = record.deductions?.attendanceDeductionBreakdown?.daysDeducted || 0;
  row['Final Paid Days'] = Math.max(0, (row['Total Paid Days'] || 0) - (row['Attendance Deduction Days'] || 0));

  row['Net Basic'] = record.attendance?.earnedSalary || record.earnings?.payableAmount || 0;

  allAllowanceNames.forEach((allowanceName) => {
    row[`Net ${allowanceName}`] = employeeAllowances[allowanceName] || 0;
  });

  row['Total Earnings'] = (row['Net Basic'] || 0) + (record.earnings?.totalAllowances || 0);

  const employeeDeductions = {};
  if (record.deductions && Array.isArray(record.deductions.otherDeductions)) {
    record.deductions.otherDeductions.forEach((deduction) => {
      if (deduction && deduction.name) {
        employeeDeductions[deduction.name] = deduction.amount || 0;
      }
    });
  }

  allDeductionNames.forEach((deductionName) => {
    row[deductionName] = employeeDeductions[deductionName] || 0;
  });

  row.Fines = 0;
  row['Salary Advance'] = record.loanAdvance?.advanceDeduction || 0;
  row['Total Deductions'] = record.deductions?.totalDeductions || 0;

  row['OT Days'] = record.attendance?.otDays || 0;
  row['OT Hours'] = record.attendance?.otHours || 0;
  row['OT Amount'] = record.earnings?.otPay || 0;
  row.Incentives = (record.earnings?.incentive || 0) + (record.extraDaysPay || 0);
  row['Other Amount'] = 0;
  row['Total Other Earnings'] = (row['OT Amount'] || 0) + (row.Incentives || 0);

  row.Arrears = record.arrearsAmount || 0;

  row['NET SALARY'] = record.netSalary || 0;
  row['Round Off'] = record.roundOff || 0;
  row['FINAL SALARY'] = record.netSalary || 0;

  return row;
}

/**
 * @param {Object[]} records - SecondSalaryRecord lean docs with employeeId populated
 * @returns {{ headers: string[], rows: Record<string, unknown>[] }}
 */
function buildSecondSalaryPaysheetData(records) {
  if (!records || records.length === 0) {
    return { headers: [], rows: [] };
  }
  const allAllowanceNames = new Set();
  const allDeductionNames = new Set();
  records.forEach((record) => {
    if (Array.isArray(record.earnings?.allowances)) {
      record.earnings.allowances.forEach((a) => {
        if (a && a.name) allAllowanceNames.add(a.name);
      });
    }
    if (Array.isArray(record.deductions?.otherDeductions)) {
      record.deductions.otherDeductions.forEach((d) => {
        if (d && d.name) allDeductionNames.add(d.name);
      });
    }
  });
  const rows = records.map((record, index) =>
    buildSecondSalaryExcelRowsNormalized(record, allAllowanceNames, allDeductionNames, index + 1)
  );
  const headers = Object.keys(rows[0]);
  return { headers, rows };
}

module.exports = {
  buildSecondSalaryExcelRowsNormalized,
  buildSecondSalaryPaysheetData,
};
