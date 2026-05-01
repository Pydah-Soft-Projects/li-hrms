/**
 * Recalculate monthly summary for ALL active employees for a given month, or only
 * employees in one or more divisions (Mongo division_id).
 *
 * Populates totalDaysInMonth (pay period length), totalWeeklyOffs, totalHolidays,
 * totalPresentDays, totalPayableShifts, etc., so you can verify the monthly summary.
 *
 * Usage (from backend folder):
 *   node scripts/recalc_all_employees_monthly_summary.js
 *   MONTH=2026-02 node scripts/recalc_all_employees_monthly_summary.js
 *   DIVISION_IDS=507f1f77bcf86cd799439011,507f191e810c19729de860ea node scripts/recalc_all_employees_monthly_summary.js
 *   DIVISION_ID=507f1f77bcf86cd799439011 MONTH=2026-02 node scripts/recalc_all_employees_monthly_summary.js
 *   Interactive (TTY): if DIVISION_ID / DIVISION_IDS are omitted, the script prints divisions and you pick by number.
 *   CLEAR_FIRST=1 node scripts/recalc_all_employees_monthly_summary.js   # delete ALL summaries then recalc for MONTH (or current month)
 *   CLEAR_FIRST=1 MONTH=2025-03 node scripts/recalc_all_employees_monthly_summary.js
 *   # With DIVISION_IDS: CLEAR_FIRST deletes only that MONTH for employees in those divisions, then recalculates them.
 *   CLEAR_FIRST=1 DIVISION_IDS=<id> MONTH=2026-02 node scripts/recalc_all_employees_monthly_summary.js
 *
 * MONTH = YYYY-MM (calendar month). Pay period is resolved from payroll settings
 * (e.g. 26th–25th or 1st–31st) so the summary reflects the correct cycle.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const readline = require('readline');
const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const Division = require('../departments/model/Division');
const { calculateAllEmployeesSummary, deleteAllMonthlySummaries } = require('../attendance/services/summaryCalculationService');

function promptLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function parseDivisionIdsFromEnv() {
  const raw = process.env.DIVISION_IDS || process.env.DIVISION_ID || '';
  if (!String(raw).trim()) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function assertValidDivisionObjectIds(ids) {
  for (const id of ids) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error(`Invalid division ObjectId: ${id}`);
    }
  }
}

/**
 * Env DIVISION_ID / DIVISION_IDS wins. Otherwise, if stdin is a TTY, list divisions and prompt.
 * Otherwise (CI / piped): all active employees.
 */
async function resolveDivisionIds() {
  const envIds = parseDivisionIdsFromEnv();
  if (envIds.length > 0) {
    assertValidDivisionObjectIds(envIds);
    return envIds;
  }

  if (!process.stdin.isTTY) {
    console.log('Non-interactive stdin and no DIVISION_IDS: processing all active employees.\n');
    return [];
  }

  const divisions = await Division.find({})
    .sort({ name: 1 })
    .select('_id name code isActive')
    .lean();

  if (!divisions.length) {
    console.log('No divisions in database; processing all active employees.\n');
    return [];
  }

  console.log('\n--- Divisions (employees are filtered by division_id) ---\n');
  divisions.forEach((d, i) => {
    const active = d.isActive === false ? ' [inactive]' : '';
    const code = d.code ? String(d.code) : '-';
    console.log(`  ${String(i + 1).padStart(3)}  ${code.padEnd(8)}  ${d.name}${active}`);
    console.log(`       id: ${d._id}`);
  });
  console.log('\n  0  =  all active employees (no division filter)');
  console.log('  q  =  quit\n');

  const raw = (await promptLine('Enter choice (e.g. 2 or 1,3,4 or 0 for all): ')).trim();
  if (/^q$/i.test(raw)) {
    throw new Error('Cancelled.');
  }
  if (!raw || raw === '0' || /^all$/i.test(raw)) {
    return [];
  }

  const parts = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const chosenIds = [];
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (Number.isNaN(n) || n < 1 || n > divisions.length) {
      throw new Error(`Invalid selection "${p}". Use 1–${divisions.length}, comma-separated, or 0 for all.`);
    }
    chosenIds.push(String(divisions[n - 1]._id));
  }
  return [...new Set(chosenIds)];
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.\n');

    let monthStr = process.env.MONTH || '2026-04';
    if (!monthStr || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr)) {
      const now = new Date();
      monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      console.log('Using current month:', monthStr);
    } else {
      console.log('Using MONTH:', monthStr);
    }
    const [year, monthNumber] = monthStr.split('-').map(Number);

    const divisionIds = await resolveDivisionIds();
    const divisionObjectIds = divisionIds.map((id) => new mongoose.Types.ObjectId(id));
    const calcOptions = divisionIds.length > 0 ? { divisionIds } : {};

    if (divisionIds.length > 0) {
      console.log('DIVISION filter:', divisionIds.length, 'division_id(s):', divisionIds.join(', '));
    } else {
      console.log('Scope: all active employees (no division filter).');
    }

    const clearFirst = process.env.CLEAR_FIRST === '1' || process.env.CLEAR_FIRST === 'true';
    if (clearFirst) {
      if (divisionIds.length > 0) {
        console.log(
          'CLEAR_FIRST=1 (scoped): Deleting monthly summaries for',
          monthStr,
          'for employees in the given division(s)...'
        );
        const employeeIds = await Employee.find({
          is_active: { $ne: false },
          division_id: { $in: divisionObjectIds },
        }).distinct('_id');
        const { deletedCount } = await deleteAllMonthlySummaries({ year, monthNumber, employeeIds });
        console.log('Deleted', deletedCount, 'summary/summaries for', employeeIds.length, 'employee(s).\n');
      } else {
        console.log('CLEAR_FIRST=1: Deleting ALL monthly attendance summaries...');
        const { deletedCount } = await deleteAllMonthlySummaries();
        console.log('Deleted', deletedCount, 'summary/summaries.\n');
      }
    }

    if (divisionIds.length > 0) {
      console.log('\nRecalculating monthly summary for active employees in those division(s)...');
    } else {
      console.log('\nRecalculating monthly summary for ALL active employees...');
    }
    console.log('Year:', year, 'Month:', monthNumber, '(' + monthStr + ')\n');

    const results = await calculateAllEmployeesSummary(year, monthNumber, calcOptions);

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log('\n--- Done ---');
    console.log('Total:', results.length, '| Success:', successCount, '| Failed:', failureCount);

    if (failureCount > 0) {
      console.log('\nFailed employees:');
      results.filter((r) => !r.success).forEach((r) => console.log('  ', r.employee, r.error));
    }

    if (successCount > 0 && results[0].summary) {
      const s = results.find((r) => r.success)?.summary;
      console.log('\nSample summary (first success):', s?.emp_no, {
        month: s?.month,
        totalDaysInMonth: s?.totalDaysInMonth,
        totalWeeklyOffs: s?.totalWeeklyOffs,
        totalHolidays: s?.totalHolidays,
        totalPresentDays: s?.totalPresentDays,
        totalPayableShifts: s?.totalPayableShifts,
      });
    }

    console.log('\nYou can verify via GET /api/attendance/monthly-summary?month=' + monthStr);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
