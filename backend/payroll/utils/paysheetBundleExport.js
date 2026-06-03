/**
 * Paysheet bundle: Regular + 2nd salary + Comparison (paired columns + net diff).
 * Supports combined table or by-division/department sections with export headers.
 */

const {
  XLSX,
  applyPaysheetWorksheetStyles,
  finalizeWorksheet,
  writeStyledWorkbook,
} = require('./paysheetExcelSheetStyle');
const mongoose = require('mongoose');
const { compareEmpNo } = require('../../shared/utils/employeeSort');
const outputColumnService = require('../services/outputColumnService');
const { getCompanyProfile } = require('../../shared/utils/companyProfile');
const { getPayrollDateRange, formatPayrollPeriodRangeEnIn } = require('../../shared/utils/dateUtils');

const DEFAULT_FIXED_KEYS = ['S.No', 'Employee Code', 'Name', 'Designation', 'Department', 'Division'];

/** @typedef {'combined' | 'by_department'} PaysheetBundleExportFormat */

/**
 * @typedef {Object} PaysheetExportMeta
 * @property {string} companyTitle
 * @property {string} payPeriodLine
 * @property {string} divisionLine
 * @property {string} departmentsLine
 * @property {string[]} [filterLines]
 */

/** Ensure loan/advance fields resolve in getValueByPath (empty subdocs omit keys in Mongo). */
function normalizeLoanAdvanceForPayslip(raw) {
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw.toObject
        ? raw.toObject()
        : { ...raw }
      : {};
  const remainingRaw = o.remainingBalance;
  return {
    ...o,
    totalEMI: Number(o.totalEMI) || 0,
    advanceDeduction: Number(o.advanceDeduction) || 0,
    remainingBalance:
      remainingRaw != null && remainingRaw !== ''
        ? Number(remainingRaw) || 0
        : undefined,
  };
}

/** Prefer top-level arrearsAmount when nested subdoc is missing or empty (PayrollRecord stores both patterns). */
function normalizeArrearsFromPayrollRecord(record) {
  const raw =
    record.arrears && typeof record.arrears === 'object'
      ? record.arrears.toObject
        ? record.arrears.toObject()
        : { ...record.arrears }
      : {};
  const nested = raw.arrearsAmount;
  const useNested = nested !== undefined && nested !== null && nested !== '';
  const arrearsAmount = Number(useNested ? nested : record.arrearsAmount) || 0;
  const settlements =
    Array.isArray(raw.arrearsSettlements) && raw.arrearsSettlements.length
      ? raw.arrearsSettlements
      : record.arrearsSettlements || [];
  return { arrearsAmount, arrearsSettlements: settlements };
}

/** Top-level manualDeductionsAmount is canonical on PayrollRecord; nested object may be empty in lean docs. */
function normalizeManualDeductionsFromPayrollRecord(record) {
  const raw =
    record.manualDeductions && typeof record.manualDeductions === 'object'
      ? record.manualDeductions.toObject
        ? record.manualDeductions.toObject()
        : { ...record.manualDeductions }
      : {};
  const nested = raw.manualDeductionsAmount;
  const useNested = nested !== undefined && nested !== null && nested !== '';
  const manualDeductionsAmount = Number(useNested ? nested : record.manualDeductionsAmount) || 0;
  return { manualDeductionsAmount };
}

function payrollRecordToPayslipShape(record) {
  const emp = record.employeeId || {};
  const toObj = (x) => (x && typeof x.toObject === 'function' ? x.toObject() : x);
  const empObj = toObj(emp);
  const rawAtt = record.attendance && typeof record.attendance.toObject === 'function' ? record.attendance.toObject() : (record.attendance || {});
  const ded = record.deductions && typeof record.deductions.toObject === 'function' ? record.deductions.toObject() : (record.deductions || {});
  const daysFromBreakdown = Number(ded?.attendanceDeductionBreakdown?.daysDeducted);
  const attendanceDeductionDays = Number.isFinite(daysFromBreakdown)
    ? daysFromBreakdown
    : (Number(rawAtt.attendanceDeductionDays) || 0);
  // Root elUsedInPayroll is canonical on PayrollRecord; nested attendance.elUsedInPayroll may be absent (strict schema).
  const elUsedInPayroll = Number(rawAtt.elUsedInPayroll ?? record.elUsedInPayroll) || 0;
  const arNorm = normalizeArrearsFromPayrollRecord(record);
  const mdNorm = normalizeManualDeductionsFromPayrollRecord(record);
  return {
    employee: {
      emp_no: record.emp_no || empObj?.emp_no || '',
      name: empObj?.employee_name || [empObj?.first_name, empObj?.last_name].filter(Boolean).join(' ') || 'N/A',
      designation: empObj?.designation_id?.name || empObj?.designation_id || '',
      department: empObj?.department_id?.name || empObj?.department_id || 'N/A',
      division: empObj?.division_id?.name || empObj?.division_id || 'N/A',
      location: empObj?.location || '',
      bank_account_no: empObj?.bank_account_no || '',
      bank_name: empObj?.bank_name || '',
      bank_place: empObj?.bank_place || '',
      ifsc_code: empObj?.ifsc_code || '',
      payment_mode: empObj?.salary_mode || '',
      salary_mode: empObj?.salary_mode || '',
      date_of_joining: empObj?.doj || '',
      pf_number: empObj?.pf_number || '',
      esi_number: empObj?.esi_number || '',
      leftDate: empObj?.leftDate,
      salaries:
        empObj?.salaries && typeof empObj.salaries === 'object' && !Array.isArray(empObj.salaries)
          ? { ...empObj.salaries }
          : {},
    },
    attendance: {
      ...rawAtt,
      elUsedInPayroll,
      attendanceDeductionDays,
    },
    elUsedInPayroll,
    attendanceDeductionDays,
    earnings: record.earnings && typeof record.earnings.toObject === 'function' ? record.earnings.toObject() : (record.earnings || {}),
    deductions: ded,
    loanAdvance: normalizeLoanAdvanceForPayslip(record.loanAdvance),
    arrears: { arrearsAmount: arNorm.arrearsAmount, arrearsSettlements: arNorm.arrearsSettlements },
    manualDeductions: { manualDeductionsAmount: mdNorm.manualDeductionsAmount },
    manualDeductionsAmount: mdNorm.manualDeductionsAmount,
    arrearsAmount: arNorm.arrearsAmount,
    netSalary: Number(record.netSalary) || 0,
    roundOff: Number(record.roundOff) || 0,
  };
}

