/**
 * Reset all employees to:
 *   - employeeAllowances = []
 *   - employeeDeductions = []
 *   - Statutory: Profession Tax ON (applyProfessionTax: true), PF and ESI OFF (applyPF: false, applyESI: false)
 *
 * Attendance deduction flags (applyAttendanceDeduction, deductLateIn, etc.) are NOT changed.
 *
 * Usage (from repo root or backend/):
 *   # Dry run — scans DB, prints summary, writes Excel only (no writes)
 *   node backend/scripts/reset_employee_allowances_and_statutory_pt_only.js
 *
 *   # Same with custom Excel path
 *   node backend/scripts/reset_employee_allowances_and_statutory_pt_only.js --out B:/reports/reset_preview.xlsx
 *
 *   # Apply changes to MongoDB (after reviewing dry-run + Excel)
 *   node backend/scripts/reset_employee_allowances_and_statutory_pt_only.js --apply
 *
 * Optional: also update pending / verified employee applications (not approved/rejected)
 *   node backend/scripts/reset_employee_allowances_and_statutory_pt_only.js --applications
 *   node backend/scripts/reset_employee_allowances_and_statutory_pt_only.js --apply --applications
 *
 * Env: MONGODB_URI or MONGO_URI (see backend/.env)
 */

/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const Employee = require('../employees/model/Employee');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');

const TARGET = {
  employeeAllowances: [],
  employeeDeductions: [],
  applyProfessionTax: true,
  applyPF: false,
  applyESI: false,
};

