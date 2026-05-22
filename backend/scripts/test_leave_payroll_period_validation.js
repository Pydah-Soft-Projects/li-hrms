/**
 * Smoke test: IST leave dates + single payroll period validation.
 * Usage: node scripts/test_leave_payroll_period_validation.js
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const dateCycleService = require('../leaves/services/dateCycleService');
const {
  parseCalendarDateAsIST,
  extractISTComponents,
} = require('../shared/utils/dateUtils');
const {
  assertSinglePayrollPeriodForLeaveRange,
  getPayrollPeriodBoundsForLeaveDate,
} = require('../leaves/services/leavePayrollPeriodValidationService');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  const settings = await dateCycleService.getPayrollCycleSettings();
  console.log('Payroll cycle settings:', settings);

  const cases = [
    { from: '2026-04-25', to: '2026-04-25', expectOk: true, label: 'single day Apr 25' },
    { from: '2026-04-25', to: '2026-04-26', expectOk: false, label: 'Apr 25–26 (boundary)' },
    { from: '2026-04-26', to: '2026-04-30', expectOk: true, label: 'Apr 26–30 same period' },
  ];

  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    const r = await assertSinglePayrollPeriodForLeaveRange(c.from, c.to);
    const ok = r.ok === c.expectOk;
    if (ok) {
      passed++;
      console.log(`PASS ${c.label}`);
      if (r.ok && r.payrollCycle) {
        console.log(`     period: ${r.payrollCycle.start} → ${r.payrollCycle.end} (${r.payrollCycle.label})`);
      } else if (!r.ok) {
        console.log(`     blocked: ${r.code}`);
      }
    } else {
      failed++;
      console.log(`FAIL ${c.label} — expected ok=${c.expectOk}, got ok=${r.ok}`);
      console.log(`     ${r.error || JSON.stringify(r.payrollCycle)}`);
    }
  }

  const istParse = parseCalendarDateAsIST('2026-04-25');
  const istYmd = extractISTComponents(istParse).dateStr;
  if (istYmd === '2026-04-25') {
    passed++;
    console.log('PASS parseCalendarDateAsIST → 2026-04-25');
  } else {
    failed++;
    console.log(`FAIL parseCalendarDateAsIST — got ${istYmd}`);
  }

  const bounds = await getPayrollPeriodBoundsForLeaveDate('2026-04-25');
  if (bounds.ok && bounds.timezone === 'Asia/Kolkata' && bounds.payrollCycle?.start && bounds.payrollCycle?.end) {
    passed++;
    console.log(`PASS payroll-period-bounds API data for 2026-04-25: ${bounds.payrollCycle.start} → ${bounds.payrollCycle.end}`);
  } else {
    failed++;
    console.log('FAIL getPayrollPeriodBoundsForLeaveDate', bounds);
  }

  const apr25Cycle = await dateCycleService.getPayrollCycleForDate(parseCalendarDateAsIST('2026-04-25'));
  const apr26Cycle = await dateCycleService.getPayrollCycleForDate(parseCalendarDateAsIST('2026-04-26'));
  const s25 = extractISTComponents(apr25Cycle.startDate).dateStr;
  const e25 = extractISTComponents(apr25Cycle.endDate).dateStr;
  const s26 = extractISTComponents(apr26Cycle.startDate).dateStr;
  const e26 = extractISTComponents(apr26Cycle.endDate).dateStr;
  console.log('\nCycle for 2026-04-25 (IST):', s25, '→', e25, `(month ${apr25Cycle.month}/${apr25Cycle.year})`);
  console.log('Cycle for 2026-04-26 (IST):', s26, '→', e26, `(month ${apr26Cycle.month}/${apr26Cycle.year})`);

  if (s25 !== s26) {
    passed++;
    console.log('PASS Apr 25 and Apr 26 resolve to different payroll periods');
  } else {
    failed++;
    console.log('FAIL Apr 25 and Apr 26 should be different periods for custom cycle');
  }

  await mongoose.disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
