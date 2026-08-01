/**
 * List employees whose salary was finalized on a given day (default: today, IST).
 * Use this against LOCAL DB (which still has correct DOJs) to export emp_no + original doj,
 * then apply those DOJs on PRODUCTION.
 *
 * Usage (from backend/, with local .env / MONGODB_URI):
 *   node scripts/list_salary_finalized_today.js
 *   node scripts/list_salary_finalized_today.js --date=2026-08-01
 *   node scripts/list_salary_finalized_today.js --from=2026-07-28 --to=2026-08-01
 *   node scripts/list_salary_finalized_today.js --date=2026-08-01 --csv
 *   node scripts/list_salary_finalized_today.js --date=2026-08-01 --suspicious-only
 *
 * Optional:
 *   --tz=IST|UTC     day boundary timezone (default IST = Asia/Kolkata)
 *   --csv            print CSV (easy to paste / save)
 *   --suspicious-only  only rows where current doj calendar day == approval calendar day
 *                      (likely hit by the "default DOJ = today" bug)
 *
 * Columns:
 *   emp_no, employee_name, current_doj, tenure_join_date, verified_at, salary_approved_at, suspicious
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

/** Calendar YYYY-MM-DD in IST or UTC */
function ymdInTz(d, tz) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  if (tz === 'UTC') return dt.toISOString().slice(0, 10);
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

function todayYmd(tz) {
  return ymdInTz(new Date(), tz);
}

/** Inclusive day range → UTC Date bounds for Mongo query */
function dayRangeToUtcBounds(fromYmd, toYmd, tz) {
  if (tz === 'UTC') {
    return {
      start: new Date(`${fromYmd}T00:00:00.000Z`),
      end: new Date(`${toYmd}T23:59:59.999Z`),
    };
  }
  // IST = UTC+05:30
  return {
    start: new Date(`${fromYmd}T00:00:00.000+05:30`),
    end: new Date(`${toYmd}T23:59:59.999+05:30`),
  };
}

function openTenureJoinDate(employee) {
  const tenures = Array.isArray(employee.employmentTenures) ? employee.employmentTenures : [];
  const open = [...tenures].reverse().find((t) => t && !t.leaveDate && t.joinDate);
  if (open?.joinDate) return open.joinDate;
  const last = [...tenures].reverse().find((t) => t?.joinDate);
  return last?.joinDate || null;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const tz = (argValue('--tz') || 'IST').toUpperCase() === 'UTC' ? 'UTC' : 'IST';
  const asCsv = hasFlag('--csv');
  const suspiciousOnly = hasFlag('--suspicious-only');

  let fromYmd = argValue('--from');
  let toYmd = argValue('--to');
  const single = argValue('--date') || (!fromYmd && !toYmd ? todayYmd(tz) : null);
  if (single) {
    fromYmd = single;
    toYmd = single;
  }
  if (!fromYmd || !toYmd || !/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(toYmd)) {
    console.error('Provide --date=YYYY-MM-DD or --from=YYYY-MM-DD --to=YYYY-MM-DD');
    process.exit(1);
  }

  const { start, end } = dayRangeToUtcBounds(fromYmd, toYmd, tz);

  console.error(`DB: ${(process.env.MONGODB_URI || '').replace(/\/\/.*@/, '//***@') || '(no MONGODB_URI)'}`);
  console.error(`salaryApprovedAt range (${tz}): ${fromYmd} → ${toYmd}`);
  console.error(`UTC bounds: ${start.toISOString()} → ${end.toISOString()}`);
  if (suspiciousOnly) console.error('Filter: suspicious-only (doj day == approval day)');

  await mongoose.connect(process.env.MONGODB_URI);

  const employees = await Employee.find({
    salaryStatus: 'approved',
    salaryApprovedAt: { $gte: start, $lte: end },
  })
    .select('emp_no employee_name doj salaryApprovedAt verifiedAt employmentTenures')
    .sort({ salaryApprovedAt: 1 })
    .lean();

  const rows = [];
  for (const emp of employees) {
    const currentDoj = ymdInTz(emp.doj, tz);
    const tenureJoin = openTenureJoinDate(emp);
    const tenureDoj = ymdInTz(tenureJoin, tz);
    const approvedAt = emp.salaryApprovedAt ? new Date(emp.salaryApprovedAt).toISOString() : '';
    const approvedDay = ymdInTz(emp.salaryApprovedAt, tz);
    const verifiedAt = emp.verifiedAt ? new Date(emp.verifiedAt).toISOString() : '';
    const suspicious = Boolean(currentDoj && approvedDay && currentDoj === approvedDay);

    if (suspiciousOnly && !suspicious) continue;

    rows.push({
      emp_no: emp.emp_no,
      employee_name: emp.employee_name || '',
      current_doj: currentDoj || '',
      tenure_join_date: tenureDoj || '',
      verified_at: verifiedAt,
      salary_approved_at: approvedAt,
      suspicious: suspicious ? 'yes' : 'no',
    });
  }

  console.error(`Matched: ${rows.length} (of ${employees.length} approved in range)\n`);

  if (asCsv) {
    const headers = [
      'emp_no',
      'employee_name',
      'current_doj',
      'tenure_join_date',
      'verified_at',
      'salary_approved_at',
      'suspicious',
    ];
    console.log(headers.join(','));
    for (const r of rows) {
      console.log(headers.map((h) => csvEscape(r[h])).join(','));
    }
  } else {
    console.log('emp_no\tname\tcurrent_doj\ttenure_join_date\tapproved_at\tsuspicious');
    for (const r of rows) {
      console.log(
        [
          r.emp_no,
          r.employee_name,
          r.current_doj || '-',
          r.tenure_join_date || '-',
          r.salary_approved_at || '-',
          r.suspicious,
        ].join('\t')
      );
    }
  }

  if (rows.length) {
    console.error('\n--- emp_no list (copy) ---');
    console.error(rows.map((r) => r.emp_no).join(','));
  }

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
