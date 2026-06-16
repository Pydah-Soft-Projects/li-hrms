/**
 * Benchmark pay register Sync All for a payroll month.
 * Usage:
 *   node scripts/benchmark_pay_register_sync.js --month 2026-01 --sample 5
 *   node scripts/benchmark_pay_register_sync.js --month 2026-01 --bulk
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const { getPayrollDateRange } = require('../shared/utils/dateUtils');
const { buildPayRegisterEmployeeFilter } = require('../pay-register/services/payRegisterEmployeeFilter');
const {
  manualSyncPayRegister,
  bulkManualSyncPayRegister,
} = require('../pay-register/services/autoSyncService');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { month: '2026-01', sample: 0, bulk: false, concurrency: 20 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--month') out.month = args[++i];
    else if (args[i] === '--sample') out.sample = parseInt(args[++i], 10) || 3;
    else if (args[i] === '--bulk') out.bulk = true;
    else if (args[i] === '--concurrency') out.concurrency = parseInt(args[++i], 10) || 20;
  }
  return out;
}

async function getEmployeeIdsForMonth(month) {
  const [year, monthNum] = month.split('-').map(Number);
  const { startDate, endDate } = await getPayrollDateRange(year, monthNum);
  const rangeStart = new Date(startDate + 'T00:00:00.000Z');
  const rangeEnd = new Date(endDate + 'T23:59:59.999Z');
  const query = await buildPayRegisterEmployeeFilter(rangeStart, rangeEnd, {});
  const rows = await Employee.find(query).select('_id emp_no').lean();
  return { ids: rows.map((r) => String(r._id)), startDate, endDate, query };
}

async function timeOneSync(employeeId, month) {
  const start = process.hrtime.bigint();
  await manualSyncPayRegister(employeeId, month);
  return Number(process.hrtime.bigint() - start) / 1e6;
}

async function main() {
  const opts = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const { ids, startDate, endDate } = await getEmployeeIdsForMonth(opts.month);
  console.log('\n=== Pay Register Sync Benchmark ===');
  console.log(`Month: ${opts.month}  Payroll period: ${startDate} → ${endDate}`);
  console.log(`Employees in scope: ${ids.length}`);
  console.log(`Run at: ${new Date().toISOString()}\n`);

  if (opts.sample > 0 && ids.length > 0) {
    const sampleIds = ids.slice(0, Math.min(opts.sample, ids.length));
    console.log(`--- Per-employee sample (${sampleIds.length} employees) ---`);

    const timings = [];
    for (const id of sampleIds) {
      const ms = await timeOneSync(id, opts.month);
      timings.push(ms);
      console.log(`  Sync: ${ms.toFixed(0)}ms`);
    }
    const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
    const estSequential = (avgMs * ids.length) / 1000;
    console.log(`\n  Avg per employee: ${avgMs.toFixed(0)}ms`);
    console.log(`  Estimated sequential total (${ids.length} emps): ${(estSequential / 60).toFixed(1)} min`);
  }

  if (opts.bulk) {
    console.log(`\n--- Bulk sync ALL ${ids.length} employees (concurrency ${opts.concurrency}) ---`);
    const result = await bulkManualSyncPayRegister(opts.month, {
      employeeIds: ids,
      concurrency: opts.concurrency,
      forceEmployeeIds: [],
    });
    console.log('  Results:', JSON.stringify(result, null, 2));
    console.log(`\n  TOTAL wall time: ${(result.durationMs / 1000).toFixed(1)}s (${(result.durationMs / 60000).toFixed(2)} min)`);
    console.log(`  Per-employee phase: ${(result.perEmployeeMs / 1000).toFixed(1)}s`);
    console.log(`  Avg per employee: ${result.avgMsPerEmployee.toFixed(0)}ms`);
    console.log(`  Synced: ${result.synced} | Locked skipped: ${result.skippedLocked} | Failed: ${result.failed.length}`);
  } else if (!opts.sample) {
    console.log('Pass --sample N and/or --bulk to run timings.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
