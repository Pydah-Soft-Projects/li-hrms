/**
 * Robust simulation for continuous 3-day absent + salary hold.
 * Run: node scripts/simulate_continuous_absent_and_salary_hold.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildIncompleteBatchAbsentScanRange,
  findLatestContinuousAbsentWindow,
  enumerateDatesInclusive,
  addDaysYmd,
  formatContinuousAbsentLabel,
} = require('../shared/utils/continuousAbsentUtils');

const {
  isEmployeeSalaryHeld,
  salaryNotOnHoldQueryFragment,
  filterPayrollRecordsExcludingSalaryHeld,
  buildSalaryHeldMessage,
} = require('../shared/utils/salaryHoldUtils');

const results = [];
function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
}

test('scan range extends past period end to today (cross-period abscond)', () => {
  const scan = buildIncompleteBatchAbsentScanRange('2026-06-26', '2026-07-25', '2026-08-01');
  assert.equal(scan.scanFrom, '2026-06-26');
  assert.equal(scan.scanTo, '2026-08-01');
  record('cross-period scan range', true, `${scan.scanFrom}→${scan.scanTo}`);
});

test('scan range stays at period end when today is inside period', () => {
  const scan = buildIncompleteBatchAbsentScanRange('2026-06-26', '2026-07-25', '2026-07-10');
  assert.equal(scan.scanTo, '2026-07-25');
  record('in-period scan caps at endDate', true, scan.scanTo);
});

test('finds exactly 3 consecutive ABSENT days', () => {
  const map = new Map([
    ['2026-07-28', 'PRESENT'],
    ['2026-07-29', 'ABSENT'],
    ['2026-07-30', 'ABSENT'],
    ['2026-07-31', 'ABSENT'],
    ['2026-08-01', 'PRESENT'],
  ]);
  const w = findLatestContinuousAbsentWindow(map, '2026-07-26', '2026-08-01', 3);
  assert.ok(w);
  assert.equal(w.fromDate, '2026-07-29');
  assert.equal(w.toDate, '2026-07-31');
  assert.equal(w.days, 3);
  record('exact 3-day streak', true, `${w.fromDate}→${w.toDate}`);
});

test('WEEK_OFF breaks continuous absent chain', () => {
  const map = new Map([
    ['2026-07-29', 'ABSENT'],
    ['2026-07-30', 'WEEK_OFF'],
    ['2026-07-31', 'ABSENT'],
    ['2026-08-01', 'ABSENT'],
  ]);
  const w = findLatestContinuousAbsentWindow(map, '2026-07-29', '2026-08-01', 3);
  assert.equal(w, null);
  record('week_off breaks streak', true);
});

test('post-period 3-day abscond detected for previous incomplete batch window', () => {
  // Period ends 25th; absences 26–28 after period — still in scan when batch open
  const map = new Map([
    ['2026-07-24', 'PRESENT'],
    ['2026-07-25', 'PRESENT'],
    ['2026-07-26', 'ABSENT'],
    ['2026-07-27', 'ABSENT'],
    ['2026-07-28', 'ABSENT'],
  ]);
  const scan = buildIncompleteBatchAbsentScanRange('2026-06-26', '2026-07-25', '2026-07-28');
  const w = findLatestContinuousAbsentWindow(map, scan.scanFrom, scan.scanTo, 3);
  assert.ok(w);
  assert.equal(w.fromDate, '2026-07-26');
  assert.equal(w.toDate, '2026-07-28');
  record('post-period abscond on previous batch', true, formatContinuousAbsentLabel(w));
});

test('inside period only 2 absents → no flag', () => {
  const map = new Map([
    ['2026-07-10', 'ABSENT'],
    ['2026-07-11', 'ABSENT'],
    ['2026-07-12', 'PRESENT'],
  ]);
  const w = findLatestContinuousAbsentWindow(map, '2026-06-26', '2026-07-25', 3);
  assert.equal(w, null);
  record('2-day absent not flagged', true);
});

test('most recent streak wins when multiple exist', () => {
  const dates = enumerateDatesInclusive('2026-07-01', '2026-07-20');
  const map = new Map();
  for (const d of dates) map.set(d, 'PRESENT');
  map.set('2026-07-02', 'ABSENT');
  map.set('2026-07-03', 'ABSENT');
  map.set('2026-07-04', 'ABSENT');
  map.set('2026-07-15', 'ABSENT');
  map.set('2026-07-16', 'ABSENT');
  map.set('2026-07-17', 'ABSENT');
  map.set('2026-07-18', 'ABSENT');
  const w = findLatestContinuousAbsentWindow(map, '2026-07-01', '2026-07-20', 3);
  assert.equal(w.fromDate, '2026-07-15');
  assert.equal(w.days, 4);
  record('latest streak preferred', true, `${w.fromDate} (${w.days}d)`);
});

test('salary hold detection + filter', () => {
  assert.equal(isEmployeeSalaryHeld({ salaryOnHold: true }), true);
  assert.equal(isEmployeeSalaryHeld({ salaryOnHold: false }), false);
  assert.equal(isEmployeeSalaryHeld(null), false);

  const records = [
    { employeeId: { emp_no: '1', salaryOnHold: false } },
    { employeeId: { emp_no: '2', salaryOnHold: true, salaryHoldReason: 'Abscond verify' } },
    { employeeId: { emp_no: '3' } },
  ];
  const filtered = filterPayrollRecordsExcludingSalaryHeld(records);
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every((r) => r.employeeId.emp_no !== '2'));
  record('paysheet excludes held', true, `kept=${filtered.length}`);
});

test('salary not-on-hold query fragment shape', () => {
  const q = salaryNotOnHoldQueryFragment();
  assert.ok(Array.isArray(q.$or));
  assert.equal(q.$or.length, 2);
  record('hold query fragment', true);
});

test('held message includes reason', () => {
  const msg = buildSalaryHeldMessage([
    { emp_no: '111', employee_name: 'Test', salaryHoldReason: '3-day absent verify' },
  ]);
  assert.match(msg, /111/);
  assert.match(msg, /3-day absent verify/);
  record('hold message with reason', true);
});

test('addDaysYmd / enumerateDatesInclusive sanity', () => {
  assert.equal(addDaysYmd('2026-07-31', 1), '2026-08-01');
  assert.deepEqual(enumerateDatesInclusive('2026-07-30', '2026-08-01'), [
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
  ]);
  record('date helpers', true);
});

test('REPORT', () => {
  const failed = results.filter((r) => !r.pass);
  console.log('\n====================================================');
  console.log('CONTINUOUS ABSENT + SALARY HOLD — TEST REPORT');
  console.log('====================================================');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log('----------------------------------------------------');
  console.log(`Total: ${results.length}  Passed: ${results.length - failed.length}  Failed: ${failed.length}`);
  console.log('====================================================\n');
  assert.equal(failed.length, 0);
});
