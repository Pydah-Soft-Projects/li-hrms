const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

require('../departments/model/Designation');
require('../departments/model/Department');
require('../departments/model/Division');

const Employee = require('../employees/model/Employee');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const { reconcilePoolCarryChainAfterRegisterChange } = require('../leaves/services/leaveRegisterPoolCarryReconcileService');

function msToHms(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}h ${m}m ${r}s`;
}

async function main() {
  const startedAt = Date.now();
  await mongoose.connect(process.env.MONGODB_URI);

  const q = {};
  const projection = { _id: 1, employeeId: 1, empNo: 1, employeeName: 1 };
  const cursor = LeaveRegisterYear.find(q).select(projection).sort({ financialYearStart: 1 }).cursor();

  const seen = new Set();

  let processed = 0;
  let ok = 0;
  let failed = 0;
  let carriesPostedTotal = 0;
  let edgesAppliedTotal = 0;
  let carryErrorsTotal = 0;
  let forfeitsPostedTotal = 0;

  const failures = [];

  for await (const yr of cursor) {
    const eid = String(yr.employeeId);
    if (seen.has(eid)) continue;
    seen.add(eid);

    processed++;
    const emp = await Employee.findById(yr.employeeId).select('emp_no employee_name is_active').lean();
    const empNo = emp?.emp_no || yr.empNo || 'N/A';
    const name = emp?.employee_name || yr.employeeName || '';

    const t0 = Date.now();
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await reconcilePoolCarryChainAfterRegisterChange(yr.employeeId, { asOfDate: new Date() });
      const dt = Date.now() - t0;
      if (res?.ok) ok++;
      else failed++;

      carriesPostedTotal += Number(res?.carriesPosted) || 0;
      edgesAppliedTotal += Number(res?.edgesApplied) || 0;
      carryErrorsTotal += Number(res?.carryErrors) || 0;
      forfeitsPostedTotal += Number(res?.forfeitsPosted) || 0;

      if (!res?.ok) {
        failures.push({ empNo, name, error: res?.error || 'unknown_error' });
      }

      if (processed % 25 === 0) {
        console.log(
          `[reconcile-all] processed=${processed} ok=${ok} failed=${failed} elapsed=${msToHms(Date.now() - startedAt)} last=${empNo} ${name} dt=${msToHms(dt)}`
        );
      }
    } catch (e) {
      failed++;
      const dt = Date.now() - t0;
      failures.push({ empNo, name, error: e?.message || String(e) });
      console.log(
        `[reconcile-all] ERROR empNo=${empNo} ${name} dt=${msToHms(dt)} err=${e?.message || e}`
      );
    }
  }

  const summary = {
    processed,
    ok,
    failed,
    carriesPostedTotal,
    edgesAppliedTotal,
    carryErrorsTotal,
    forfeitsPostedTotal,
    elapsed: msToHms(Date.now() - startedAt),
    failures: failures.slice(0, 200),
    failureCount: failures.length,
  };

  console.log('\n=== RECONCILE ALL SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