function secondSalaryRecordToPayslipShape(record) {
  const emp = record.employeeId || {};
  const toObj = (x) => (x && typeof x.toObject === 'function' ? x.toObject() : x);
  const empObj = toObj(emp);
  const divName = record.division_id?.name || empObj?.division_id?.name || empObj?.division_id || 'N/A';
  const rawAtt = record.attendance && typeof record.attendance.toObject === 'function' ? record.attendance.toObject() : (record.attendance || {});
  const ded = record.deductions && typeof record.deductions.toObject === 'function' ? record.deductions.toObject() : (record.deductions || {});
  const daysFromBreakdown = Number(ded?.attendanceDeductionBreakdown?.daysDeducted);
  const attendanceDeductionDays = Number.isFinite(daysFromBreakdown)
    ? daysFromBreakdown
    : (Number(rawAtt.attendanceDeductionDays) || 0);
  const elUsedInPayroll = Number(rawAtt.elUsedInPayroll) || 0;
  return {
    employee: {
      emp_no: record.emp_no || empObj?.emp_no || '',
      name: empObj?.employee_name || [empObj?.first_name, empObj?.last_name].filter(Boolean).join(' ') || 'N/A',
      designation: empObj?.designation_id?.name || empObj?.designation_id || '',
      department: empObj?.department_id?.name || empObj?.department_id || 'N/A',
      division: divName,
      location: empObj?.location || '',
      bank_account_no: empObj?.bank_account_no || '',
      bank_name: empObj?.bank_name || '',
      bank_place: empObj?.bank_place || '',
      ifsc_code: empObj?.ifsc_code || '',
      payment_mode: empObj?.salary_mode || '',
      salary_mode: empObj?.salary_mode || '',
      date_of_joining: empObj?.doj || '',
      pf_number: empObj?.pf_number || '',
      esi_number: empObj?.esi_number || '',
      salaries:
        empObj?.salaries && typeof empObj.salaries === 'object' && !Array.isArray(empObj.salaries)
          ? { ...empObj.salaries }
          : {},
    },
    attendance: {
      ...rawAtt,
      elUsedInPayroll,
      attendanceDeductionDays,
    },
    elUsedInPayroll,
    attendanceDeductionDays,
    earnings: record.earnings && typeof record.earnings.toObject === 'function' ? record.earnings.toObject() : (record.earnings || {}),
    deductions: ded,
    loanAdvance: normalizeLoanAdvanceForPayslip(record.loanAdvance),
    arrears: { arrearsAmount: Number(record.arrearsAmount) || 0, arrearsSettlements: record.arrearsSettlements || [] },
    manualDeductions: { manualDeductionsAmount: Number(record.manualDeductionsAmount) || 0 },
    manualDeductionsAmount: Number(record.manualDeductionsAmount) || 0,
    arrearsAmount: Number(record.arrearsAmount) || 0,
    netSalary: Number(record.netSalary) || 0,
    roundOff: Number(record.roundOff) || 0,
  };
}

function emptyPayslipFromRegular(regPayslip) {
  return {
    employee: { ...(regPayslip.employee || {}) },
    attendance: {},
    earnings: {
      basicPay: 0,
      grossSalary: 0,
      totalAllowances: 0,
      allowances: [],
      otPay: 0,
      incentive: 0,
      perDayBasicPay: 0,
      earnedSalary: 0,
      payableAmount: 0,
    },
    deductions: {
      totalDeductions: 0,
      otherDeductions: [],
      statutoryDeductions: [],
      attendanceDeduction: 0,
      permissionDeduction: 0,
      leaveDeduction: 0,
    },
    loanAdvance: { totalEMI: 0, advanceDeduction: 0, remainingBalance: 0 },
    arrears: { arrearsAmount: 0 },
    manualDeductions: { manualDeductionsAmount: 0 },
    manualDeductionsAmount: 0,
    arrearsAmount: 0,
    netSalary: 0,
    roundOff: 0,
  };
}

function normalizeOutputColumns(rawColumns) {
  const raw = Array.isArray(rawColumns) ? rawColumns : [];
  return raw.map((c, i) => {
    const doc = c && typeof c.toObject === 'function' ? c.toObject() : (c && typeof c === 'object' ? { ...c } : {});
    return {
      header: doc.header != null && String(doc.header).trim() ? String(doc.header).trim() : `Column ${i}`,
      source: doc.source === 'formula' ? 'formula' : 'field',
      field: doc.field != null ? String(doc.field) : '',
      formula: doc.formula != null ? String(doc.formula) : '',
      order: typeof doc.order === 'number' ? doc.order : i,
    };
  });
}

function collectBreakdownSetsFromPayslips(payslips) {
  const allAllowanceNames = new Set();
  const allDeductionNames = new Set();
  const allStatutoryCodes = new Set();
  payslips.forEach((p) => {
    if (!p) return;
    (p.earnings?.allowances || []).forEach((a) => { if (a && a.name) allAllowanceNames.add(a.name); });
    (p.deductions?.otherDeductions || []).forEach((d) => { if (d && d.name) allDeductionNames.add(d.name); });
    (p.deductions?.statutoryDeductions || []).forEach((s) => {
      if (s && (s.code || s.name)) allStatutoryCodes.add(String(s.code || s.name).trim());
    });
  });
  return { allAllowanceNames, allDeductionNames, allStatutoryCodes };
}

