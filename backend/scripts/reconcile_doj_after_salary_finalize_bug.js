/**
 * Reconcile DOJ overwritten to "approval day" by the salary-finalize UI bug
 * (approval form defaulted DOJ to today when application.doj was empty).
 *
 * Recovery source: employmentTenures open tenure joinDate is set at verify and
 * was NOT updated on salary approve — so it usually still holds the pre-bug DOJ.
 *
 * salary_approved history does NOT store previous DOJ; application.doj was also
 * overwritten on approve. Tenure is the best automated recovery source.
 *
 * Usage (from backend/):
 *   node scripts/reconcile_doj_after_salary_finalize_bug.js --check
 *   node scripts/reconcile_doj_after_salary_finalize_bug.js --check --date=2026-08-01
 *   node scripts/reconcile_doj_after_salary_finalize_bug.js --apply --date=2026-08-01
 *
 * Optional:
 *   --date=YYYY-MM-DD   salaryApprovedAt calendar day to scan (default: today UTC)
 *   --from=YYYY-MM-DD --to=YYYY-MM-DD   scan a range of approval days instead of --date
 *   --emp=EMP001,EMP002   limit to emp numbers
 *   --apply               write Employee.doj + Application.doj (+ sync open tenure if needed)
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const EmployeeApplication = require('../employee-applications/model/EmployeeApplication');

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function ymdUTC(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function startOfUtcDay(ymd) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function endOfUtcDay(ymd) {
  return new Date(`${ymd}T23:59:59.999Z`);
}

function openTenureJoinDate(employee) {
  const tenures = Array.isArray(employee.employmentTenures) ? employee.employmentTenures : [];
  const open = [...tenures].reverse().find((t) => t && !t.leaveDate && t.joinDate);
  if (open?.joinDate) return open.joinDate;
  const last = [...tenures].reverse().find((t) => t?.joinDate);
  return last?.joinDate || null;
}

async function main() {
  const doApply = hasFlag('--apply');
  const doCheck = hasFlag('--check') || !doApply;
  const empFilter = (argValue('--emp') || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  let fromYmd = argValue('--from');
  let toYmd = argValue('--to');
  const single = argValue('--date') || (!fromYmd && !toYmd ? ymdUTC(new Date()) : null);
  if (single) {
    fromYmd = single;
    toYmd = single;
  }
  if (!fromYmd || !toYmd || !/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) {
    console.error('Provide --date=YYYY-MM-DD or --from=YYYY-MM-DD --to=YYYY-MM-DD');
    process.exit(1);
  }

  console.log(`Mode: ${doApply ? 'APPLY' : 'CHECK (dry-run)'}`);
  console.log(`salaryApprovedAt range (UTC day): ${fromYmd} → ${toYmd}`);
  if (empFilter.length) console.log(`emp filter: ${empFilter.join(', ')}`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  const query = {
    salaryStatus: 'approved',
    salaryApprovedAt: { $gte: startOfUtcDay(fromYmd), $lte: endOfUtcDay(toYmd) },
  };
  if (empFilter.length) query.emp_no = { $in: empFilter };

  const employees = await Employee.find(query)
    .select('emp_no employee_name doj salaryApprovedAt employmentTenures salaryStatus')
    .lean();

  console.log(`Approved in range: ${employees.length}`);

  const recoverable = [];
  const sameAsTenure = [];
  const noTenure = [];
  const notSuspicious = [];

  for (const emp of employees) {
    const approvedYmd = ymdUTC(emp.salaryApprovedAt);
    const dojYmd = ymdUTC(emp.doj);
    const tenureJoin = openTenureJoinDate(emp);
    const tenureYmd = ymdUTC(tenureJoin);

    // Bug signature: DOJ calendar day equals approval calendar day
    // (UI sent "today" = approval day).
    const suspicious = Boolean(approvedYmd && dojYmd && approvedYmd === dojYmd);

    if (!suspicious) {
      notSuspicious.push({ emp_no: emp.emp_no, dojYmd, approvedYmd, tenureYmd });
      continue;
    }

    if (!tenureYmd) {
      noTenure.push({ emp_no: emp.emp_no, name: emp.employee_name, dojYmd, approvedYmd });
      continue;
    }

    if (tenureYmd === dojYmd) {
      sameAsTenure.push({ emp_no: emp.emp_no, name: emp.employee_name, dojYmd, approvedYmd });
      continue;
    }

    recoverable.push({
      emp_no: emp.emp_no,
      name: emp.employee_name,
      wrongDoj: dojYmd,
      approvedAt: approvedYmd,
      restoreDoj: tenureYmd,
      restoreDate: tenureJoin,
    });
  }

  console.log('\n=== Summary ===');
  console.log(`Not suspicious (doj ≠ approval day): ${notSuspicious.length}`);
  console.log(`Suspicious but tenure matches doj (no auto restore): ${sameAsTenure.length}`);
  console.log(`Suspicious but no tenure joinDate: ${noTenure.length}`);
  console.log(`Recoverable from tenure joinDate: ${recoverable.length}`);

  if (sameAsTenure.length) {
    console.log('\n--- Same as tenure (verify-day == approve-day; need manual source) ---');
    for (const r of sameAsTenure) {
      console.log(`  ${r.emp_no} ${r.name} doj=${r.dojYmd}`);
    }
  }
  if (noTenure.length) {
    console.log('\n--- No tenure (manual restore needed) ---');
    for (const r of noTenure) {
      console.log(`  ${r.emp_no} ${r.name} doj=${r.dojYmd}`);
    }
  }

  console.log('\n--- Recoverable ---');
  for (const r of recoverable) {
    console.log(`  ${r.emp_no} ${r.name}: ${r.wrongDoj} → ${r.restoreDoj}`);
  }

  if (!doApply) {
    console.log('\nDry-run only. Re-run with --apply to write changes.');
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  for (const r of recoverable) {
    const emp = await Employee.findOne({ emp_no: r.emp_no });
    if (!emp) continue;

    const restoreDate = new Date(r.restoreDate);
    emp.doj = restoreDate;

    // Keep open tenure aligned (should already match restoreDate)
    if (Array.isArray(emp.employmentTenures) && emp.employmentTenures.length) {
      const open = [...emp.employmentTenures].reverse().find((t) => t && !t.leaveDate);
      if (open && ymdUTC(open.joinDate) !== r.restoreDoj) {
        open.joinDate = restoreDate;
      }
    }

    await emp.save();

    const app = await EmployeeApplication.findOne({
      emp_no: r.emp_no,
      status: 'approved',
    }).sort({ approvedAt: -1 });

    if (app) {
      app.doj = restoreDate;
      await app.save();
    }

    updated += 1;
    console.log(`Restored ${r.emp_no}: ${r.wrongDoj} → ${r.restoreDoj}`);
  }

  console.log(`\nUpdated ${updated} employee(s).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
