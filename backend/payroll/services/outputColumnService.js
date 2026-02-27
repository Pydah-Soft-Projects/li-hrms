/**
 * Builds paysheet row from payslip + config.outputColumns (Payroll Configuration).
 *
 * Payslip is from the payroll calculation (calculatePayrollNew returns it), not from the record.
 * - FIELD: getValueByPath(payslip, col.field) — value from calculation (employee, pay register, earnings,
 *   deductions, statutory, cumulatives, loan/advance, etc.).
 * - FORMULA: value from before columns (earlier columns in config order) + context from payslip.
 *   columnContext = getContextFromPayslip(payslip) plus each previous column value by header key.
 */

const ALLOWED_FORMULA_VARS = new Set([
  'basicPay', 'grossSalary', 'netSalary', 'totalDeductions', 'roundOff',
  'presentDays', 'payableShifts', 'monthDays', 'otPay', 'incentive',
  'advanceDeduction', 'loanEMI', 'earnedSalary', 'totalAllowances',
  'allowancesCumulative', 'deductionsCumulative', 'statutoryCumulative',
  'emp_no', 'name', 'designation', 'department', 'division',
  'attendanceDeduction', 'permissionDeduction', 'leaveDeduction', 'otherDeductions',
  'arrearsAmount', 'extraDays', 'paidLeaveDays', 'odDays', 'absentDays', 'weeklyOffs', 'holidays',
  'perDayBasicPay', 'basic_pay', 'lopDays', 'elUsedInPayroll', 'attendanceDeductionDays',
]);

function getContextFromPayslip(payslip) {
  const emp = payslip.employee || {};
  const att = payslip.attendance || {};
  const earn = payslip.earnings || {};
  const ded = payslip.deductions || {};
  const loan = payslip.loanAdvance || {};
  const arrears = payslip.arrears || {};
  const num = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    emp_no: emp.emp_no ?? '',
    name: emp.name ?? '',
    designation: emp.designation ?? '',
    department: emp.department ?? '',
    division: emp.division ?? '',
    basicPay: num(earn.basicPay),
    basic_pay: num(earn.basicPay),
    grossSalary: num(earn.grossSalary),
    netSalary: num(payslip.netSalary),
    totalDeductions: num(ded.totalDeductions),
    roundOff: num(payslip.roundOff),
    presentDays: num(att.presentDays),
    payableShifts: num(att.payableShifts),
    monthDays: num(att.totalDaysInMonth, 30),
    otPay: num(earn.otPay),
    incentive: num(earn.incentive),
    earnedSalary: num(att.earnedSalary ?? earn.earnedSalary),
    totalAllowances: num(earn.totalAllowances),
    allowancesCumulative: num(earn.allowancesCumulative ?? earn.totalAllowances),
    deductionsCumulative: num(ded.deductionsCumulative ?? ded.totalDeductions),
    statutoryCumulative: num(ded.statutoryCumulative),
    advanceDeduction: num(loan.advanceDeduction),
    loanEMI: num(loan.totalEMI),
    perDayBasicPay: num(earn.perDayBasicPay),
    attendanceDeduction: num(ded.attendanceDeduction),
    permissionDeduction: num(ded.permissionDeduction),
    leaveDeduction: num(ded.leaveDeduction),
    arrearsAmount: num(arrears.arrearsAmount ?? payslip.arrearsAmount),
    extraDays: num(att.extraDays),
    paidLeaveDays: num(att.paidLeaveDays),
    odDays: num(att.odDays),
    absentDays: num(att.absentDays),
    weeklyOffs: num(att.weeklyOffs),
    holidays: num(att.holidays),
    lopDays: num(att.lopDays),
    elUsedInPayroll: num(payslip.attendance?.elUsedInPayroll ?? payslip.elUsedInPayroll),
    attendanceDeductionDays: num(att.attendanceDeductionDays ?? payslip.attendanceDeductionDays ?? ded.attendanceDeductionBreakdown?.daysDeducted),
    // Snake_case / alias for paysheet formulas (flow-order columns)
    month_days: num(att.totalDaysInMonth, 30),
    monthdays: num(att.totalDaysInMonth, 30),
    present_days: num(att.presentDays),
    week_offs: num(att.weeklyOffs),
    paidleaves: num(att.paidLeaveDays),
    el: num(payslip.attendance?.elUsedInPayroll ?? payslip.elUsedInPayroll),
    salary: num(earn.basicPay),
    extradays: num(att.extraDays),
    statutory_deductions: num(ded.statutoryCumulative),
    net_salary: num(payslip.netSalary),
    extra_hours_pay: num(earn.otPay),
    total_allowances: num(earn.allowancesCumulative ?? earn.totalAllowances),
    gross_salary: num(earn.grossSalary),
    salary_advance: num(loan.advanceDeduction),
    loan_recovery: num(loan.totalEMI),
    remaining_balance: num(loan.remainingBalance),
    attendance_deduction: num(ded.attendanceDeduction),
    round_off: num(payslip.roundOff),
  };
}