function buildOutputColumnRows(payslipsReg, payslipsSecOrNull, outputColumnsNormalized, extraStatutoryCodes = []) {
  const paired = payslipsReg.map((p, i) => [p, payslipsSecOrNull[i] || null]);
  const allPayslips = [];
  paired.forEach(([a, b]) => {
    allPayslips.push(a);
    if (b) allPayslips.push(b);
  });
  const { allAllowanceNames, allDeductionNames, allStatutoryCodes } = collectBreakdownSetsFromPayslips(allPayslips);
  const statutoryMerged = new Set(allStatutoryCodes || []);
  for (const c of extraStatutoryCodes || []) {
    const s = String(c || '').trim();
    if (s) statutoryMerged.add(s);
  }
  const expandedColumns = outputColumnService.expandOutputColumnsWithBreakdown(
    outputColumnsNormalized,
    allAllowanceNames,
    allDeductionNames,
    statutoryMerged
  );
  const regularRows = payslipsReg.map((payslip, index) => {
    const rowData = outputColumnService.buildRowFromOutputColumns(payslip, expandedColumns, index + 1);
    return { 'S.No': index + 1, ...rowData };
  });
  let secondRows = payslipsReg.map((regSlip, index) => {
    const secSlip = payslipsSecOrNull[index] ? payslipsSecOrNull[index] : emptyPayslipFromRegular(regSlip);
    const rowData = outputColumnService.buildRowFromOutputColumns(secSlip, expandedColumns, index + 1);
    return { 'S.No': index + 1, ...rowData };
  });
  const payslipsForSecRefresh = payslipsReg.map((regSlip, index) =>
    payslipsSecOrNull[index] ? payslipsSecOrNull[index] : emptyPayslipFromRegular(regSlip)
  );
  secondRows = refreshEmployeeFieldColumnsOnRows(secondRows, payslipsForSecRefresh, outputColumnsNormalized);
  return { regularRows, secondRows, expandedColumns };
}

function resolveFixedAndMetricKeys(sampleRow) {
  const fixedKeys = DEFAULT_FIXED_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(sampleRow, k));
  const metricKeys = Object.keys(sampleRow).filter((k) => !fixedKeys.includes(k));
  return { fixedKeys, metricKeys };
}

