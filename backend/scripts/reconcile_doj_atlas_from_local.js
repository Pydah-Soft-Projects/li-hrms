/**
 * Dual-DB reconcile: Atlas (prod) salary-finalized today → Local DOJ → update Atlas.
 *
 * 1) Connect to Atlas, list employees salary-finalized on the given day (IST default)
 * 2) Look up the same emp_no on Local DB and read their doj (source of truth)
 * 3) Dry-run prints Atlas vs Local. With --apply, writes Local doj onto Atlas
 *    Employee.doj + latest approved Application.doj
 *
 * Env (backend/.env):
 *   MONGODB_URI_ATLAS=mongodb+srv://...   (production)
 *   MONGODB_URI_LOCAL=mongodb://127.0.0.1:27017/...  (local with good DOJs)
 *
 * Or CLI:
 *   --atlas-uri=...
 *   --local-uri=...
 *
 * Usage (from backend/):
 *   node scripts/reconcile_doj_atlas_from_local.js --check --date=2026-08-01
 *   node scripts/reconcile_doj_atlas_from_local.js --apply --date=2026-08-01
 *   node scripts/reconcile_doj_atlas_from_local.js --check --from=2026-07-28 --to=2026-08-01
 *   node scripts/reconcile_doj_atlas_from_local.js --check --date=2026-08-01 --suspicious-only
 *
 * Optional:
 *   --tz=IST|UTC
 *   --suspicious-only   only Atlas rows where doj day == approval day
 *   --emp=111142,111168
 *   --csv
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

function maskUri(uri) {
  if (!uri) return '(missing)';
  return String(uri).replace(/\/\/([^@/]+)@/, '//***@');
}

function ymdInTz(d, tz) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  if (tz === 'UTC') return dt.toISOString().slice(0, 10);
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

function dayRangeToUtcBounds(fromYmd, toYmd, tz) {
  if (tz === 'UTC') {
    return {
      start: new Date(`${fromYmd}T00:00:00.000Z`),
      end: new Date(`${toYmd}T23:59:59.999Z`),
    };
  }
  return {
    start: new Date(`${fromYmd}T00:00:00.000+05:30`),
    end: new Date(`${toYmd}T23:59:59.999+05:30`),
  };
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseDateOnly(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  // Store as UTC midnight of that calendar day (same pattern as approveSalary date inputs)
  return new Date(`${ymd}T00:00:00.000Z`);
}

async function main() {
  const doApply = hasFlag('--apply');
  const asCsv = hasFlag('--csv');
  const suspiciousOnly = hasFlag('--suspicious-only');
  const tz = (argValue('--tz') || 'IST').toUpperCase() === 'UTC' ? 'UTC' : 'IST';
  const empFilter = (argValue('--emp') || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const atlasUri =
    argValue('--atlas-uri') || process.env.MONGODB_ATLAS_URI || process.env.ATLAS_MONGODB_URI || '';
  const localUri =
    argValue('--local-uri') || process.env.MONGODB_URI || process.env.LOCAL_MONGODB_URI || '';

  if (!atlasUri || !localUri) {
    console.error('Need both Atlas and Local Mongo URIs.');
    console.error('Set in backend/.env:');
    console.error('  MONGODB_URI_ATLAS=mongodb+srv://...');
    console.error('  MONGODB_URI_LOCAL=mongodb://127.0.0.1:27017/...');
    console.error('Or pass --atlas-uri=... --local-uri=...');
    process.exit(1);
  }

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

  console.error(`Mode: ${doApply ? 'APPLY (will write Atlas)' : 'CHECK (dry-run)'}`);
  console.error(`Atlas: ${maskUri(atlasUri)}`);
  console.error(`Local: ${maskUri(localUri)}`);
  console.error(`salaryApprovedAt (${tz}): ${fromYmd} → ${toYmd}`);
  console.error(`UTC bounds: ${start.toISOString()} → ${end.toISOString()}`);

  const atlasConn = await mongoose.createConnection(atlasUri).asPromise();
  const localConn = await mongoose.createConnection(localUri).asPromise();

  const AtlasEmployee = atlasConn.model('Employee', Employee.schema);
  const AtlasApplication = atlasConn.model('EmployeeApplication', EmployeeApplication.schema);
  const LocalEmployee = localConn.model('Employee', Employee.schema);

  try {
    const atlasQuery = {
      salaryStatus: 'approved',
      salaryApprovedAt: { $gte: start, $lte: end },
    };
    if (empFilter.length) atlasQuery.emp_no = { $in: empFilter };

    const atlasEmps = await AtlasEmployee.find(atlasQuery)
      .select('emp_no employee_name doj salaryApprovedAt verifiedAt')
      .sort({ salaryApprovedAt: 1 })
      .lean();

    console.error(`Atlas salary-finalized in range: ${atlasEmps.length}`);

    const empNos = atlasEmps.map((e) => String(e.emp_no || '').toUpperCase()).filter(Boolean);
    const localEmps = empNos.length
      ? await LocalEmployee.find({ emp_no: { $in: empNos } })
          .select('emp_no employee_name doj')
          .lean()
      : [];
    const localByEmp = new Map(
      localEmps.map((e) => [String(e.emp_no || '').toUpperCase(), e])
    );

    const rows = [];
    for (const a of atlasEmps) {
      const empNo = String(a.emp_no || '').toUpperCase();
      const atlasDoj = ymdInTz(a.doj, tz);
      const approvedDay = ymdInTz(a.salaryApprovedAt, tz);
      const suspicious = Boolean(atlasDoj && approvedDay && atlasDoj === approvedDay);
      if (suspiciousOnly && !suspicious) continue;

      const local = localByEmp.get(empNo);
      const localDoj = local ? ymdInTz(local.doj, tz) : null;
      const needsUpdate = Boolean(localDoj && atlasDoj !== localDoj);
      const missingLocal = !local;

      rows.push({
        emp_no: empNo,
        employee_name: a.employee_name || local?.employee_name || '',
        atlas_doj: atlasDoj || '',
        local_doj: localDoj || '',
        salary_approved_at: a.salaryApprovedAt ? new Date(a.salaryApprovedAt).toISOString() : '',
        suspicious: suspicious ? 'yes' : 'no',
        action: missingLocal ? 'MISSING_ON_LOCAL' : needsUpdate ? 'UPDATE' : 'SAME',
      });
    }

    const toUpdate = rows.filter((r) => r.action === 'UPDATE');
    const missing = rows.filter((r) => r.action === 'MISSING_ON_LOCAL');
    const same = rows.filter((r) => r.action === 'SAME');

    console.error('\n=== Summary ===');
    console.error(`Compared: ${rows.length}`);
    console.error(`Need Atlas update (local doj differs): ${toUpdate.length}`);
    console.error(`Already same: ${same.length}`);
    console.error(`Missing on local: ${missing.length}`);

    if (asCsv) {
      const headers = [
        'emp_no',
        'employee_name',
        'atlas_doj',
        'local_doj',
        'salary_approved_at',
        'suspicious',
        'action',
      ];
      console.log(headers.join(','));
      for (const r of rows) {
        console.log(headers.map((h) => csvEscape(r[h])).join(','));
      }
    } else {
      console.log('emp_no\tname\tatlas_doj\tlocal_doj\taction\tapproved_at\tsuspicious');
      for (const r of rows) {
        console.log(
          [
            r.emp_no,
            r.employee_name,
            r.atlas_doj || '-',
            r.local_doj || '-',
            r.action,
            r.salary_approved_at || '-',
            r.suspicious,
          ].join('\t')
        );
      }
    }

    if (toUpdate.length) {
      console.error('\n--- Will set Atlas doj from Local ---');
      for (const r of toUpdate) {
        console.error(`  ${r.emp_no} ${r.employee_name}: ${r.atlas_doj || '(empty)'} → ${r.local_doj}`);
      }
      console.error('emp_nos: ' + toUpdate.map((r) => r.emp_no).join(','));
    }

    if (!doApply) {
      console.error('\nDry-run only. Re-run with --apply to update Atlas.');
      return;
    }

    let updated = 0;
    for (const r of toUpdate) {
      const restoreDate = parseDateOnly(r.local_doj);
      if (!restoreDate) continue;

      const emp = await AtlasEmployee.findOne({ emp_no: r.emp_no });
      if (!emp) continue;
      emp.doj = restoreDate;
      await emp.save();

      const app = await AtlasApplication.findOne({
        emp_no: r.emp_no,
        status: 'approved',
      }).sort({ approvedAt: -1 });
      if (app) {
        app.doj = restoreDate;
        await app.save();
      }

      updated += 1;
      console.error(`Updated Atlas ${r.emp_no}: ${r.atlas_doj || '(empty)'} → ${r.local_doj}`);
    }

    console.error(`\nDone. Updated ${updated} Atlas employee(s).`);
  } finally {
    await Promise.allSettled([atlasConn.close(), localConn.close()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