function headerToKey(header) {
  if (!header || typeof header !== 'string') return '';
  return header.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'col';
}

// Allow formula to use: numbers, +-*/(),., comma, identifiers, and ? : for ternary
// extraKeys: Set or Array of allowed variable names (e.g. context keys)
function isFormulaSafe(formula, extraKeys = null) {
  if (!formula || typeof formula !== 'string') return false;
  const trimmed = formula.trim();
  if (!trimmed) return false;
  if (!/^[\w\s+\-*/().,?:]+$/.test(trimmed)) return false;
  const extra = extraKeys instanceof Set ? extraKeys : new Set(Array.isArray(extraKeys) ? extraKeys : (extraKeys ? [extraKeys] : []));
  const words = trimmed.split(/\s+|(?=[+\-*/(),?:])|(?<=[+\-*/(),?:])/).filter(Boolean);
  const mathMethods = ['min', 'max', 'round', 'floor', 'ceil', 'abs'];
  for (const w of words) {
    if (/^\d+\.?\d*$/.test(w)) continue;
    if (/^[+\-*/(),.:?]$/.test(w)) continue;
    if (w === 'Math' || mathMethods.includes(w)) continue;
    if (/^Math\.(min|max|round|floor|ceil|abs)$/.test(w)) continue;
    if (ALLOWED_FORMULA_VARS.has(w)) continue;
    if (extra.has(w)) continue;
    return false;
  }
  return true;
}

function safeEvalFormula(formula, context) {
  const keys = Object.keys(context || {});
  const allowedSet = new Set(keys);
  if (!formula || !isFormulaSafe(formula, allowedSet)) return 0;
  try {
    const values = keys.map((k) => {
      const v = context[k];
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      const n = Number(v);
      return Number.isNaN(n) ? 0 : n;
    });
    const fn = new Function('Math', ...keys, `return (${formula});`);
    const result = fn(Math, ...values);
    if (typeof result === 'number' && !Number.isNaN(result)) return result;
    return 0;
  } catch (e) {
    return 0;
  }
}

/** Short field names (no dot) to full path so config typos or short names still resolve */
const SHORT_FIELD_TO_PATH = {
  emp_no: 'employee.emp_no',
  name: 'employee.name',
  designation: 'employee.designation',
  department: 'employee.department',
  division: 'employee.division',
  basicPay: 'earnings.basicPay',
  perDayBasicPay: 'earnings.perDayBasicPay',
  otPay: 'earnings.otPay',
  incentive: 'earnings.incentive',
  allowancesCumulative: 'earnings.allowancesCumulative',
  grossSalary: 'earnings.grossSalary',
  presentDays: 'attendance.presentDays',
  payableShifts: 'attendance.payableShifts',
  totalDaysInMonth: 'attendance.totalDaysInMonth',
  weeklyOffs: 'attendance.weeklyOffs',
  holidays: 'attendance.holidays',
  paidLeaveDays: 'attendance.paidLeaveDays',
  lopDays: 'attendance.lopDays',
  odDays: 'attendance.odDays',
  absentDays: 'attendance.absentDays',
  attendanceDeductionDays: 'attendance.attendanceDeductionDays',
  elUsedInPayroll: 'attendance.elUsedInPayroll',
  attendanceDeduction: 'deductions.attendanceDeduction',
  statutoryCumulative: 'deductions.statutoryCumulative',
  deductionsCumulative: 'deductions.deductionsCumulative',
  totalDeductions: 'deductions.totalDeductions',
  advanceDeduction: 'loanAdvance.advanceDeduction',
  totalEMI: 'loanAdvance.totalEMI',
  remainingBalance: 'loanAdvance.remainingBalance',
  roundOff: 'roundOff',
  arrearsAmount: 'arrears.arrearsAmount',
  netSalary: 'netSalary',
};

