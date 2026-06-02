#!/usr/bin/env node
/**
 * Runs pay register feature tests and prints a clear summary report.
 * Usage: node scripts/run_pay_register_features_test_report.js
 */

const { execSync } = require('child_process');
const path = require('path');

const testFile = 'pay-register/services/__tests__/payRegisterFeatures.test.js';
const backendRoot = path.join(__dirname, '..');

console.log('\n========================================');
console.log(' PAY REGISTER FEATURES — TEST REPORT');
console.log('========================================\n');
console.log('Scope: modifications export, multi-shift full/half, payable totals, routes\n');

let exitCode = 0;
try {
  execSync(`npx jest "${testFile}" --no-coverage --colors=false --forceExit 2>&1`, {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
} catch (e) {
  exitCode = e.status || 1;
}

console.log('\n----------------------------------------');
console.log(' TEST CASE MATRIX (what was verified)');
console.log('----------------------------------------\n');

const matrix = [
  ['ID', 'Area', 'Scenario', 'Expected'],
  ['—', 'Modifications', 'Excel column mapping', 'Employee, Field, Old/New, Edited By'],
  ['—', 'Modifications', 'Field labels', 'shiftSelections → Shift full/half'],
  ['TC-MS-01', 'Multi-shift', 'Single shift full', 'payable = shift base'],
  ['TC-MS-02', 'Multi-shift', 'Single shift half', 'payable = base × 0.5'],
  ['TC-MS-03', 'Multi-shift', 'Morning full + Evening half', 'Day payable = 2.0'],
  ['TC-MS-04', 'Multi-shift', 'Two shifts both full', 'Day payable = sum bases'],
  ['TC-MS-05', 'Multi-shift', 'Attendance payableUnits override', 'Uses segment value'],
  ['TC-MS-06', 'Sync', 'Attendance PRESENT + HALF_DAY segments', 'shiftSelections + names'],
  ['TC-MS-07', 'Sync', 'No shifts on attendance', 'null'],
  ['TC-TOT-01', 'Totals', 'Full day present, payableShifts=2', 'Monthly totalPayableShifts=2'],
  ['TC-TOT-02', 'Totals', 'Full day present, payableShifts=3', 'Monthly totalPayableShifts=3'],
  ['TC-TOT-03', 'Totals', 'Half day present only', 'totalPayableShifts = day×0.5'],
  ['TC-TOT-04', 'Totals', 'Absent day', 'totalPayableShifts = 0'],
  ['—', 'API', 'Routes', 'export-modifications, export-modifications-pdf, history'],
];

const colWidths = [10, 16, 36, 28];
for (const row of matrix) {
  console.log(row.map((c, i) => String(c).padEnd(colWidths[i])).join(' '));
}

console.log('\n----------------------------------------');
console.log(exitCode === 0 ? ' RESULT: ALL TESTS PASSED' : ' RESULT: SOME TESTS FAILED');
console.log('----------------------------------------\n');

console.log('Manual checks (UI / live API):');
console.log('  1. Superadmin Pay Register → Modifications Excel / PDF download');
console.log('  2. Edit present day (multi-shift) → pick 2 shifts, one Full one Half → save');
console.log('  3. Confirm Payable shifts column updates after save\n');

process.exit(exitCode);
