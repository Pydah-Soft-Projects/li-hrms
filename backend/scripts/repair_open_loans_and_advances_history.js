/**
 * Repair all non-closed loans and salary advances: EMI, interest, totals,
 * payroll-anchored schedule, remaining balance, next payment (period end).
 *
 * Run:
 *   node backend/scripts/repair_open_loans_and_advances_history.js
 *   node backend/scripts/repair_open_loans_and_advances_history.js --dry-run
 *   node backend/scripts/repair_open_loans_and_advances_history.js --loans-only
 *   node backend/scripts/repair_open_loans_and_advances_history.js --advances-only
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { repairAllOpenLoansAndAdvances } = require('../loans/services/loanHistoryRepairService');

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const loansOnly = argv.includes('--loans-only');
  const advancesOnly = argv.includes('--advances-only');
  if (loansOnly && advancesOnly) {
    console.error('Use only one of --loans-only or --advances-only');
    process.exit(1);
  }
  return {
    dryRun,
    loans: !advancesOnly,
    advances: !loansOnly,
  };
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set MONGO_URI or MONGODB_URI');
    process.exit(1);
  }
  const { dryRun, loans, advances } = parseArgs(process.argv.slice(2));
  await mongoose.connect(uri);
  console.log(dryRun ? 'Dry run (no saves)' : 'Applying updates…');
  const summary = await repairAllOpenLoansAndAdvances({ loans, advances, dryRun });
  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