function appendBankCandidatesSheet(wb, regularRows, secondRows, netDiffResolver, meta, secondSalaryEnabled) {
  const bankRows = buildBankCandidateRows(
    regularRows,
    secondRows,
    netDiffResolver,
    secondSalaryEnabled === true
  );
  const titleRows = meta
    ? [
        [meta.companyTitle || 'PAY SHEET'],
        [
          secondSalaryEnabled
            ? 'BANK CANDIDATES — SALARY MODE: BANK (with Regular / 2nd net & difference)'
            : 'BANK CANDIDATES — SALARY MODE: BANK',
        ],
        [meta.divisionLine || ''],
        [meta.payPeriodLine || ''],
        [meta.departmentsLine || ''],
        ...(meta.filterLines || []).map((line) => [line]),
        [],
      ]
    : [['BANK CANDIDATES'], []];

  const headers = [
    'S.No',
    'Employee Number',
    'Name',
    'Designation',
    'Division',
    'Department',
    'Bank',
    'A/c No',
    'IFSC code',
    REGULAR_NET_SALARY_HEADER,
  ];
  if (secondSalaryEnabled) {
    headers.push(SECOND_NET_SALARY_HEADER, DELTA_NET_HEADER);
  }
  const dataRows = bankRows.map((r) => headers.map((h) => r[h] ?? ''));
  const data = [...titleRows, headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const merges = [];
  const lastCol = Math.max(headers.length - 1, 0);
  for (let r = 0; r < titleRows.length; r += 1) {
    merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  }
  const colWidths = [
    { wch: 5 },
    { wch: 12 },
    { wch: 28 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    ...(secondSalaryEnabled ? [{ wch: 14 }, { wch: 16 }] : []),
  ];
  const headerRowIndex = titleRows.length;
  finalizeWorksheet(ws, merges, colWidths);
  applyPaysheetWorksheetStyles(ws, {
    colCount: headers.length,
    headerRowIndex,
    freezeAfterRow: headerRowIndex,
    variant: 'bank',
  });
  XLSX.utils.book_append_sheet(wb, ws, 'Bank candidates');
}

function toObjectIdIfValid(id) {
  if (id == null || id === '' || id === 'all') return null;
  const s = String(id);
  if (mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s) {
    return new mongoose.Types.ObjectId(s);
  }
  return null;
}

function formatMonthLabel(monthKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  if (!m) return String(monthKey || '');
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function uniqueSortedNames(values) {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

function rowEmpNo(row) {
  if (row?._exportEmpNo != null && String(row._exportEmpNo).trim()) {
    return String(row._exportEmpNo).trim();
  }
  const direct =
    row['Employee Number'] ??
    row['Employee Code'] ??
    row['Emp No'] ??
    row['EMP NO'] ??
    row['E.No'] ??
    row['E No'] ??
    row['Employee No'] ??
    row.emp_no;
  if (direct != null && String(direct).trim()) return String(direct).trim();
  for (const [k, v] of Object.entries(row || {})) {
    if (k === 'S.No' || k.startsWith('_') || v == null || v === '') continue;
    const norm = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      norm === 'employeenumber' ||
      norm === 'empno' ||
      norm === 'employeecode' ||
      norm === 'eno' ||
      norm === 'staffno' ||
      norm === 'staffnumber'
    ) {
      return String(v).trim();
    }
  }
  return '';
}

function isOrgColumnKey(key) {
  const k = String(key || '').trim();
  if (!k || k.startsWith('_')) return true;
  const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm === 'division' || norm === 'department' || norm === 'div' || norm === 'dept';
}

function pickOrgFieldFromRow(row, kind) {
  if (!row || typeof row !== 'object') return '';
  if (kind === 'division') {
    if (row._exportDivision) return String(row._exportDivision).trim();
    if (row.Division != null && String(row.Division).trim()) return String(row.Division).trim();
    if (row.division != null && String(row.division).trim()) return String(row.division).trim();
  } else {
    if (row._exportDepartment) return String(row._exportDepartment).trim();
    if (row.Department != null && String(row.Department).trim()) return String(row.Department).trim();
    if (row.department != null && String(row.department).trim()) return String(row.department).trim();
  }
  for (const [k, v] of Object.entries(row)) {
    if (k === 'S.No' || k.startsWith('_') || v == null || v === '') continue;
    if (kind === 'division' && /\bdivision\b/i.test(k)) return String(v).trim();
    if (kind === 'department' && /\bdepartment\b/i.test(k)) return String(v).trim();
  }
  return '';
}

function rowDivisionName(row) {
  return pickOrgFieldFromRow(row, 'division') || 'N/A';
}

function rowDepartmentName(row) {
  return pickOrgFieldFromRow(row, 'department') || 'N/A';
}

function orgFromPayrollRecord(record) {
  const emp = record?.employeeId || {};
  const div =
    (emp.division_id && typeof emp.division_id === 'object' ? emp.division_id.name : null) ||
    record?.division_id?.name ||
    '';
  const dept =
    (emp.department_id && typeof emp.department_id === 'object' ? emp.department_id.name : null) ||
    '';
  return {
    division: String(div || 'N/A').trim() || 'N/A',
    department: String(dept || 'N/A').trim() || 'N/A',
  };
}

function bankMetaFromPayrollRecord(record) {
  const emp = record?.employeeId || {};
  return {
    salaryMode: String(emp.salary_mode || '').trim(),
    bankName: String(emp.bank_name || '').trim(),
    bankAccountNo: String(emp.bank_account_no || '').trim(),
    ifscCode: String(emp.ifsc_code || '').trim(),
  };
}

/** Attach division/department + bank fields from employee record for grouping and bank sheet. */
function enrichExportRowsWithOrg(payrollRecords, regularRows, secondRows) {
  const attach = (row, index) => {
    const rec = payrollRecords[index];
    if (!rec) return row;
    const { division, department } = orgFromPayrollRecord(rec);
    const bank = bankMetaFromPayrollRecord(rec);
    const emp = rec.employeeId || {};
    return {
      ...row,
      _exportEmpNo: String(rec.emp_no || emp.emp_no || '').trim(),
      _exportDivision: division,
      _exportDepartment: department,
      _exportSalaryMode: bank.salaryMode,
      _exportBankName: bank.bankName,
      _exportBankAccountNo: bank.bankAccountNo,
      _exportIfscCode: bank.ifscCode,
    };
  };
  return {
    regularRows: (regularRows || []).map(attach),
    secondRows: (secondRows || []).map(attach),
  };
}

function isBankSalaryMode(row) {
  const mode = String(
    row._exportSalaryMode ?? row['Payment Mode'] ?? row['Salary Mode'] ?? row['salary_mode'] ?? ''
  )
    .trim()
    .toLowerCase();
  return mode === 'bank';
}

function pickRowName(row) {
  return String(row.Name ?? row['Employee Name'] ?? row.name ?? '').trim();
}

function pickRowDesignation(row) {
  return String(row.Designation ?? row.designation ?? '').trim();
}

function pickRowBankName(row) {
  return String(row._exportBankName ?? row['Bank Name'] ?? row.Bank ?? '').trim();
}

function pickRowBankAccount(row) {
  return String(row._exportBankAccountNo ?? row['Bank Account No'] ?? row['A/c No'] ?? row['Account No'] ?? '').trim();
}

function pickRowIfsc(row) {
  return String(row._exportIfscCode ?? row['IFSC Code'] ?? row['IFSC code'] ?? row.IFSC ?? '').trim();
}

const REGULAR_NET_SALARY_HEADER = 'Regular Net Salary';
const SECOND_NET_SALARY_HEADER = '2nd Net Salary';
const DELTA_NET_HEADER = 'Δ Net (2nd − Regular)';

function netSalaryFromRow(row) {
  if (!row || typeof row !== 'object') return 0;
  for (const k of Object.keys(row)) {
    if (k.startsWith('_')) continue;
    const norm = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm === 'netsalary' || norm === 'finalsalary') {
      const n = Number(row[k]);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

/** Add 2nd net + difference columns at end of each regular row (Regular sheet only). */
function appendSecondSalaryComparisonColumns(regularRows, secondRows, netDiffResolver) {
  return (regularRows || []).map((reg, i) => {
    const sec = secondRows[i] || {};
    const nReg = netSalaryFromRow(reg);
    const nSec = netSalaryFromRow(sec);
    const diffFn = netDiffResolver || netDiffFromRowsDefault;
    const delta = typeof diffFn === 'function' ? diffFn(reg, sec, i) : nSec - nReg;
    return {
      ...reg,
      [SECOND_NET_SALARY_HEADER]: nSec,
      [DELTA_NET_HEADER]: delta,
    };
  });
}

function findRowIndexByEmpNo(rows, empNo) {
  const code = String(empNo || '').trim();
  if (!code) return -1;
  return (rows || []).findIndex((r) => rowEmpNo(r) === code);
}

function buildBankCandidateRows(regularRows, secondRows, netDiffResolver, secondSalaryEnabled) {
  const bankRegular = sortRowsByEmpNo((regularRows || []).filter(isBankSalaryMode));
  return bankRegular.map((reg, idx) => {
    const empNo = rowEmpNo(reg);
    const regIdx = findRowIndexByEmpNo(regularRows, empNo);
    const sec =
      regIdx >= 0 && Array.isArray(secondRows) && secondRows[regIdx]
        ? secondRows[regIdx]
        : (secondRows || []).find((r) => rowEmpNo(r) === empNo) || {};
    const nReg = netSalaryFromRow(reg);
    const nSec = netSalaryFromRow(sec);
    const diffFn = netDiffResolver || netDiffFromRowsDefault;
    const delta =
      typeof diffFn === 'function' ? diffFn(reg, sec, regIdx >= 0 ? regIdx : idx) : nSec - nReg;

    const row = {
      'S.No': idx + 1,
      'Employee Number': empNo,
      Name: pickRowName(reg),
      Designation: pickRowDesignation(reg),
      Division: rowDivisionName(reg),
      Department: rowDepartmentName(reg),
      Bank: pickRowBankName(reg),
      'A/c No': pickRowBankAccount(reg),
      'IFSC code': pickRowIfsc(reg),
      [REGULAR_NET_SALARY_HEADER]: nReg,
    };
    if (secondSalaryEnabled) {
      row[SECOND_NET_SALARY_HEADER] = nSec;
      row[DELTA_NET_HEADER] = delta;
    }
    return row;
  });
}

function sortRowsByEmpNo(rows) {
  return [...rows].sort((a, b) => compareEmpNo(rowEmpNo(a), rowEmpNo(b)));
}

/**
 * Build export header context from filters, scope, and exported rows.
 * @param {Object} p
 * @param {string} p.month - YYYY-MM
 * @param {string|undefined} p.divisionId
 * @param {string|undefined} p.departmentId
 * @param {string|undefined} p.designationId
 * @param {string|undefined} p.employeeGroupId
 * @param {string|undefined} p.status
 * @param {string|undefined} p.search
 * @param {Object|null} p.scopeFilter
 * @param {Record<string, unknown>[]} p.regularRows
 */
async function resolvePaysheetExportMeta({
  month,
  divisionId,
  departmentId,
  designationId,
  employeeGroupId,
  status,
  search,
  scopeFilter,
  regularRows,
}) {
  const profile = await getCompanyProfile();
  const companyTitle =
    String(profile.documents?.reportHeaderLine || '').trim() ||
    String(profile.displayName || '').trim() ||
    String(profile.legalName || '').trim() ||
    'PAY SHEET';

  const [y, mo] = month.split('-').map(Number);
  const { startDate, endDate } = await getPayrollDateRange(y, mo);
  const payPeriodLine = `Pay period: ${formatMonthLabel(month)} (${formatPayrollPeriodRangeEnIn(startDate, endDate)})`;

  const Division = require('../../departments/model/Division');
  const Department = require('../../departments/model/Department');
  const Designation = require('../../departments/model/Designation');
  const EmployeeGroup = require('../../employees/model/EmployeeGroup');

  const divFromRows = uniqueSortedNames((regularRows || []).map(rowDivisionName));
  const deptFromRows = uniqueSortedNames((regularRows || []).map(rowDepartmentName));

  let divisionLine;
  const divOid = toObjectIdIfValid(divisionId);
  if (divOid) {
    const div = await Division.findById(divOid).select('name').lean();
    divisionLine = `Division: ${div?.name || 'Selected division'}`;
  } else if (divFromRows.length === 1) {
    divisionLine = `Division: ${divFromRows[0]}`;
  } else if (divFromRows.length > 1) {
    divisionLine = `Divisions (${divFromRows.length}): ${divFromRows.join(', ')}`;
  } else {
    divisionLine = 'Division: All divisions in your access scope';
  }

  let departmentsLine;
  const depOid = toObjectIdIfValid(departmentId);
  if (depOid) {
    const dep = await Department.findById(depOid).select('name').lean();
    departmentsLine = `Department: ${dep?.name || 'Selected department'}`;
  } else {
    let scopedDeptNames = deptFromRows;
    if (!scopedDeptNames.length) {
      const deptQuery = { isActive: { $ne: false } };
      if (divOid) deptQuery.divisions = divOid;
      const scopeDeptIds = extractScopedDepartmentIds(scopeFilter);
      if (scopeDeptIds && scopeDeptIds.length > 0) {
        deptQuery._id = { $in: scopeDeptIds.map((id) => toObjectIdIfValid(id)).filter(Boolean) };
      }
      const deps = await Department.find(deptQuery).select('name').sort({ name: 1 }).lean();
      scopedDeptNames = deps.map((d) => d.name).filter(Boolean);
    }
    if (divOid && scopedDeptNames.length > 0) {
      const div = await Division.findById(divOid).select('name').lean();
      const divLabel = div?.name || 'selected division';
      departmentsLine = `Departments in ${divLabel}: ${scopedDeptNames.join(', ')}`;
    } else if (scopedDeptNames.length === 1) {
      departmentsLine = `Department: ${scopedDeptNames[0]}`;
    } else if (scopedDeptNames.length > 1) {
      departmentsLine = `Departments (${scopedDeptNames.length}): ${scopedDeptNames.join(', ')}`;
    } else {
      departmentsLine = 'Departments: All departments in your access scope';
    }
  }

  const filterLines = [];
  const desOid = toObjectIdIfValid(designationId);
  if (desOid) {
    const des = await Designation.findById(desOid).select('name').lean();
    filterLines.push(`Designation: ${des?.name || 'Selected designation'}`);
  }
  const grpOid = toObjectIdIfValid(employeeGroupId);
  if (grpOid) {
    try {
      const grp = await EmployeeGroup.findById(grpOid).select('name').lean();
      filterLines.push(`Employee group: ${grp?.name || 'Selected group'}`);
    } catch {
      filterLines.push('Employee group: Selected group');
    }
  }
  if (status === 'active') filterLines.push('Employment status: Active only');
  if (status === 'inactive') filterLines.push('Employment status: Inactive only');
  if (search && String(search).trim()) filterLines.push(`Search: "${String(search).trim()}"`);

  return {
    companyTitle: companyTitle.toUpperCase(),
    payPeriodLine,
    divisionLine,
    departmentsLine,
    filterLines,
  };
}

/** Pull department ObjectIds from req.scopeFilter when present. */
function extractScopedDepartmentIds(scopeFilter) {
  if (!scopeFilter || typeof scopeFilter !== 'object') return null;
  const ids = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.department_id) {
      const v = node.department_id;
      if (v && typeof v === 'object' && Array.isArray(v.$in)) v.$in.forEach((id) => ids.add(String(id)));
      else if (v) ids.add(String(v));
    }
    if (node.$or) walk(node.$or);
    if (node.$and) walk(node.$and);
  };
  walk(scopeFilter);
  return ids.size ? [...ids] : null;
}

function objectRowsToTable(rows, options = {}) {
  const hideOrgColumns = options.hideOrgColumns === true;
  if (!Array.isArray(rows) || rows.length === 0) {
    return { headers: ['S.No'], dataRows: [] };
  }
  const keySet = new Set();
  rows.forEach((r) =>
    Object.keys(r || {}).forEach((k) => {
      if (k.startsWith('_')) return;
      if (hideOrgColumns && isOrgColumnKey(k)) return;
      keySet.add(k);
    })
  );
  const rest = [...keySet].filter((k) => k !== 'S.No');
  const headers = keySet.has('S.No') ? ['S.No', ...rest] : [...rest];
  const dataRows = rows.map((r) => headers.map((h) => (r[h] != null ? r[h] : '')));
  return { headers, dataRows };
}

function renumberSerial(rows) {
  return rows.map((row, i) => ({ ...row, 'S.No': i + 1 }));
}

/**
 * @param {PaysheetExportMeta} meta
 * @param {string} salaryKindLabel - e.g. "REGULAR SALARY" / "2ND SALARY"
 */
function buildTitleBlockRows(meta, salaryKindLabel) {
  /** @type {(string|number)[][]} */
  const block = [[meta.companyTitle]];
  if (salaryKindLabel) block.push([salaryKindLabel]);
  block.push([meta.divisionLine], [meta.payPeriodLine], [meta.departmentsLine]);
  for (const line of meta.filterLines || []) block.push([line]);
  block.push([]);
  return block;
}

function buildCombinedSheetAoa(rows, meta, salaryKindLabel) {
  const numbered = renumberSerial(rows);
  const { headers, dataRows } = objectRowsToTable(numbered);
  const titleBlock = buildTitleBlockRows(meta, salaryKindLabel);
  const tableHeader = [headers];
  const aoa = [...titleBlock, ...tableHeader, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const merges = [];
  const lastCol = Math.max(headers.length - 1, 0);
  for (let r = 0; r < titleBlock.length; r += 1) {
    merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  }
  const colWidths = [{ wch: 6 }];
  for (let c = 1; c < headers.length; c += 1) colWidths.push({ wch: 14 });
  const headerRowIndex = titleBlock.length;
  finalizeWorksheet(ws, merges, colWidths);
  applyPaysheetWorksheetStyles(ws, {
    colCount: headers.length,
    headerRowIndex,
    freezeAfterRow: headerRowIndex,
    variant: 'paysheet',
  });
  return ws;
}

function groupRowsByDivisionDepartment(rows) {
  const divMap = new Map();
  for (const row of rows) {
    const div = rowDivisionName(row);
    const dept = rowDepartmentName(row);
    if (!divMap.has(div)) divMap.set(div, new Map());
    const deptMap = divMap.get(div);
    if (!deptMap.has(dept)) deptMap.set(dept, []);
    deptMap.get(dept).push(row);
  }
  const divisions = [...divMap.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return divisions.map((division) => {
    const deptMap = divMap.get(division);
    const departments = [...deptMap.keys()]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((department) => ({
        department,
        rows: sortRowsByEmpNo(deptMap.get(department) || []),
      }));
    return { division, departments };
  });
}

function pushMergedBannerRow(aoa, merges, text, colCount) {
  const r = aoa.length;
  aoa.push([text]);
  if (colCount > 1) {
    merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  }
}

function buildByDepartmentSheetAoa(rows, meta, salaryKindLabel) {
  const groups = groupRowsByDivisionDepartment(rows);
  const sample = rows[0]
    ? objectRowsToTable(renumberSerial([rows[0]]), { hideOrgColumns: true })
    : { headers: ['S.No'], dataRows: [] };
  let colCount = Math.max(sample.headers.length, 1);
  const merges = [];

  /** @type {(string|number)[][]} */
  const aoa = [];
  pushMergedBannerRow(aoa, merges, meta.companyTitle, colCount);
  if (salaryKindLabel) pushMergedBannerRow(aoa, merges, salaryKindLabel, colCount);
  pushMergedBannerRow(aoa, merges, meta.divisionLine, colCount);
  pushMergedBannerRow(aoa, merges, meta.payPeriodLine, colCount);
  pushMergedBannerRow(aoa, merges, meta.departmentsLine, colCount);
  for (const line of meta.filterLines || []) pushMergedBannerRow(aoa, merges, line, colCount);
  const titleEndRow = aoa.length;
  aoa.push([]);

  const colHeaderRows = [];

  if (!groups.length) {
    pushMergedBannerRow(aoa, merges, 'No employees in export scope.', colCount);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const colWidths = [{ wch: 8 }, ...Array(Math.max(colCount - 1, 0)).fill({ wch: 14 })];
    finalizeWorksheet(ws, merges, colWidths);
    applyPaysheetWorksheetStyles(ws, { colCount, freezeAfterRow: titleEndRow, variant: 'paysheet' });
    return ws;
  }

  for (const { division, departments } of groups) {
    pushMergedBannerRow(aoa, merges, `DIVISION: ${division}`, colCount);
    for (const { department, rows: deptRows } of departments) {
      pushMergedBannerRow(aoa, merges, `DEPARTMENT: ${department}`, colCount);
      const numbered = deptRows.map((row, idx) => ({ ...row, 'S.No': idx + 1 }));
      const { headers, dataRows } = objectRowsToTable(numbered, { hideOrgColumns: true });
      colCount = Math.max(colCount, headers.length);
      colHeaderRows.push(aoa.length);
      aoa.push(headers);
      dataRows.forEach((dr) => aoa.push(dr));
      aoa.push([]);
    }
    aoa.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const lastCol = Math.max(colCount - 1, 0);
  for (const m of merges) {
    if (m.e.c > lastCol) m.e.c = lastCol;
  }
  const colWidths = [{ wch: 6 }];
  for (let c = 1; c < colCount; c += 1) colWidths.push({ wch: 14 });
  finalizeWorksheet(ws, merges, colWidths);
  applyPaysheetWorksheetStyles(ws, {
    colCount,
    colHeaderRows,
    freezeAfterRow: titleEndRow,
    variant: 'paysheet',
  });
  return ws;
}

/**
 * @param {Record<string, unknown>[]} regularRows
 * @param {Record<string, unknown>[]} secondRows
 * @param {Function} netDiffResolver
 * @param {{ format?: PaysheetBundleExportFormat, exportMeta?: PaysheetExportMeta, secondSalaryEnabled?: boolean }} [options]
 */
function writeBundleBuffer(regularRows, secondRows, netDiffResolver, options = {}) {
  const format = options.format === 'by_department' ? 'by_department' : 'combined';
  const meta = options.exportMeta || {
    companyTitle: 'PAY SHEET',
    payPeriodLine: '',
    divisionLine: '',
    departmentsLine: '',
    filterLines: [],
  };
  const secondSalaryEnabled = options.secondSalaryEnabled === true;

  const regularForMainSheet = secondSalaryEnabled
    ? appendSecondSalaryComparisonColumns(regularRows, secondRows, netDiffResolver)
    : regularRows;

  const wb = XLSX.utils.book_new();

  if (format === 'by_department') {
    XLSX.utils.book_append_sheet(
      wb,
      buildByDepartmentSheetAoa(regularForMainSheet, meta, 'REGULAR SALARY'),
      'Regular'
    );
    if (secondSalaryEnabled) {
      XLSX.utils.book_append_sheet(
        wb,
        buildByDepartmentSheetAoa(secondRows, meta, '2ND SALARY'),
        '2nd salary'
      );
    }
  } else {
    XLSX.utils.book_append_sheet(
      wb,
      buildCombinedSheetAoa(regularForMainSheet, meta, 'REGULAR SALARY'),
      'Regular'
    );
    if (secondSalaryEnabled) {
      XLSX.utils.book_append_sheet(
        wb,
        buildCombinedSheetAoa(secondRows, meta, '2ND SALARY'),
        '2nd salary'
      );
    }
  }

  appendBankCandidatesSheet(wb, regularRows, secondRows, netDiffResolver, meta, secondSalaryEnabled);
  return writeStyledWorkbook(wb);
}

function netDiffFromRowsDefault(reg, sec) {
  const nReg = Number(reg['NET SALARY'] ?? reg['FINAL SALARY'] ?? 0);
  const nSec = Number(sec['NET SALARY'] ?? sec['FINAL SALARY'] ?? 0);
  return nSec - nReg;
}

/** PF / ESI / PT codes for paysheet column expansion when saved records have no statutory breakdown yet */
async function getStatutoryCodesForPaysheetExpansion() {
  try {
    const StatutoryDeductionConfig = require('../model/StatutoryDeductionConfig');
    const st = await StatutoryDeductionConfig.get();
    const codes = [];
    if (st?.pf?.enabled) codes.push('PF');
    if (st?.esi?.enabled) codes.push('ESI');
    if (st?.professionTax?.enabled) codes.push('PT');
    return codes.length ? codes : ['PF', 'ESI', 'PT'];
  } catch {
    return ['PF', 'ESI', 'PT'];
  }
}

/**
 * Second-salary paysheet / Excel rows aligned with Payroll Configuration outputColumns (same as regular paysheet).
 * @param {Object[]} records - SecondSalaryRecord lean docs with employeeId populated
 * @param {Object[]} outputColumnsNormalized - from normalizeOutputColumns(config.outputColumns)
 * @returns {{ headers: string[], rows: Record<string, unknown>[] }}
 */
/**
 * Re-apply employee.* output columns from live payslip (bank, mode, name, etc.).
 * Fixes blank bank fields when rows come from frozen snapshots or partial employee populate.
 */
function refreshEmployeeFieldColumnsOnRows(rows, payslips, outputColumnsNormalized) {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(outputColumnsNormalized)) return rows || [];
  const employeeCols = outputColumnsNormalized.filter((c) => {
    const field = String(c?.field || '').trim();
    return c?.source !== 'formula' && field.startsWith('employee.');
  });
  if (!employeeCols.length) return rows;

  return rows.map((row, i) => {
    const payslip = payslips[i];
    if (!payslip) return row;
    const next = { ...(row || {}) };
    for (const col of employeeCols) {
      const header = col.header != null && String(col.header).trim() ? String(col.header).trim() : null;
      if (!header) continue;
      next[header] = outputColumnService.getValueByPath(payslip, col.field);
    }
    return next;
  });
}

/**
 * Load frozen regular paysheet rows from PayrollPayslipSnapshot when complete for all employees
 * (same rule as GET /paysheet — skips when paysheet adjustments are pending/approved).
 * @returns {Promise<Record<string, unknown>[]|null>}
 */
async function tryBuildRegularRowsFromSnapshots(payrollRecords, month, outputColumnsNormalized) {
  if (!Array.isArray(payrollRecords) || payrollRecords.length === 0) return null;
  try {
    const PaysheetAdjustmentRequest = require('../model/PaysheetAdjustmentRequest');
    const PayrollPayslipSnapshot = require('../model/PayrollPayslipSnapshot');
    const paysheetAdjustmentsActive = await PaysheetAdjustmentRequest.exists({
      month,
      status: { $in: ['pending', 'approved'] },
    });
    if (paysheetAdjustmentsActive) return null;

    const orderedEmpIds = payrollRecords
      .map((r) => (r.employeeId?._id || r.employeeId)?.toString())
      .filter(Boolean);
    if (!orderedEmpIds.length) return null;

    const snaps = await PayrollPayslipSnapshot.find({
      month,
      kind: 'regular',
      employeeId: { $in: orderedEmpIds },
    }).lean();
    const snapMap = new Map(snaps.map((s) => [String(s.employeeId), s]));
    const allPresent = orderedEmpIds.every((id) => snapMap.has(String(id)));
    if (!allPresent) return null;

    const payslips = payrollRecords.map((r) => payrollRecordToPayslipShape(r));
    let rows = payrollRecords.map((r, index) => {
      const id = String(r.employeeId?._id || r.employeeId);
      return { 'S.No': index + 1, ...(snapMap.get(id)?.row || {}) };
    });
    rows = refreshEmployeeFieldColumnsOnRows(rows, payslips, outputColumnsNormalized);
    return rows;
  } catch (e) {
    console.warn('[paysheetBundleExport] snapshot read failed:', e.message);
    return null;
  }
}

/**
 * Fill loanAdvance.remainingBalance on payslip shapes when absent on PayrollRecord
 * (older records calculated before the field was persisted).
 */
async function enrichPayslipsLoanRemainingBalance(payslips, payrollRecords) {
  if (!Array.isArray(payslips) || !Array.isArray(payrollRecords) || payslips.length === 0) return;

  const missingEmpIds = [];
  payslips.forEach((p, i) => {
    const record = payrollRecords[i];
    const raw = record?.loanAdvance?.remainingBalance;
    if (raw !== undefined && raw !== null && raw !== '') {
      if (!p.loanAdvance) p.loanAdvance = {};
      p.loanAdvance.remainingBalance = Number(raw) || 0;
      return;
    }
    const empId = String(record?.employeeId?._id || record?.employeeId || '');
    if (empId) missingEmpIds.push(empId);
  });
  if (!missingEmpIds.length) return;

  const loanAdvanceService = require('../services/loanAdvanceService');
  const balanceMap = await loanAdvanceService.fetchLoanRemainingBalanceByEmployeeIds(missingEmpIds);

  payslips.forEach((p, i) => {
    const record = payrollRecords[i];
    const raw = record?.loanAdvance?.remainingBalance;
    if (raw !== undefined && raw !== null && raw !== '') return;
    const empId = String(record?.employeeId?._id || record?.employeeId || '');
    if (!empId) return;
    if (!p.loanAdvance) p.loanAdvance = {};
    p.loanAdvance.remainingBalance = balanceMap.get(empId) ?? 0;
  });
}

function buildSecondSalaryPaysheetFromOutputColumns(records, outputColumnsNormalized, extraStatutoryCodes = []) {
  if (!Array.isArray(records) || records.length === 0 || !outputColumnsNormalized.length) {
    return { headers: [], rows: [] };
  }
  const payslips = records.map(secondSalaryRecordToPayslipShape);
  const { allAllowanceNames, allDeductionNames, allStatutoryCodes } = collectBreakdownSetsFromPayslips(payslips);
  const statutoryMerged = new Set(allStatutoryCodes || []);
  for (const c of extraStatutoryCodes || []) {
    const s = String(c || '').trim();
    if (s) statutoryMerged.add(s);
  }
  const expandedColumns = outputColumnService.expandOutputColumnsWithBreakdown(
    outputColumnsNormalized,
    allAllowanceNames,
    allDeductionNames,
    statutoryMerged
  );
  let rows = payslips.map((payslip, index) => {
    const rowData = outputColumnService.buildRowFromOutputColumns(payslip, expandedColumns, index + 1);
    return { 'S.No': index + 1, ...rowData };
  });
  rows = refreshEmployeeFieldColumnsOnRows(rows, payslips, outputColumnsNormalized);
  const headers =
    rows.length > 0
      ? ['S.No', ...Object.keys(rows[0]).filter((k) => k !== 'S.No')]
      : ['S.No', ...expandedColumns.map((c) => c.header || 'Column')];
  return { headers, rows };
}

module.exports = {
  payrollRecordToPayslipShape,
  secondSalaryRecordToPayslipShape,
  emptyPayslipFromRegular,
  normalizeOutputColumns,
  buildOutputColumnRows,
  buildSecondSalaryPaysheetFromOutputColumns,
  getStatutoryCodesForPaysheetExpansion,
  writeBundleBuffer,
  resolvePaysheetExportMeta,
  enrichExportRowsWithOrg,
  refreshEmployeeFieldColumnsOnRows,
  tryBuildRegularRowsFromSnapshots,
  enrichPayslipsLoanRemainingBalance,
  netDiffFromRowsDefault,
};
