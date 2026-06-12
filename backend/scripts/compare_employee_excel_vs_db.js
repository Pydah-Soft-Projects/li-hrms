/**
 * Compare employee records in an Excel file vs MongoDB (matched by emp_no).
 *
 * Usage (from repo root):
 *   node backend/scripts/compare_employee_excel_vs_db.js --file path/to/employees.xlsx
 *
 * Optional:
 *   --out path/to/report.xlsx     Custom output path (default: backend/scripts/employee_db_vs_excel_diff_<timestamp>.xlsx)
 *   --sheet "Sheet1"              Excel sheet name (default: first sheet)
 * Excel columns supported (your register layout):
 *   S.No (skipped) | Emp.No. | UAN | ESI | Employee Name | DOB | GENDER | MARRITAL STATUS |
 *   BLOOD GROUP | Doj | Qualification | Division | Type | Designation | Department |
 *   Total Salary | Loan Due | Loan Recovery | Net Loan | Bank A/c | Name of the Bank |
 *   IFSC | Place | Date of Exit | Date of Retirement | Mobile Number | Aadhar Number
 *
 * Env: MONGODB_URI or MONGO_URI (see backend/.env)
 */

/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

require('../departments/model/Division');
require('../departments/model/Department');
require('../departments/model/Designation');

const Employee = require('../employees/model/Employee');
const Loan = require('../loans/model/Loan');

/** Normalized headers to skip (e.g. S.No) */
const IGNORED_HEADERS = new Set(['sno', 'sn', 'slno', 'serial no', 'serial number']);

/**
 * Canonical field id -> Excel header aliases (matched after normalizeHeader).
 * Includes the payroll/register layout:
 * S.No | Emp.No. | UAN | ESI | Employee Name | DOB | GENDER | MARRITAL STATUS | ...
 */
const HEADER_ALIASES = {
  emp_no: ['emp_no', 'employee_no', 'emp no', 'employee number', 'employee no', 'empno'],
  uan_number: ['uan_number', 'uan', 'uan no', 'pf uan'],
  esi_number: ['esi_number', 'esi no', 'esi number', 'esi no.', 'esi'],
  employee_name: ['employee_name', 'name', 'employee name', 'name of the employee'],
  dob: ['dob', 'date of birth', 'birth date', 'date of birth1'],
  gender: ['gender', 'sex'],
  marital_status: ['marital_status', 'marital status', 'marrital status'],
  blood_group: ['blood_group', 'blood group'],
  doj: ['doj', 'date of joining', 'joining date', 'date of joining1'],
  qualifications: ['qualifications', 'qualification'],
  division_name: ['division_name', 'division'],
  employee_type: ['employee_type', 'type', 'employee type', 'emp type'],
  designation_name: ['designation_name', 'designation'],
  department_name: ['department_name', 'department'],
  gross_salary: ['proposedsalary', 'proposed_salary', 'gross salary', 'gross_salary', 'salary', 'total salary'],
  loan_due: ['loan_due', 'loan due'],
  loan_recovery: ['loan_recovery', 'loan recovery'],
  net_loan: ['net_loan', 'net loan'],
  bank_account_no: ['bank_account_no', 'account no', 'bank account no', 'bank account number', 'bank ac', 'bank a/c'],
  bank_name: ['bank_name', 'bank name', 'name of the bank'],
  ifsc_code: ['ifsc_code', 'ifsc code', 'ifsc'],
  bank_place: ['bank_place', 'bank place', 'place'],
  left_date: ['leftdate', 'left date', 'left_date', 'date of leaving', 'date of exit'],
  retirement_date: ['retirement_date', 'date of retirement', 'retirement date'],
  phone_number: ['phone_number', 'phone no', 'mobile', 'mobile number'],
  aadhar_number: ['aadhar_number', 'aadhar no', 'adhaar number', 'aadhar', 'aadhar number'],
  // Other bulk-upload / HRMS columns (optional in file)
  group_name: ['group_name', 'group', 'employee group', 'employee_group', 'employee_group_name'],
  experience: ['experience'],
  address: ['address'],
  location: ['location'],
  alt_phone_number: ['alt_phone_number', 'alt phone', 'alternate phone', 'alternate mobile'],
  email: ['email', 'email id', 'email_id'],
  pf_number: ['pf_number', 'pf no', 'pf number', 'pf no.'],
  salary_mode: ['salary_mode', 'salary mode'],
  is_active: ['is_active', 'active', 'status active'],
  second_salary: ['second_salary', 'second salary'],
};

