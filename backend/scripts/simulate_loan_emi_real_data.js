/**
 * Real-DB simulation: all EMI policy + loan application scenarios.
 * Creates tagged loan applications for a real employee so you can open them in UI.
 *
 * Run: node backend/scripts/simulate_loan_emi_real_data.js
 * Cleanup only: node backend/scripts/simulate_loan_emi_real_data.js --cleanup
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Loan = require('../loans/model/Loan');
const LoanSettings = require('../loans/model/LoanSettings');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
const {
  buildEmiApplicationPreview,
  getEmiPolicyFromSettings,
} = require('../loans/services/loanEmiPolicyService');
const { nextLoanApplicationFormNumber } = require('../loans/services/loanApplicationFormSequence');
const { getPresentPayPeriod } = require('../shared/utils/dateUtils');

const SIM_TAG = '[SIM-EMI]';
const SIM_MARKER = 'SIM_EMI_SCENARIO';

const SCENARIOS = [
  {
    id: 'S1',
    title: 'Collect all EMIs · Pre-EMI ON',
    settings: {
      multiEmiCollectionMode: 'collect_all',
      multiEmiPriority: 'oldest_first',
      maxCombinedEmiAmount: null,
      accrueInterestOnSkippedEmi: true,
      preEmiInterestEnabled: true,
    },
    loan: { amount: 10000, duration: 12, reason: 'Simulation S1 collect_all pre-EMI on' },
  },
  {
    id: 'S2',
    title: 'Collect all EMIs · Pre-EMI OFF',
    settings: {
      multiEmiCollectionMode: 'collect_all',
      multiEmiPriority: 'oldest_first',
      maxCombinedEmiAmount: null,
      accrueInterestOnSkippedEmi: true,
      preEmiInterestEnabled: false,
    },
    loan: { amount: 10000, duration: 12, reason: 'Simulation S2 collect_all pre-EMI off' },
  },
  {
    id: 'S3',
    title: 'Single EMI · oldest first · skip interest ON · Pre-EMI ON',
    settings: {
      multiEmiCollectionMode: 'single_emi_only',
      multiEmiPriority: 'oldest_first',
      maxCombinedEmiAmount: null,
      accrueInterestOnSkippedEmi: true,
      preEmiInterestEnabled: true,
    },
    loan: { amount: 12000, duration: 12, reason: 'Simulation S3 single oldest skip-ON' },
  },
  {
    id: 'S4',
    title: 'Single EMI · oldest first · skip interest OFF · Pre-EMI ON',
    settings: {
      multiEmiCollectionMode: 'single_emi_only',
      multiEmiPriority: 'oldest_first',
      maxCombinedEmiAmount: null,
      accrueInterestOnSkippedEmi: false,
      preEmiInterestEnabled: true,
    },
    loan: { amount: 12000, duration: 12, reason: 'Simulation S4 single oldest skip-OFF' },
  },
  {
    id: 'S5',
    title: 'Single EMI · newest first · Pre-EMI ON',
    settings: {
      multiEmiCollectionMode: 'single_emi_only',
      multiEmiPriority: 'newest_first',
      maxCombinedEmiAmount: null,
      accrueInterestOnSkippedEmi: true,
      preEmiInterestEnabled: true,
    },
    loan: { amount: 15000, duration: 10, reason: 'Simulation S5 single newest' },
  },
  {
    id: 'S6',
    title: 'Single EMI · highest EMI first · Pre-EMI ON',
    settings: {
      multiEmiCollectionMode: 'single_emi_only',
      multiEmiPriority: 'highest_emi_first',
      maxCombinedEmiAmount: null,
      accrueInterestOnSkippedEmi: true,
      preEmiInterestEnabled: true,
    },
    loan: { amount: 25000, duration: 12, reason: 'Simulation S6 single highest (large EMI)' },
  },
  {
    id: 'S7',
    title: 'Max combined cap ₹5,000 · oldest · Pre-EMI ON (may delay)',
    settings: {
      multiEmiCollectionMode: 'max_combined_cap',
      multiEmiPriority: 'oldest_first',
      maxCombinedEmiAmount: 5000,
      accrueInterestOnSkippedEmi: true,
      preEmiInterestEnabled: true,
    },
    loan: { amount: 20000, duration: 12, reason: 'Simulation S7 cap 5k oldest' },
  },
  {
    id: 'S8',
    title: 'Max combined cap ₹8,000 · highest · Pre-EMI ON',
    settings: {
      multiEmiCollectionMode: 'max_combined_cap',
      multiEmiPriority: 'highest_emi_first',
      maxCombinedEmiAmount: 8000,
      accrueInterestOnSkippedEmi: true,
      preEmiInterestEnabled: true,
    },
    loan: { amount: 18000, duration: 12, reason: 'Simulation S8 cap 8k highest' },
  },
  {
    id: 'S9',
    title: 'Max combined cap ₹50,000 · fits immediately · Pre-EMI ON',
    settings: {
      multiEmiCollectionMode: 'max_combined_cap',
      multiEmiPriority: 'oldest_first',
      maxCombinedEmiAmount: 50000,
      accrueInterestOnSkippedEmi: false,
      preEmiInterestEnabled: true,
    },
    loan: { amount: 8000, duration: 6, reason: 'Simulation S9 high cap fits now' },
  },
  {
    id: 'S10',
    title: 'Single EMI · oldest · Pre-EMI OFF (delayed commence, no pre interest)',
    settings: {
      multiEmiCollectionMode: 'single_emi_only',
      multiEmiPriority: 'oldest_first',
      maxCombinedEmiAmount: null,
      accrueInterestOnSkippedEmi: true,
      preEmiInterestEnabled: false,
    },
    loan: { amount: 10000, duration: 12, reason: 'Simulation S10 single oldest pre-EMI off' },
  },
];

function money(n) {
  return `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
}

function line(ch = '═', n = 78) {
  return ch.repeat(n);
}

async function cleanupSimLoans(employeeId) {
  const q = {
    remarks: { $regex: SIM_MARKER },
    ...(employeeId ? { employeeId } : {}),
  };
  const found = await Loan.find(q).select('_id applicationFormNumber status remarks');
  if (!found.length) {
    console.log('  No prior simulation loans to cleanup.');
    return { deleted: 0 };
  }
  const res = await Loan.deleteMany(q);
  console.log(`  Deleted ${res.deletedCount} prior simulation loan(s).`);
  return { deleted: res.deletedCount, ids: found.map((l) => String(l._id)) };
}

async function pickEmployee() {
  // Prefer a real active employee with salary; avoid known test-only emp if better exists
  let emp = await Employee.findOne({
    is_active: { $ne: false },
    emp_no: { $nin: ['TEST_LOAN_EMP'] },
    $or: [{ gross_salary: { $gte: 15000 } }, { basic_salary: { $gte: 10000 } }],
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (!emp) {
    emp = await Employee.findOne({ emp_no: 'TEST_LOAN_EMP' }).lean();
  }
  if (!emp) {
    emp = await Employee.findOne({}).lean();
  }
  return emp;
}

async function ensureBaselineActiveLoans(employee, actorUser, interestStartYm) {
  // Two "existing" active loans so single/cap policies have real competition
  const baselines = [
    {
      key: 'BASE-A',
      amount: 24000,
      duration: 12,
      emiAmount: 2200,
      remaining: 17600,
      paid: 4,
      appliedAt: new Date('2025-01-15'),
      reason: `${SIM_TAG} Baseline older loan A`,
    },
    {
      key: 'BASE-B',
      amount: 18000,
      duration: 12,
      emiAmount: 1650,
      remaining: 13200,
      paid: 4,
      appliedAt: new Date('2025-06-15'),
      reason: `${SIM_TAG} Baseline newer loan B`,
    },
  ];

  const created = [];
  for (const b of baselines) {
    const formNo = await nextLoanApplicationFormNumber();
    const totalAmount = b.amount; // simplified outstanding principal path
    const doc = await Loan.create({
      employeeId: employee._id,
      emp_no: employee.emp_no,
      requestType: 'loan',
      amount: b.amount,
      originalAmount: b.amount,
      reason: b.reason,
      duration: b.duration,
      interestAmount: 0,
      remarks: `${SIM_MARKER} ${b.key} baseline competing loan`,
      department: employee.department_id || employee.department,
      designation: employee.designation_id || employee.designation,
      division_id: employee.division_id || employee.division,
      appliedBy: actorUser._id,
      appliedAt: b.appliedAt,
      status: 'active',
      applicationFormNumber: formNo,
      loanConfig: {
        interestRate: 10,
        emiAmount: b.emiAmount,
        finalEmiAmount: b.emiAmount,
        totalInterest: 0,
        tenureInterest: 0,
        preEmiInterest: 0,
        preEmiMonths: 0,
        totalAmount: b.amount,
        interestStartPayrollMonth: interestStartYm,
        emiCommencePayrollMonth: interestStartYm,
        emiCommenceReason: 'Baseline simulation loan already running',
        requestedDuration: b.duration,
        regularInstallmentCount: b.duration,
      },
      repayment: {
        totalPaid: b.amount - b.remaining,
        remainingBalance: b.remaining,
        installmentsPaid: b.paid,
        totalInstallments: b.duration,
      },
      disbursement: {
        disbursedAt: b.appliedAt,
        disbursedBy: actorUser._id,
        disbursementMethod: 'bank_transfer',
      },
      workflow: {
        currentStep: 'completed',
        nextApprover: null,
        isCompleted: true,
        history: [],
      },
      approvals: {
        final: {
          status: 'approved',
          approvedBy: actorUser._id,
          approvedAt: b.appliedAt,
          firstDeductionPayrollMonth: interestStartYm,
        },
      },
    });
    created.push({
      key: b.key,
      loanId: String(doc._id),
      formNo,
      emi: b.emiAmount,
      remaining: b.remaining,
      installmentsLeft: b.duration - b.paid,
    });
  }
  return created;
}

async function applyScenarioSettings(settingsDoc, patch) {
  settingsDoc.settings = settingsDoc.settings || {};
  Object.assign(settingsDoc.settings, patch);
  settingsDoc.markModified('settings');
  await settingsDoc.save();
}

async function createScenarioLoan(employee, actorUser, scenario, preview) {
  const formNo = await nextLoanApplicationFormNumber();
  const doc = await Loan.create({
    employeeId: employee._id,
    emp_no: employee.emp_no,
    requestType: 'loan',
    amount: scenario.loan.amount,
    originalAmount: scenario.loan.amount,
    reason: `${SIM_TAG} ${scenario.id}: ${scenario.loan.reason}`,
    duration: scenario.loan.duration,
    interestAmount: preview.totalInterest || 0,
    remarks: `${SIM_MARKER} ${scenario.id} | mode=${scenario.settings.multiEmiCollectionMode} | priority=${scenario.settings.multiEmiPriority} | preEmi=${scenario.settings.preEmiInterestEnabled} | skipInt=${scenario.settings.accrueInterestOnSkippedEmi}`,
    department: employee.department_id || employee.department,
    designation: employee.designation_id || employee.designation,
    division_id: employee.division_id || employee.division,
    appliedBy: actorUser._id,
    appliedAt: new Date(),
    status: 'pending',
    applicationFormNumber: formNo,
    loanConfig: {
      interestRate: preview.interestRate,
      emiAmount: preview.emiAmount,
      finalEmiAmount: preview.finalEmiAmount ?? preview.emiAmount,
      installmentSchedule: preview.installmentSchedule || [],
      regularInstallmentCount: preview.regularInstallmentCount || 0,
      requestedDuration: preview.requestedDuration || scenario.loan.duration,
      totalInterest: preview.totalInterest,
      tenureInterest: preview.tenureInterest,
      preEmiInterest: preview.preEmiInterest,
      preEmiMonths: preview.preEmiMonths,
      totalAmount: preview.totalAmount,
      interestStartPayrollMonth: preview.interestStartPayrollMonth,
      emiCommencePayrollMonth: preview.emiCommencePayrollMonth,
      emiCommenceReason: preview.reason,
    },
    repayment: {
      totalPaid: 0,
      remainingBalance: preview.totalAmount,
      installmentsPaid: 0,
      totalInstallments: preview.totalInstallments || scenario.loan.duration,
    },
    workflow: {
      currentStep: 'hod',
      nextApprover: 'hod',
      isCompleted: false,
      history: [
        {
          step: 'applied',
          action: 'submitted',
          actionBy: actorUser._id,
          actionByName: actorUser.name || 'Simulation',
          comments: `Auto-created by real-data EMI simulation (${scenario.id})`,
          timestamp: new Date(),
        },
      ],
    },
  });

  return doc;
}

async function main() {
  const cleanupOnly = process.argv.includes('--cleanup');
  const keepSettingsArg = process.argv.find((a) => a.startsWith('--keep-settings'));
  // e.g. --keep-settings=S3  or --keep-settings (keeps last scenario)
  const keepSettingsId = keepSettingsArg
    ? keepSettingsArg.includes('=')
      ? keepSettingsArg.split('=')[1]
      : SCENARIOS[SCENARIOS.length - 1].id
    : null;

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(line());
  console.log('  REAL-DATA LOAN EMI SCENARIO SIMULATION');
  console.log('  Competing loans counted: disbursed/active ONLY (not pending/approved)');
  console.log(line());

  const employee = await pickEmployee();
  if (!employee) {
    console.error('No employee found in database.');
    process.exit(1);
  }

  const actor =
    (await User.findOne({ role: 'super_admin' })) ||
    (await User.findOne({ role: 'hr' })) ||
    (await User.findOne({}));

  if (!actor) {
    console.error('No user found to act as applicant.');
    process.exit(1);
  }

  console.log(`\nEmployee: ${employee.employee_name || employee.first_name || '—'} (${employee.emp_no})`);
  console.log(`EmployeeId: ${employee._id}`);
  console.log(`Salary: gross=${employee.gross_salary ?? '—'} basic=${employee.basic_salary ?? '—'}`);
  console.log(`Actor: ${actor.name || actor.email} (${actor.role})`);

  console.log('\nCleanup prior simulation loans…');
  await cleanupSimLoans(employee._id);

  if (cleanupOnly) {
    await mongoose.disconnect();
    console.log('\nCleanup done.');
    return;
  }

  const settingsDoc = await LoanSettings.findOne({ type: 'loan', isActive: true });
  if (!settingsDoc) {
    console.error('No active loan settings found.');
    process.exit(1);
  }

  const originalPolicy = {
    multiEmiCollectionMode: settingsDoc.settings?.multiEmiCollectionMode,
    multiEmiPriority: settingsDoc.settings?.multiEmiPriority,
    maxCombinedEmiAmount: settingsDoc.settings?.maxCombinedEmiAmount,
    accrueInterestOnSkippedEmi: settingsDoc.settings?.accrueInterestOnSkippedEmi,
    preEmiInterestEnabled: settingsDoc.settings?.preEmiInterestEnabled,
  };

  const present = await getPresentPayPeriod();
  const interestStartYm =
    present?.payrollMonthKey ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  console.log(`\nPresent payroll month: ${interestStartYm}`);
  console.log('Creating baseline DISBURSED/ACTIVE loans (only these compete for multi-EMI)…');
  const baselines = await ensureBaselineActiveLoans(employee, actor, interestStartYm);
  for (const b of baselines) {
    console.log(
      `  ${b.key}: form #${b.formNo} · EMI ${money(b.emi)} · remaining ${money(b.remaining)} · ${b.installmentsLeft} installments left · id=${b.loanId}`
    );
  }

  const results = [];
  let keptScenario = null;

  console.log(`\n${line('─')}`);
  console.log('  FOR EACH SCENARIO: UPDATE Loan Settings in DB → then create application');
  console.log(line('─'));

  try {
    for (const scenario of SCENARIOS) {
      // 1) Persist settings for this scenario (so Settings UI / API would show this mode)
      await applyScenarioSettings(settingsDoc, scenario.settings);
      const verified = await LoanSettings.findOne({ type: 'loan', isActive: true }).lean();
      const dbMode = verified?.settings?.multiEmiCollectionMode;
      const dbPriority = verified?.settings?.multiEmiPriority;
      const dbCap = verified?.settings?.maxCombinedEmiAmount;
      const dbPre = verified?.settings?.preEmiInterestEnabled;
      const dbSkip = verified?.settings?.accrueInterestOnSkippedEmi;

      console.log(`\n[${scenario.id}] SETTINGS SAVED TO DB:`);
      console.log(
        `  mode=${dbMode} | priority=${dbPriority} | cap=${dbCap ?? 'null'} | preEmi=${dbPre} | skipInterest=${dbSkip}`
      );
      if (dbMode !== scenario.settings.multiEmiCollectionMode) {
        throw new Error(`Settings verify failed for ${scenario.id}: expected ${scenario.settings.multiEmiCollectionMode}, got ${dbMode}`);
      }

      const interestRateForSim = 10;
      const preview = await buildEmiApplicationPreview({
        employeeId: employee._id,
        amount: scenario.loan.amount,
        duration: scenario.loan.duration,
        interestRate: interestRateForSim,
        interestStartPayrollMonth: interestStartYm,
        policy: {
          multiEmiCollectionMode: scenario.settings.multiEmiCollectionMode,
          multiEmiPriority: scenario.settings.multiEmiPriority,
          maxCombinedEmiAmount: scenario.settings.maxCombinedEmiAmount,
          accrueInterestOnSkippedEmi: scenario.settings.accrueInterestOnSkippedEmi,
          preEmiInterestEnabled: scenario.settings.preEmiInterestEnabled,
        },
      });

      const loan = await createScenarioLoan(employee, actor, scenario, preview);

      const row = {
        id: scenario.id,
        title: scenario.title,
        settingsSavedToDb: {
          multiEmiCollectionMode: dbMode,
          multiEmiPriority: dbPriority,
          maxCombinedEmiAmount: dbCap ?? null,
          preEmiInterestEnabled: dbPre,
          accrueInterestOnSkippedEmi: dbSkip,
        },
        loanId: String(loan._id),
        formNumber: loan.applicationFormNumber,
        amount: scenario.loan.amount,
        duration: scenario.loan.duration,
        interestStart: preview.interestStartPayrollMonth,
        emiCommence: preview.emiCommencePayrollMonth,
        delayMonths: preview.commenceDelayMonths,
        preEmiMonths: preview.preEmiMonths,
        tenureInterest: preview.tenureInterest,
        preEmiInterest: preview.preEmiInterest,
        totalInterest: preview.totalInterest,
        totalAmount: preview.totalAmount,
        emiAmount: preview.emiAmount,
        existingActiveLoans: preview.existingActiveLoans,
        existingMonthlyEmi: preview.existingMonthlyEmi,
        reason: preview.reason,
        status: loan.status,
      };
      results.push(row);

      console.log(`  Form #${row.formNumber}  |  loanId=${row.loanId}  |  status=${row.status} (pending — does NOT compete)`);
      console.log(
        `  Amount ${money(row.amount)} / ${row.duration}m  →  EMI ${money(row.emiAmount)}  ·  total ${money(row.totalAmount)}`
      );
      console.log(
        `  Interest start ${row.interestStart}  →  EMI commence ${row.emiCommence}  (delay ${row.delayMonths}m, pre-EMI ${row.preEmiMonths}m)`
      );
      console.log(
        `  Tenure interest ${money(row.tenureInterest)}  ·  Pre-EMI interest ${money(row.preEmiInterest)}  ·  Total interest ${money(row.totalInterest)}`
      );
      console.log(
        `  Competing disbursed/active loans: ${row.existingActiveLoans} (≈${money(row.existingMonthlyEmi)}/mo)`
      );
      console.log(`  WHY: ${row.reason}`);

      if (keepSettingsId && keepSettingsId === scenario.id) {
        keptScenario = scenario;
      }
    }
  } finally {
    if (keptScenario) {
      await applyScenarioSettings(settingsDoc, keptScenario.settings);
      console.log(`\nKEEPING Loan Settings as scenario ${keptScenario.id}:`);
      console.log(`  ${JSON.stringify(keptScenario.settings)}`);
    } else {
      console.log(`\nRestoring original Loan Settings EMI policy…`);
      await applyScenarioSettings(settingsDoc, originalPolicy);
      console.log('  Restored:', JSON.stringify(originalPolicy));
      console.log('  Tip: re-run with --keep-settings=S3 to leave Settings UI on that scenario for manual check.');
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rule: 'Only disbursed/active loans compete. Pending/approved are ignored. Settings were written to DB for each scenario before creating that loan.',
    employee: {
      _id: String(employee._id),
      emp_no: employee.emp_no,
      name: employee.employee_name || employee.first_name || null,
      gross_salary: employee.gross_salary ?? null,
      basic_salary: employee.basic_salary ?? null,
    },
    interestStartYm,
    baselines,
    originalPolicy,
    keptSettings: keptScenario
      ? { scenarioId: keptScenario.id, settings: keptScenario.settings }
      : null,
    scenarios: results,
    summary: {
      createdApplications: results.length,
      delayedCommence: results.filter((r) => (r.delayMonths || 0) > 0).length,
      withPreEmiInterest: results.filter((r) => (r.preEmiInterest || 0) > 0).length,
      immediateCommence: results.filter((r) => (r.delayMonths || 0) === 0).length,
    },
    howToView: `Open Loans for emp ${employee.emp_no}. Search SIM_EMI_SCENARIO. Pending apps do not affect multi-EMI; only BASE-A/B (active) do.`,
    cleanupCommand: 'node backend/scripts/simulate_loan_emi_real_data.js --cleanup',
  };

  const outPath = path.join(__dirname, 'simulate_loan_emi_real_data.report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\n${line()}`);
  console.log('  SUMMARY');
  console.log(line());
  console.log(`  Applications created: ${report.summary.createdApplications}`);
  console.log(`  Immediate commence:   ${report.summary.immediateCommence}`);
  console.log(`  Delayed commence:     ${report.summary.delayedCommence}`);
  console.log(`  With pre-EMI interest:${report.summary.withPreEmiInterest}`);
  console.log(`\n  Report: ${outPath}`);
  console.log(`  ${report.howToView}`);
  console.log(`  Cleanup: ${report.cleanupCommand}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