/**
 * Resolve component amount by name/code for use in paysheet columns (flow order).
 * - earnings.allowanceAmount:Name → amount from earnings.allowances[] where name === Name
 * - deductions.otherDeductionAmount:Name → amount from deductions.otherDeductions[] where name === Name
 * - deductions.statutoryAmount:Code → employeeAmount from deductions.statutoryDeductions[] where code === Code (PF, ESI, PT)
 */
function getValueByPath(obj, path) {
  if (!path || typeof path !== 'string') return '';
  let trimmed = path.trim();
  if (!trimmed) return '';
  if (!trimmed.includes('.') && trimmed.indexOf(':') < 0 && SHORT_FIELD_TO_PATH[trimmed]) {
    trimmed = SHORT_FIELD_TO_PATH[trimmed];
  }
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0) {
    const basePath = trimmed.slice(0, colonIdx).trim();
    const key = trimmed.slice(colonIdx + 1).trim();
    if (basePath === 'earnings.allowanceAmount' && key) {
      const allowances = obj?.earnings?.allowances;
      if (Array.isArray(allowances)) {
        const item = allowances.find((a) => a && String(a.name).trim() === key);
        return item != null && typeof item.amount === 'number' ? item.amount : 0;
      }
      return 0;
    }
    if (basePath === 'deductions.otherDeductionAmount' && key) {
      const other = obj?.deductions?.otherDeductions;
      if (Array.isArray(other)) {
        const item = other.find((d) => d && String(d.name).trim() === key);
        return item != null && typeof item.amount === 'number' ? item.amount : 0;
      }
      return 0;
    }
    if (basePath === 'deductions.statutoryAmount' && key) {
      const statutory = obj?.deductions?.statutoryDeductions;
      if (Array.isArray(statutory)) {
        const item = statutory.find((s) => s && (String(s.code).trim() === key || String(s.name).trim() === key));
        return item != null && typeof item.employeeAmount === 'number' ? item.employeeAmount : 0;
      }
      return 0;
    }
  }
  const parts = trimmed.split('.').filter(Boolean);
  let val = obj;
  for (const p of parts) {
    if (val == null) return '';
    val = val[p];
  }
  if (val === undefined || val === null) return '';
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) return '';
  return val;
}

/** Map common field paths to display headers when config has no header set */
function fieldToHeader(field) {
  if (!field || typeof field !== 'string') return '';
  const f = field.trim();
  const map = {
    'employee.emp_no': 'Employee Code',
    'employee.name': 'Name',
    'employee.designation': 'Designation',
    'employee.department': 'Department',
    'employee.division': 'Division',
    'earnings.basicPay': 'Basic pay',
    'earnings.perDayBasicPay': 'Per day basic',
    'earnings.otPay': 'OT pay',
    'earnings.incentive': 'Incentive',
    'earnings.allowancesCumulative': 'Allowances cumulative',
    'earnings.grossSalary': 'Gross salary',
    'attendance.presentDays': 'Present days',
    'attendance.payableShifts': 'Payable shifts',
    'attendance.totalDaysInMonth': 'Month days',
    'attendance.weeklyOffs': 'Week offs',
    'attendance.holidays': 'Holidays',
    'attendance.paidLeaveDays': 'Paid leave days',
    'attendance.elUsedInPayroll': 'EL used',
    'attendance.lopDays': 'LOP days',
    'attendance.odDays': 'OD days',
    'attendance.absentDays': 'Absent days',
    'attendance.attendanceDeductionDays': 'Attendance deduction days',
    'deductions.attendanceDeduction': 'Attendance deduction',
    'deductions.statutoryCumulative': 'Statutory cumulative',
    'deductions.deductionsCumulative': 'Deductions cumulative',
    'deductions.totalDeductions': 'Total deductions',
    'loanAdvance.advanceDeduction': 'Advance deduction',
    'loanAdvance.totalEMI': 'Loan EMI',
    'loanAdvance.remainingBalance': 'Remaining balance',
    'roundOff': 'Round off',
    'arrears.arrearsAmount': 'Arrears',
    'netSalary': 'Net salary',
  };
  if (map[f]) return map[f];
  if (f.startsWith('earnings.allowanceAmount:')) return f.replace('earnings.allowanceAmount:', '').trim() || 'Allowance';
  if (f.startsWith('deductions.statutoryAmount:')) return f.replace('deductions.statutoryAmount:', '').trim() || 'Statutory';
  if (f.startsWith('deductions.otherDeductionAmount:')) return f.replace('deductions.otherDeductionAmount:', '').trim() || 'Deduction';
  return f.split('.').pop().replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim() || f;
}