const NUMERIC_FIELDS = new Set([
  'gross_salary',
  'experience',
  'second_salary',
  'loan_due',
  'loan_recovery',
  'net_loan',
]);

const DATE_FIELDS = new Set(['doj', 'dob', 'left_date', 'retirement_date']);

const ID_NUMBER_FIELDS = new Set([
  'uan_number',
  'esi_number',
  'aadhar_number',
  'pf_number',
  'phone_number',
  'alt_phone_number',
  'bank_account_no',
]);

/** Active disbursed loans only — used for Loan Due / Recovery / Net Loan columns */
const OPEN_LOAN_STATUSES = ['disbursed', 'active'];

const STANDARD_COMPARE_FIELDS = Object.keys(HEADER_ALIASES).filter((f) => f !== 'emp_no');

function parseArgs(argv) {
  const out = { file: '', outPath: '', sheet: '', allFields: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--file' && argv[i + 1]) {
      out.file = argv[i + 1];
      i += 1;
    } else if (a === '--out' && argv[i + 1]) {
      out.outPath = argv[i + 1];
      i += 1;
    } else if (a === '--sheet' && argv[i + 1]) {
      out.sheet = argv[i + 1];
      i += 1;
    } else if (a === '--all-fields') {
      out.allFields = true;
    }
  }
  return out;
}

function normalizeHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function buildHeaderLookup(headers) {
  const aliasToField = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      aliasToField[normalizeHeader(alias)] = field;
    }
  }

  const columnMap = {};
  const unmapped = [];
  headers.forEach((header, index) => {
    const norm = normalizeHeader(header);
    if (!norm || IGNORED_HEADERS.has(norm)) return;
    const field = aliasToField[norm];
    if (field) {
      // First mapped header wins if duplicates exist
      if (!columnMap[field]) {
        columnMap[field] = { index, originalHeader: header };
      }
    } else {
      unmapped.push(header);
    }
  });
  return { columnMap, unmapped };
}

function pickFirstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function dynamicField(employee, keys) {
  const df = employee.dynamicFields || {};
  for (const key of keys) {
    const v = df[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function normalizeGender(value) {
  const s = normalizeString(value).toUpperCase();
  if (!s) return '';
  if (['M', 'MALE'].includes(s)) return 'Male';
  if (['F', 'FEMALE'].includes(s)) return 'Female';
  if (s === 'OTHER') return 'Other';
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function normalizeIdNumber(value) {
  if (value == null || value === '') return '';
  return String(value).replace(/\s+/g, '').trim();
}

function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  const utcDays = Math.floor(serial - 25569);
  const ms = utcDays * 86400 * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseMaybeDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') return excelSerialToDate(value);
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const d = parseMaybeDate(value);
  if (!d) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function collapseSpaces(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

function normalizeString(value) {
  if (value == null || value === '') return '';
  return collapseSpaces(String(value));
}

function normalizeEmail(value) {
  const s = normalizeString(value).toLowerCase();
  return s;
}

function normalizeEmpNo(value) {
  return normalizeString(value).toUpperCase();
}

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[,₹\s]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function numbersEqual(a, b) {
  const na = normalizeNumber(a);
  const nb = normalizeNumber(b);
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  return Math.abs(na - nb) < 0.005;
}

function normalizeBool(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const s = normalizeString(value).toLowerCase();
  if (['yes', 'y', 'true', '1', 'active'].includes(s)) return 'yes';
  if (['no', 'n', 'false', '0', 'inactive'].includes(s)) return 'no';
  return s;
}

function normalizeQualifications(value) {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) {
    return value
      .map((q) => {
        if (typeof q === 'string') return q.trim();
        if (q && typeof q === 'object') {
          const degree = q.degree || q.name || '';
          const year = q.qualified_year || q.year || '';
          return year ? `${degree} (${year})` : String(degree);
        }
        return '';
      })
      .filter(Boolean)
      .join('; ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return normalizeString(value);
}

function normalizeFieldValue(field, value) {
  if (DATE_FIELDS.has(field)) {
    return formatDate(value);
  }
  if (NUMERIC_FIELDS.has(field)) {
    const n = normalizeNumber(value);
    return n == null ? '' : String(n);
  }
  if (ID_NUMBER_FIELDS.has(field)) return normalizeIdNumber(value);
  if (field === 'email') return normalizeEmail(value);
  if (field === 'ifsc_code') return normalizeString(value).toUpperCase();
  if (field === 'emp_no') return normalizeEmpNo(value);
  if (field === 'is_active') return normalizeBool(value);
  if (field === 'qualifications') return normalizeQualifications(value);
  if (field === 'blood_group') return normalizeString(value).toUpperCase();
  if (field === 'gender') return normalizeGender(value);
  if (field === 'marital_status' || field === 'salary_mode') {
    const s = normalizeString(value);
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return normalizeString(value);
}

function valuesEqual(field, excelVal, dbVal) {
  if (NUMERIC_FIELDS.has(field)) {
    return numbersEqual(excelVal, dbVal);
  }
  const a = normalizeFieldValue(field, excelVal);
  const b = normalizeFieldValue(field, dbVal);
  return a === b;
}

function displayValue(field, value) {
  if (DATE_FIELDS.has(field)) {
    const formatted = formatDate(value);
    return formatted || (value == null ? '' : String(value));
  }
  if (NUMERIC_FIELDS.has(field)) {
    const n = normalizeNumber(value);
    return n == null ? '' : n;
  }
  if (field === 'qualifications') return normalizeQualifications(value);
  if (field === 'is_active') {
    const b = normalizeBool(value);
    return b === 'yes' ? 'Active' : b === 'no' ? 'Inactive' : '';
  }
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function dbFieldValue(employee, field, context = {}) {
  const { loanByEmpNo = new Map() } = context;
  const empNo = normalizeEmpNo(employee.emp_no);
  const loanAgg = loanByEmpNo.get(empNo) || { loan_due: 0, loan_recovery: 0, net_loan: 0 };

  switch (field) {
    case 'emp_no':
      return employee.emp_no;
    case 'employee_name':
      return employee.employee_name;
    case 'division_name':
      return employee.division_id?.name ?? '';
    case 'department_name':
      return employee.department_id?.name ?? '';
    case 'designation_name':
      return employee.designation_id?.name ?? '';
    case 'group_name':
      return employee.employee_group_id?.name ?? '';
    case 'employee_type':
      return pickFirstDefined(
        dynamicField(employee, ['type', 'employee_type', 'employeeType', 'Type']),
        employee.employee_group_id?.name
      );
    case 'uan_number':
      return pickFirstDefined(
        employee.uan_number,
        dynamicField(employee, ['uan_number', 'uan', 'UAN', 'pf_uan'])
      );
    case 'retirement_date':
      return dynamicField(employee, [
        'date_of_retirement',
        'retirement_date',
        'dateOfRetirement',
        'Date of Retirement',
      ]);
    case 'gross_salary':
      return employee.gross_salary;
    case 'left_date':
      return employee.leftDate;
    case 'second_salary':
      return employee.second_salary;
    case 'is_active':
      return employee.is_active;
    case 'qualifications':
      return employee.qualifications ?? employee.dynamicFields?.qualifications;
    case 'loan_due':
      return loanAgg.loan_due;
    case 'loan_recovery':
      return loanAgg.loan_recovery;
    case 'net_loan':
      return loanAgg.net_loan;
    default:
      return employee[field];
  }
}

async function loadLoanSummaryByEmpNo() {
  const loans = await Loan.find({
    requestType: 'loan',
    status: { $in: OPEN_LOAN_STATUSES },
  })
    .select('emp_no amount originalAmount loanConfig repayment')
    .lean();

  const byEmpNo = new Map();
  for (const loan of loans) {
    const empNo = normalizeEmpNo(loan.emp_no);
    if (!empNo) continue;

    if (!byEmpNo.has(empNo)) {
      byEmpNo.set(empNo, { loan_due: 0, loan_recovery: 0, net_loan: 0 });
    }
    const agg = byEmpNo.get(empNo);

    const due = Number(loan.loanConfig?.totalAmount ?? loan.originalAmount ?? loan.amount) || 0;
    const recovery = Number(loan.repayment?.totalPaid) || 0;
    const remaining = Number(loan.repayment?.remainingBalance);
    const netLoan = Number.isFinite(remaining) ? remaining : Math.max(0, due - recovery);

    agg.loan_due += due;
    agg.loan_recovery += recovery;
    agg.net_loan += netLoan;
  }
  return byEmpNo;
}

function readExcelRows(filePath, sheetName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = sheetName || wb.SheetNames[0];
  if (!wb.Sheets[sheet]) {
    throw new Error(`Sheet not found: "${sheet}". Available: ${wb.SheetNames.join(', ')}`);
  }

  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  if (!matrix.length) {
    throw new Error('Excel sheet is empty');
  }

  const headers = matrix[0].map((h) => String(h || '').trim());
  const { columnMap, unmapped } = buildHeaderLookup(headers);

  if (!columnMap.emp_no) {
    throw new Error(
      'Could not find employee number column. Expected headers like: emp_no, Employee No, Employee Number'
    );
  }

  const rows = [];
  const duplicateEmpNos = new Map();

  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r];
    if (!line || line.every((c) => c == null || String(c).trim() === '')) continue;

    const record = {};
    for (const [field, meta] of Object.entries(columnMap)) {
      record[field] = line[meta.index];
    }

    const empNo = normalizeEmpNo(record.emp_no);
    if (!empNo) continue;

    if (duplicateEmpNos.has(empNo)) {
      duplicateEmpNos.set(empNo, duplicateEmpNos.get(empNo) + 1);
    } else {
      duplicateEmpNos.set(empNo, 1);
    }

    rows.push({
      emp_no: empNo,
      excel_row: r + 1,
      values: record,
    });
  }

  const duplicates = [...duplicateEmpNos.entries()].filter(([, count]) => count > 1).map(([empNo]) => empNo);

  // Keep last occurrence for duplicate emp_no (same as many bulk-import tools)
  const byEmpNo = new Map();
  for (const row of rows) {
    byEmpNo.set(row.emp_no, row);
  }

  return {
    sheet,
    headers,
    columnMap,
    unmappedHeaders: unmapped,
    rows: [...byEmpNo.values()],
    duplicateEmpNos: duplicates,
  };
}

async function loadEmployeesFromDb() {
  const employees = await Employee.find({})
    .populate('division_id', 'name')
    .populate('department_id', 'name')
    .populate('designation_id', 'name code')
    .populate('employee_group_id', 'name')
    .lean();

  const byEmpNo = new Map();
  for (const emp of employees) {
    const empNo = normalizeEmpNo(emp.emp_no);
    if (empNo) byEmpNo.set(empNo, emp);
  }
  return byEmpNo;
}

function writeWorkbook(outPath, sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: 'No rows' }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, outPath);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error(`
Usage:
  node backend/scripts/compare_employee_excel_vs_db.js --file <path-to-excel.xlsx> [--out report.xlsx] [--sheet "Sheet1"] [--all-fields]
`);
    process.exit(1);
  }

  const inputFile = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);
  const outFile = args.outPath
    ? (path.isAbsolute(args.outPath) ? args.outPath : path.resolve(process.cwd(), args.outPath))
    : path.join(__dirname, `employee_db_vs_excel_diff_${Date.now()}.xlsx`);

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI or MONGO_URI in backend/.env');
    process.exit(1);
  }

  console.log('==================================================================');
  console.log('Employee Excel vs Database comparison (by emp_no)');
  console.log('Input Excel :', inputFile);
  console.log('Output Excel:', outFile);
  console.log('==================================================================');

  const excelData = readExcelRows(inputFile, args.sheet);
  console.log(`\nExcel sheet: "${excelData.sheet}"`);
  console.log(`Excel rows (unique emp_no): ${excelData.rows.length}`);
  const mappedCols = Object.entries(excelData.columnMap)
    .map(([field, meta]) => `${meta.originalHeader} → ${field}`)
    .join('\n  ');
  console.log('Mapped Excel columns:');
  console.log(`  ${mappedCols || '(none)'}`);
  if (excelData.unmappedHeaders.length) {
    console.log(`Unmapped Excel columns (ignored): ${excelData.unmappedHeaders.join(', ')}`);
  }
  if (excelData.duplicateEmpNos.length) {
    console.log(`Warning: duplicate emp_no in Excel (using last row): ${excelData.duplicateEmpNos.join(', ')}`);
  }

  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected.\n');

  try {
    const [dbByEmpNo, loanByEmpNo] = await Promise.all([
      loadEmployeesFromDb(),
      loadLoanSummaryByEmpNo(),
    ]);
    console.log(`Database employees: ${dbByEmpNo.size}`);
    console.log(`Employees with open loans in DB: ${loanByEmpNo.size}`);

    const compareContext = { loanByEmpNo };

    const excelEmpNos = new Set(excelData.rows.map((r) => r.emp_no));
    const dbEmpNos = new Set(dbByEmpNo.keys());

    const fieldsFromExcel = Object.keys(excelData.columnMap).filter((f) => f !== 'emp_no');
    const fieldsToCompare = args.allFields
      ? [...new Set([...STANDARD_COMPARE_FIELDS, ...fieldsFromExcel])]
      : fieldsFromExcel.length
        ? fieldsFromExcel
        : STANDARD_COMPARE_FIELDS;

    const diffRows = [];
    const matchedRows = [];
    const onlyInExcel = [];
    const onlyInDb = [];

    for (const excelRow of excelData.rows) {
      const dbEmp = dbByEmpNo.get(excelRow.emp_no);
      if (!dbEmp) {
        onlyInExcel.push({
          emp_no: excelRow.emp_no,
          employee_name: normalizeString(excelRow.values.employee_name),
          excel_row: excelRow.excel_row,
          note: 'Present in Excel but not found in database',
        });
        continue;
      }

      const rowDiffs = [];
      for (const field of fieldsToCompare) {
        const excelVal = excelRow.values[field];
        const dbVal = dbFieldValue(dbEmp, field, compareContext);
        if (!valuesEqual(field, excelVal, dbVal)) {
          rowDiffs.push({
            emp_no: excelRow.emp_no,
            employee_name: dbEmp.employee_name || excelRow.values.employee_name || '',
            excel_row: excelRow.excel_row,
            excel_column: excelData.columnMap[field]?.originalHeader || field,
            field,
            excel_value: displayValue(field, excelVal),
            db_value: displayValue(field, dbVal),
          });
        }
      }

      if (rowDiffs.length) {
        diffRows.push(...rowDiffs);
      } else {
        matchedRows.push({
          emp_no: excelRow.emp_no,
          employee_name: dbEmp.employee_name || '',
          excel_row: excelRow.excel_row,
          status: 'match',
        });
      }
    }

    for (const empNo of dbEmpNos) {
      if (!excelEmpNos.has(empNo)) {
        const dbEmp = dbByEmpNo.get(empNo);
        onlyInDb.push({
          emp_no: empNo,
          employee_name: dbEmp?.employee_name || '',
          division: dbEmp?.division_id?.name || '',
          department: dbEmp?.department_id?.name || '',
          is_active: dbEmp?.is_active === false ? 'Inactive' : 'Active',
          note: 'Present in database but not found in Excel',
        });
      }
    }

    diffRows.sort((a, b) => {
      const c = String(a.emp_no).localeCompare(String(b.emp_no));
      if (c !== 0) return c;
      return String(a.field).localeCompare(String(b.field));
    });

    onlyInExcel.sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));
    onlyInDb.sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));
    matchedRows.sort((a, b) => String(a.emp_no).localeCompare(String(b.emp_no)));

    const employeesWithDiffs = new Set(diffRows.map((r) => r.emp_no)).size;

    const summaryRows = [
      { metric: 'Excel unique employees', value: excelData.rows.length },
      { metric: 'Database employees', value: dbByEmpNo.size },
      { metric: 'Matched (same emp_no)', value: excelData.rows.length - onlyInExcel.length },
      { metric: 'Matched with no field differences', value: matchedRows.length },
      { metric: 'Matched with at least one difference', value: employeesWithDiffs },
      { metric: 'Total field-level differences', value: diffRows.length },
      { metric: 'Only in Excel (not in DB)', value: onlyInExcel.length },
      { metric: 'Only in DB (not in Excel)', value: onlyInDb.length },
      { metric: 'Fields compared', value: fieldsToCompare.join(', ') },
      { metric: 'Input file', value: inputFile },
      { metric: 'Generated at', value: new Date().toISOString() },
    ];

    const columnMappingRows = Object.entries(excelData.columnMap).map(([field, meta]) => ({
      excel_header: meta.originalHeader,
      compared_field: field,
      db_source:
        field === 'loan_due' || field === 'loan_recovery' || field === 'net_loan'
          ? 'Loan collection (disbursed/active loans, summed per emp_no)'
          : field === 'uan_number' || field === 'retirement_date' || field === 'employee_type'
            ? 'Employee + dynamicFields (+ employee group for Type fallback)'
            : ['division_name', 'department_name', 'designation_name', 'group_name'].includes(field)
              ? 'Employee populated reference name'
              : 'Employee document field',
    }));

    writeWorkbook(outFile, [
      { name: 'Summary', rows: summaryRows },
      { name: 'Column_Mapping', rows: columnMappingRows },
      { name: 'Field_Differences', rows: diffRows },
      { name: 'Only_in_Excel', rows: onlyInExcel },
      { name: 'Only_in_DB', rows: onlyInDb },
      { name: 'Matched_No_Diff', rows: matchedRows },
    ]);

    console.log('--- Results ---');
    for (const row of summaryRows.slice(0, 8)) {
      console.log(`${row.metric}: ${row.value}`);
    }
    console.log(`\nExcel report written: ${outFile}`);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('\nFailed:', err.message || err);
    process.exit(1);
  });
}

module.exports = { run, readExcelRows, normalizeFieldValue, valuesEqual };
