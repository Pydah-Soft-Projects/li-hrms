const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Loan = require('../loans/model/Loan');
const Notification = require('../notifications/model/Notification');
const PayrollRecord = require('../payroll/model/PayrollRecord');
const SecondSalaryRecord = require('../payroll/model/SecondSalaryRecord');

function askQuestion(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

function parseArgs() {
  const result = {
    execute: false,
    cutoff: null,
    includeAdvances: false,
    yes: false,
    interactive: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--execute') {
      result.execute = true;
    } else if (arg === '--include-advances') {
      result.includeAdvances = true;
    } else if (arg === '--yes') {
      result.yes = true;
    } else if (arg === '--interactive') {
      result.interactive = true;
    } else if (arg.startsWith('--cutoff=')) {
      result.cutoff = arg.slice('--cutoff='.length).trim();
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
  }

  return result;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function usage() {
  console.log('\nUsage:');
  console.log('  node backend/scripts/delete_loan_applications_by_applied_date.js --cutoff=YYYY-MM-DD [--include-advances] [--execute] [--yes]');
  console.log('\nOptions:');
  console.log('  --cutoff=YYYY-MM-DD    Delete loans with appliedAt <= cutoff date');
  console.log('  --include-advances     Also include salary advances in the deletion set');
  console.log('  --execute              Perform deletion. Without this, the script runs dry-run only.');
  console.log('  --yes                  Skip interactive confirmation when --execute is used.');
  console.log('  --help, -h             Show this help message.');
  console.log('');
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    usage();
    process.exit(0);
  }

  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is missing in backend/.env');
    process.exit(1);
  }

  let cutoff = args.cutoff;
  if (!cutoff || args.interactive) {
    cutoff = await askQuestion('Cutoff applied date (YYYY-MM-DD): ');
  }

  if (!cutoff) {
    console.error('ERROR: Cutoff date is required. Use --cutoff=YYYY-MM-DD or enter it interactively.');
    process.exit(1);
  }

  const parsedDate = new Date(cutoff);
  if (Number.isNaN(parsedDate.getTime()) || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(cutoff)) {
    console.error('ERROR: Invalid cutoff date. Use the format YYYY-MM-DD.');
    process.exit(1);
  }

  let includeAdvances = args.includeAdvances;
  if (!args.includeAdvances || args.interactive) {
    const answer = await askQuestion('Delete salary advances too? (yes/no) [no]: ');
    includeAdvances = String(answer || 'no').toLowerCase().startsWith('y');
  }

  const dryRun = !args.execute;
  const confirmRequired = args.execute && !args.yes;

  const queryTypes = ['loan'];
  if (includeAdvances) queryTypes.push('salary_advance');

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected to MongoDB ${mongoose.connection.host}/${mongoose.connection.name}`);

  const filter = {
    requestType: { $in: queryTypes },
    appliedAt: { $lte: new Date(`${cutoff}T23:59:59.999Z`) },
  };

  const loans = await Loan.find(filter).select('requestType emp_no appliedAt status').lean();
  const loanIds = loans.map((loan) => loan._id);

  console.log(`\nLoan deletion target:`);
  console.log(`  cutoff: ${formatDate(parsedDate)}`);
  console.log(`  include salary advances: ${includeAdvances ? 'yes' : 'no'}`);
  console.log(`  loan applications found: ${loans.length}`);
  console.log(`  loan ids: ${loanIds.length > 0 ? loanIds.slice(0, 10).join(', ') + (loanIds.length > 10 ? ', ...' : '') : 'none'}`);

  if (loans.length > 0) {
    const summary = loans.reduce((acc, loan) => {
      const type = loan.requestType === 'salary_advance' ? 'advance' : 'loan';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    console.log('  summary:', JSON.stringify(summary));
  }

  if (dryRun) {
    console.log('\nDry run only. No changes will be executed.');
  }

  if (loans.length === 0) {
    console.log('\nNothing to delete. Exiting.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (confirmRequired) {
    const approval = await askQuestion('\nThis will permanently delete loan application documents and related linked references. Type YES to continue: ');
    if (approval !== 'YES') {
      console.log('Aborted by user. No changes made.');
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  const deleteResults = [];

  const doAction = async (label, fn) => {
    if (dryRun) {
      const item = await fn(true);
      deleteResults.push({ label, ...item });
      return item;
    }
    const item = await fn(false);
    deleteResults.push({ label, ...item });
    return item;
  };

  await doAction('Loan documents', async (dry) => {
    if (dry) {
      return { count: loans.length };
    }
    const result = await Loan.deleteMany({ _id: { $in: loanIds } });
    return { deletedCount: result.deletedCount };
  });

  await doAction('Loan notifications', async (dry) => {
    const modules = ['loan'];
    if (includeAdvances) modules.push('salary_advance');
    const query = { module: { $in: modules }, entityId: { $in: loanIds } };
    if (dry) {
      return { count: await Notification.countDocuments(query) };
    }
    const result = await Notification.deleteMany(query);
    return { deletedCount: result.deletedCount };
  });

  await doAction('PayrollRecords: remove loan EMI breakdown', async (dry) => {
    const query = { 'loanAdvance.emiBreakdown.loanId': { $in: loanIds } };
    if (dry) {
      return { affected: await PayrollRecord.countDocuments(query) };
    }
    const result = await PayrollRecord.updateMany(query, {
      $pull: { 'loanAdvance.emiBreakdown': { loanId: { $in: loanIds } } },
    });
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
  });

  await doAction('PayrollRecords: remove advance breakdown', async (dry) => {
    const query = { 'loanAdvance.advanceBreakdown.advanceId': { $in: loanIds } };
    if (dry) {
      return { affected: await PayrollRecord.countDocuments(query) };
    }
    const result = await PayrollRecord.updateMany(query, {
      $pull: { 'loanAdvance.advanceBreakdown': { advanceId: { $in: loanIds } } },
    });
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
  });

  await doAction('SecondSalaryRecords: remove loan EMI breakdown', async (dry) => {
    const query = { 'loanAdvance.emiBreakdown.loanId': { $in: loanIds } };
    if (dry) {
      return { affected: await SecondSalaryRecord.countDocuments(query) };
    }
    const result = await SecondSalaryRecord.updateMany(query, {
      $pull: { 'loanAdvance.emiBreakdown': { loanId: { $in: loanIds } } },
    });
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
  });

  await doAction('SecondSalaryRecords: remove advance breakdown', async (dry) => {
    const query = { 'loanAdvance.advanceBreakdown.advanceId': { $in: loanIds } };
    if (dry) {
      return { affected: await SecondSalaryRecord.countDocuments(query) };
    }
    const result = await SecondSalaryRecord.updateMany(query, {
      $pull: { 'loanAdvance.advanceBreakdown': { advanceId: { $in: loanIds } } },
    });
    return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
  });

  if (dryRun) {
    console.log('\nDry-run summary:');
  } else {
    console.log('\nExecution summary:');
  }
  deleteResults.forEach((item) => {
    console.log(`  ${item.label}:`, JSON.stringify(item));
  });

  await mongoose.disconnect();
  console.log(dryRun ? '\nDry-run complete. No changes were written.' : '\nDeletion complete.');
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