/**
 * Expand outputColumns so that before each cumulative column we insert breakdown columns:
 * - Before earnings.allowancesCumulative: one column per allowance (earnings.allowanceAmount:Name).
 * - Before deductions.statutoryCumulative: one column per statutory (deductions.statutoryAmount:Code) e.g. PF, ESI, PT.
 * - Before deductions.deductionsCumulative: one column per other deduction (deductions.otherDeductionAmount:Name).
 * @param {Array} outputColumns - Configured output columns
 * @param {Array} payslips - Array of payslip objects (used to collect union of allowance names, statutory codes, other deduction names)
 * @returns {Array} New column array with breakdown columns inserted; each item has { header, field, source, formula?, order }.
 */
function expandOutputColumnsWithBreakdown(outputColumns, payslips = []) {
  if (!Array.isArray(outputColumns) || outputColumns.length === 0) return outputColumns;

  const allowanceNames = new Set();
  const statutoryKeys = new Map(); // code -> display name (name or code)
  const otherDeductionNames = new Set();

  for (const p of payslips) {
    (p.earnings?.allowances || []).forEach((a) => {
      if (a && a.name) allowanceNames.add(String(a.name).trim());
    });
    (p.deductions?.statutoryDeductions || []).forEach((s) => {
      if (s && (s.code || s.name)) {
        const code = String(s.code || s.name).trim();
        if (!statutoryKeys.has(code)) statutoryKeys.set(code, String(s.name || s.code).trim());
      }
    });
    (p.deductions?.otherDeductions || []).forEach((d) => {
      if (d && d.name) otherDeductionNames.add(String(d.name).trim());
    });
  }

  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const expanded = [];
  let order = 0;

  for (const col of sorted) {
    const field = (col.field || '').trim();

    // Before "Allowances cumulative": one column per allowance – header = allowance name
    if (field === 'earnings.allowancesCumulative' && allowanceNames.size > 0) {
      for (const name of [...allowanceNames].sort()) {
        const header = (name && String(name).trim()) || 'Allowance';
        expanded.push({
          header,
          field: `earnings.allowanceAmount:${name}`,
          source: 'field',
          formula: '',
          order: order++,
        });
      }
    }

    // Before "Statutory cumulative": one column per statutory (PF, ESI, PT, etc.) – header = statutory name
    if (field === 'deductions.statutoryCumulative' && statutoryKeys.size > 0) {
      for (const [code, displayName] of [...statutoryKeys.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const header = (displayName && String(displayName).trim()) || (code && String(code).trim()) || 'Statutory';
        expanded.push({
          header,
          field: `deductions.statutoryAmount:${code}`,
          source: 'field',
          formula: '',
          order: order++,
        });
      }
    }

    // Before "Deductions cumulative": one column per other deduction – header = deduction name
    if (field === 'deductions.deductionsCumulative') {
      for (const name of [...otherDeductionNames].sort()) {
        const header = (name && String(name).trim()) || 'Deduction';
        expanded.push({
          header,
          field: `deductions.otherDeductionAmount:${name}`,
          source: 'field',
          formula: '',
          order: order++,
        });
      }
    }

    const resolvedHeader = (col.header && String(col.header).trim()) || fieldToHeader(col.field) || 'Column';
    expanded.push({
      ...col,
      header: resolvedHeader,
      order: order++,
    });
  }

  return expanded;
}

/** Map field paths to getContextFromPayslip keys for fallback when getValueByPath returns empty */
const FIELD_TO_CONTEXT_KEY = {
  'employee.emp_no': 'emp_no',
  'employee.name': 'name',
  'employee.designation': 'designation',
  'employee.department': 'department',
  'employee.division': 'division',
  'earnings.basicPay': 'basicPay',
  'earnings.perDayBasicPay': 'perDayBasicPay',
  'earnings.otPay': 'otPay',
  'earnings.incentive': 'incentive',
  'earnings.allowancesCumulative': 'allowancesCumulative',
  'earnings.grossSalary': 'grossSalary',
  'earnings.payableAmount': 'earnedSalary',
  'earnings.earnedSalary': 'earnedSalary',
  'attendance.presentDays': 'presentDays',
  'attendance.payableShifts': 'payableShifts',
  'attendance.totalDaysInMonth': 'monthDays',
  'attendance.weeklyOffs': 'weeklyOffs',
  'attendance.holidays': 'holidays',
  'attendance.paidLeaveDays': 'paidLeaveDays',
  'attendance.elUsedInPayroll': 'elUsedInPayroll',
  'attendance.lopDays': 'lopDays',
  'attendance.odDays': 'odDays',
  'attendance.absentDays': 'absentDays',
  'attendance.attendanceDeductionDays': 'attendanceDeductionDays',
  'deductions.attendanceDeduction': 'attendanceDeduction',
  'deductions.statutoryCumulative': 'statutoryCumulative',
  'deductions.deductionsCumulative': 'deductionsCumulative',
  'deductions.totalDeductions': 'totalDeductions',
  'loanAdvance.advanceDeduction': 'advanceDeduction',
  'loanAdvance.totalEMI': 'loanEMI',
  'loanAdvance.remainingBalance': 'remaining_balance',
  'roundOff': 'roundOff',
  'arrears.arrearsAmount': 'arrearsAmount',
  'netSalary': 'netSalary',
};

/**
 * Build one row from payslip and output column config (same config as payroll flow).
 * Columns are evaluated in config order so that:
 * - FIELD: value is provided by the service and controller — getValueByPath(payslip, col.field).
 *   If the value is empty, fall back to getContextFromPayslip(payslip) using FIELD_TO_CONTEXT_KEY so
 *   employee/attendance/earnings/deductions display correctly (e.g. from PayrollRecord-built payslips).
 * - FORMULA: value uses before columns (earlier columns in this list) plus context from the payslip.
 */
function buildRowFromOutputColumns(payslip, outputColumns, serialNo = null) {
  const row = {};
  if (serialNo != null) row['S.No'] = serialNo;
  if (!Array.isArray(outputColumns) || outputColumns.length === 0) return row;

  const sorted = [...outputColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const baseContext = getContextFromPayslip(payslip);
  const columnContext = { ...baseContext };

  for (const col of sorted) {
    const header = col.header || 'Column';
    let val;
    if (col.source === 'formula' && col.formula) {
      val = safeEvalFormula(col.formula, columnContext);
    } else {
      const field = (col.field || '').trim();
      val = getValueByPath(payslip, field);
      if ((val === '' || val === undefined || val === null) && field && FIELD_TO_CONTEXT_KEY[field] != null) {
        const contextVal = baseContext[FIELD_TO_CONTEXT_KEY[field]];
        if (contextVal !== undefined && contextVal !== null && contextVal !== '') {
          val = contextVal;
        }
      }
    }
    row[header] = val;
    const key = headerToKey(header);
    if (key) columnContext[key] = typeof val === 'number' ? val : (Number(val) || 0);
  }
  return row;
}

module.exports = {
  buildRowFromOutputColumns,
  expandOutputColumnsWithBreakdown,
  getValueByPath,
  getContextFromPayslip,
  safeEvalFormula,
};