function parseArgs(argv) {
  const out = { apply: false, applications: false, outPath: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    if (a === '--applications') out.applications = true;
    if (a === '--out' && argv[i + 1]) {
      out.outPath = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

/** @returns {boolean} true if this document should be updated */
function needsEmployeeUpdate(doc) {
  const alen = Array.isArray(doc.employeeAllowances) ? doc.employeeAllowances.length : 0;
  const dlen = Array.isArray(doc.employeeDeductions) ? doc.employeeDeductions.length : 0;
  const ptOk = doc.applyProfessionTax !== false;
  const pfOff = doc.applyPF === false;
  const esiOff = doc.applyESI === false;
  return alen > 0 || dlen > 0 || !ptOk || !pfOff || !esiOff;
}

function needsApplicationUpdate(doc) {
  return needsEmployeeUpdate(doc);
}

function employeeRow(doc, entityType) {
  const beforeAlen = Array.isArray(doc.employeeAllowances) ? doc.employeeAllowances.length : 0;
  const beforeDlen = Array.isArray(doc.employeeDeductions) ? doc.employeeDeductions.length : 0;
  const update = needsEmployeeUpdate(doc);
  return {
    entity_type: entityType,
    emp_no: doc.emp_no ?? '',
    employee_name: doc.employee_name ?? '',
    application_status: doc.status ?? '',
    would_update: update ? 'yes' : 'no',
    before_allowances_count: beforeAlen,
    before_deductions_count: beforeDlen,
    before_apply_profession_tax: doc.applyProfessionTax,
    before_apply_pf: doc.applyPF,
    before_apply_esi: doc.applyESI,
    after_allowances_count: 0,
    after_deductions_count: 0,
    after_apply_profession_tax: true,
    after_apply_pf: false,
    after_apply_esi: false,
  };
}

function printSummary(title, total, toUpdate) {
  console.log(`\n--- ${title} ---`);
  console.log(`Total documents: ${total}`);
  console.log(`Would update (not yet matching target): ${toUpdate}`);
  console.log('Target for those rows: empty employee allowances/deductions; PT=on, PF=off, ESI=off.');
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI or MONGO_URI in environment / backend/.env');
    process.exit(1);
  }

  console.log('==================================================================');
  console.log('Reset employee-level allowances/deductions + statutory PT only');
  console.log('Mode:', args.apply ? 'APPLY (writes to MongoDB)' : 'DRY RUN (no writes)');
  console.log('Also update pending/verified applications:', args.applications ? 'yes' : 'no');
  console.log('==================================================================');
  console.log('Connecting:', uri.replace(/:[^:@]+@/, ':****@'));

  await mongoose.connect(uri);
  console.log('Connected.\n');

  const employees = await Employee.find({})
    .select(
      'emp_no employee_name employeeAllowances employeeDeductions applyProfessionTax applyPF applyESI'
    )
    .lean();

  const empRows = employees.map((e) => employeeRow(e, 'Employee'));
  const empToUpdate = empRows.filter((r) => r.would_update === 'yes');
  printSummary('Employees', employees.length, empToUpdate.length);

  let appRows = [];
  let applications = [];
  if (args.applications) {
    applications = await EmployeeApplication.find({
      status: { $in: ['pending', 'verified'] },
    })
      .select(
        'emp_no employee_name status employeeAllowances employeeDeductions applyProfessionTax applyPF applyESI'
      )
      .lean();
    appRows = applications.map((a) => employeeRow(a, 'EmployeeApplication'));
    const appToUpdate = appRows.filter((r) => r.would_update === 'yes');
    printSummary('Employee applications (pending + verified)', applications.length, appToUpdate.length);
  }

  const defaultOut = path.join(
    __dirname,
    'output',
    `reset_allowances_statutory_pt_only_${args.apply ? 'applied' : 'dryrun'}_${Date.now()}.xlsx`
  );
  const outFile = args.outPath
    ? path.isAbsolute(args.outPath)
      ? args.outPath
      : path.resolve(process.cwd(), args.outPath)
    : defaultOut;

  const outDir = path.dirname(outFile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(empRows), 'Employees');
  if (args.applications) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(appRows), 'Applications');
  }

  const summarySheet = [
    { key: 'run_mode', value: args.apply ? 'APPLY' : 'DRY_RUN' },
    { key: 'employees_total', value: employees.length },
    { key: 'employees_to_update', value: empToUpdate.length },
    ...(args.applications
      ? [
          { key: 'applications_total', value: applications.length },
          {
            key: 'applications_to_update',
            value: appRows.filter((r) => r.would_update === 'yes').length,
          },
        ]
      : []),
    { key: 'target_allowances', value: '[]' },
    { key: 'target_deductions', value: '[]' },
    { key: 'target_apply_profession_tax', value: 'true' },
    { key: 'target_apply_pf', value: 'false' },
    { key: 'target_apply_esi', value: 'false' },
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summarySheet), 'Summary');

  XLSX.writeFile(workbook, outFile);
  console.log(`\nExcel written: ${outFile}`);

  if (!args.apply) {
    console.log('\nNo database changes were made. Re-run with --apply after reviewing the Excel file.');
    await mongoose.disconnect();
    return;
  }

  const empIds = employees.filter((e) => needsEmployeeUpdate(e)).map((e) => e._id);
  if (empIds.length) {
    const res = await Employee.updateMany(
      { _id: { $in: empIds } },
      {
        $set: {
          employeeAllowances: TARGET.employeeAllowances,
          employeeDeductions: TARGET.employeeDeductions,
          applyProfessionTax: TARGET.applyProfessionTax,
          applyPF: TARGET.applyPF,
          applyESI: TARGET.applyESI,
        },
      }
    );
    console.log(`\nEmployees updated: ${res.modifiedCount} (matched: ${res.matchedCount})`);
  } else {
    console.log('\nEmployees updated: 0 (none needed changes)');
  }

  if (args.applications) {
    const appIds = applications.filter((a) => needsApplicationUpdate(a)).map((a) => a._id);
    if (appIds.length) {
      const resA = await EmployeeApplication.updateMany(
        { _id: { $in: appIds } },
        {
          $set: {
            employeeAllowances: TARGET.employeeAllowances,
            employeeDeductions: TARGET.employeeDeductions,
            applyProfessionTax: TARGET.applyProfessionTax,
            applyPF: TARGET.applyPF,
            applyESI: TARGET.applyESI,
          },
        }
      );
      console.log(`Applications updated: ${resA.modifiedCount} (matched: ${resA.matchedCount})`);
    } else {
      console.log('Applications updated: 0 (none needed changes)');
    }
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
