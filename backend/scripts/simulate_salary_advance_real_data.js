/**
 * Real-DB simulation: salary advance scenarios (deduction, guarantors, attendance stages).
 * Creates tagged salary_advance applications so you can open them in UI.
 *
 * Run:     node backend/scripts/simulate_salary_advance_real_data.js
 * Cleanup: node backend/scripts/simulate_salary_advance_real_data.js --cleanup
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
const { nextLoanApplicationFormNumber } = require('../loans/services/loanApplicationFormSequence');
const { getPresentPayPeriod } = require('../shared/utils/dateUtils');
const {
  buildLoanApprovalChain,
  isLoanFinalApprovalStep,
} = require('../loans/services/loanWorkflowService');
const {
  getGuarantorRulesFromSettings,
  isGuarantorCollectionAtApplication,
  getGuarantorStageStep,
  mustBlockApprovalForGuarantors,
  isGuarantorGateActive,
} = require('../loans/services/loanGuarantorService');

const SIM_TAG = '[SIM-ADV]';
const SIM_MARKER = 'SIM_ADVANCE_SCENARIO';

const SCENARIOS = [
  {
    id: 'SA1',
    title: 'Single-cycle advance · no guarantor stage · attendance OFF',
    amount: 8000,
    duration: 1,
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2, maxGuarantors: 4 },
    workflowSteps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod', isActive: true, nextStepOnApprove: 2, requireGuarantors: false, verifyAttendance: false },
      { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr', isActive: true, nextStepOnApprove: null, requireGuarantors: false, verifyAttendance: false },
    ],
  },
  {
    id: 'SA2',
    title: '3-cycle advance · guarantors on application',
    amount: 15000,
    duration: 3,
    guarantorRules: { collectionTiming: 'on_application', minGuarantors: 2, maxGuarantors: 4 },
    workflowSteps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod', isActive: true, nextStepOnApprove: 2, requireGuarantors: false, verifyAttendance: false },
      { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr', isActive: true, nextStepOnApprove: null, requireGuarantors: false, verifyAttendance: true },
    ],
  },
  {
    id: 'SA3',
    title: '3-cycle · guarantors at HR stage · attendance verify',
    amount: 12000,
    duration: 3,
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2, maxGuarantors: 4 },
    workflowSteps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod', isActive: true, nextStepOnApprove: 2, requireGuarantors: false, verifyAttendance: false },
      { stepOrder: 2, stepName: 'HR + Guarantors', approverRole: 'hr', isActive: true, nextStepOnApprove: null, requireGuarantors: true, verifyAttendance: true },
    ],
  },
  {
    id: 'SA4',
    title: '5-cycle · Manager→HR · attendance on final',
    amount: 25000,
    duration: 5,
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2, maxGuarantors: 4 },
    workflowSteps: [
      { stepOrder: 1, stepName: 'Manager Approval', approverRole: 'manager', isActive: true, nextStepOnApprove: 2, requireGuarantors: false, verifyAttendance: false },
      { stepOrder: 2, stepName: 'HR Final', approverRole: 'hr', isActive: true, nextStepOnApprove: null, requireGuarantors: false, verifyAttendance: true },
    ],
  },
  {
    id: 'SA5',
    title: '2-cycle · guarantors at HOD · no attendance',
    amount: 10000,
    duration: 2,
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2, maxGuarantors: 3 },
    workflowSteps: [
      { stepOrder: 1, stepName: 'HOD + Guarantors', approverRole: 'hod', isActive: true, nextStepOnApprove: 2, requireGuarantors: true, verifyAttendance: false },
      { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr', isActive: true, nextStepOnApprove: null, requireGuarantors: false, verifyAttendance: false },
    ],
  },
];

function line(ch = '═', n = 72) {
  return ch.repeat(n);
}

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function calcDeduction(amount, duration) {
  const cycles = Math.max(1, Number(duration) || 1);
  const deductionPerCycle = Math.round(Number(amount) / cycles);
  return { deductionCycles: cycles, deductionPerCycle };
}

async function pickEmployee() {
  return (
    (await Employee.findOne({ emp_no: 'TEST_LOAN_EMP', is_active: true })) ||
    (await Employee.findOne({ is_active: true, gross_salary: { $gte: 20000 } }).sort({ updatedAt: -1 })) ||
    (await Employee.findOne({ is_active: true }).sort({ updatedAt: -1 }))
  );
}

async function cleanupSimAdvances(employeeId) {
  const filter = {
    requestType: 'salary_advance',
    $or: [
      { remarks: { $regex: SIM_MARKER } },
      { reason: { $regex: SIM_TAG.replace(/[[\]]/g, '\\$&') } },
    ],
  };
  if (employeeId) filter.employeeId = employeeId;
  const res = await Loan.deleteMany(filter);
  return res.deletedCount || 0;
}

async function createScenarioAdvance(employee, actorUser, scenario, presentYm) {
  const formNo = await nextLoanApplicationFormNumber();
  const { deductionCycles, deductionPerCycle } = calcDeduction(scenario.amount, scenario.duration);
  const chain = buildLoanApprovalChain({
    workflow: {
      steps: scenario.workflowSteps,
      finalAuthority: { role: 'hr', anyHRCanApprove: true },
    },
  });
  const initial = chain[0]?.role || 'hod';

  const doc = await Loan.create({
    employeeId: employee._id,
    emp_no: employee.emp_no,
    requestType: 'salary_advance',
    amount: scenario.amount,
    originalAmount: scenario.amount,
    reason: `${SIM_TAG} ${scenario.id}: ${scenario.title}`,
    duration: scenario.duration,
    interestAmount: 0,
    remarks: `${SIM_MARKER} ${scenario.id} | cycles=${deductionCycles} | perCycle=${deductionPerCycle} | guarantors=${scenario.guarantorRules.collectionTiming}`,
    department: employee.department_id || employee.department,
    designation: employee.designation_id || employee.designation,
    division_id: employee.division_id || employee.division,
    appliedBy: actorUser._id,
    appliedAt: new Date(),
    status: 'pending',
    applicationFormNumber: formNo,
    advanceConfig: {
      deductionCycles,
      deductionPerCycle,
      deductionStartCycle: presentYm || null,
    },
    repayment: {
      totalPaid: 0,
      remainingBalance: scenario.amount,
      installmentsPaid: 0,
      totalInstallments: deductionCycles,
    },
    guarantors: [],
    workflow: {
      currentStep: ['hod', 'manager', 'hr'].includes(initial) ? initial : 'hod',
      nextApprover: initial,
      nextApproverRole: initial,
      finalAuthority: 'hr',
      approvalChain: chain,
      isCompleted: false,
      history: [
        {
          step: 'employee',
          action: 'submitted',
          actionBy: actorUser._id,
          actionByName: actorUser.name || 'Simulation',
          actionByRole: actorUser.role,
          comments: `Auto-created by salary advance simulation (${scenario.id})`,
          timestamp: new Date(),
        },
      ],
    },
  });

  return doc;
}

function analyzeScenario(scenario, advanceDoc) {
  const settings = {
    guarantorRules: scenario.guarantorRules,
    workflow: {
      steps: scenario.workflowSteps,
      finalAuthority: { role: 'hr', anyHRCanApprove: true },
    },
  };
  const rules = getGuarantorRulesFromSettings(settings);
  const guarantorStage = getGuarantorStageStep(settings.workflow, rules);
  const atInitial = {
    requestType: 'salary_advance',
    workflow: { nextApprover: advanceDoc.workflow.nextApprover },
    guarantors: advanceDoc.guarantors || [],
  };
  const gateActive = isGuarantorGateActive(atInitial, settings);
  const gateBlock = mustBlockApprovalForGuarantors(atInitial, settings);
  const finalOnCurrent = isLoanFinalApprovalStep(
    { workflow: { nextApprover: advanceDoc.workflow.nextApprover, approvalChain: advanceDoc.workflow.approvalChain } },
    settings
  );
  const currentStep = scenario.workflowSteps.find((s) => {
    const role = s.approverRole === 'super_admin' || s.approverRole === 'admin' ? 'hr' : s.approverRole;
    return role === advanceDoc.workflow.nextApprover;
  });
  const lastStep = scenario.workflowSteps.find((s) => s.nextStepOnApprove == null);

  return {
    collectGuarantorsOnApply: isGuarantorCollectionAtApplication(rules),
    guarantorStageRole: guarantorStage?.approverRole || null,
    guarantorStageName: guarantorStage?.stepName || null,
    gateActiveAtStart: gateActive,
    gateBlockedAtStart: !!gateBlock.block,
    verifyAttendanceOnCurrent: !!currentStep?.verifyAttendance,
    verifyAttendanceOnFinal: !!lastStep?.verifyAttendance,
    isFinalAtStart: finalOnCurrent,
    chainRoles: (advanceDoc.workflow.approvalChain || []).map((s) => s.role),
    hasSyntheticFinal: (advanceDoc.workflow.approvalChain || []).some((s) => s.role === 'final_authority'),
  };
}

async function main() {
  const cleanupOnly = process.argv.includes('--cleanup');

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(line());
  console.log('  REAL-DATA SALARY ADVANCE SCENARIO SIMULATION');
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

  console.log('\nCleanup prior simulation salary advances…');
  const deleted = await cleanupSimAdvances(employee._id);
  console.log(`  Deleted ${deleted} prior ${SIM_MARKER} records`);

  if (cleanupOnly) {
    await mongoose.disconnect();
    console.log('\nCleanup done.');
    return;
  }

  const settingsDoc = await LoanSettings.findOne({ type: 'salary_advance', isActive: true });
  if (!settingsDoc) {
    console.error('No active salary_advance settings found. Create them in Settings UI first.');
    process.exit(1);
  }

  const original = {
    guarantorRules: settingsDoc.guarantorRules ? JSON.parse(JSON.stringify(settingsDoc.guarantorRules)) : {},
    workflowSteps: settingsDoc.workflow?.steps
      ? JSON.parse(JSON.stringify(settingsDoc.workflow.steps))
      : [],
  };

  const present = await getPresentPayPeriod();
  const presentYm =
    present?.payrollMonthKey ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  console.log(`\nPresent payroll month: ${presentYm}`);
  console.log(`\n${line('─')}`);
  console.log('  FOR EACH SCENARIO: patch salary_advance settings → create application');
  console.log(line('─'));

  const results = [];

  try {
    for (const scenario of SCENARIOS) {
      settingsDoc.guarantorRules = {
        ...(settingsDoc.guarantorRules || {}),
        ...scenario.guarantorRules,
      };
      settingsDoc.markModified('guarantorRules');
      settingsDoc.workflow = settingsDoc.workflow || {};
      settingsDoc.workflow.steps = scenario.workflowSteps.map((s) => ({
        ...s,
        availableActions: ['approve', 'reject'],
        approvedStatus: `${s.approverRole}_approved`,
        rejectedStatus: `${s.approverRole}_rejected`,
      }));
      settingsDoc.workflow.finalAuthority = settingsDoc.workflow.finalAuthority || {
        role: 'hr',
        anyHRCanApprove: true,
      };
      settingsDoc.markModified('workflow');
      await settingsDoc.save();

      const deduction = calcDeduction(scenario.amount, scenario.duration);
      const advance = await createScenarioAdvance(employee, actor, scenario, presentYm);
      const analysis = analyzeScenario(scenario, advance);

      const row = {
        id: scenario.id,
        title: scenario.title,
        advanceId: String(advance._id),
        formNumber: advance.applicationFormNumber,
        status: advance.status,
        amount: scenario.amount,
        duration: scenario.duration,
        deductionCycles: deduction.deductionCycles,
        deductionPerCycle: deduction.deductionPerCycle,
        deductionStartCycle: presentYm,
        nextApprover: advance.workflow.nextApprover,
        settings: {
          guarantorRules: scenario.guarantorRules,
          workflowSteps: scenario.workflowSteps.map((s) => ({
            stepOrder: s.stepOrder,
            stepName: s.stepName,
            approverRole: s.approverRole,
            requireGuarantors: !!s.requireGuarantors,
            verifyAttendance: !!s.verifyAttendance,
            nextStepOnApprove: s.nextStepOnApprove,
          })),
        },
        analysis,
        checks: {
          deductionOk: deduction.deductionPerCycle === Math.round(scenario.amount / scenario.duration),
          noSyntheticFinal: analysis.hasSyntheticFinal === false,
          collectOnApplyMatches:
            analysis.collectGuarantorsOnApply ===
            (scenario.guarantorRules.collectionTiming === 'on_application'),
        },
      };
      row.checks.allPass = Object.values(row.checks).every(Boolean);
      results.push(row);

      console.log(`\n[${scenario.id}] ${scenario.title}`);
      console.log(`  Form #${row.formNumber}  |  id=${row.advanceId}  |  status=${row.status}`);
      console.log(
        `  Amount ${money(row.amount)} / ${row.duration} cycles → ${money(row.deductionPerCycle)}/cycle · start ${row.deductionStartCycle}`
      );
      console.log(
        `  nextApprover=${row.nextApprover} · chain=${analysis.chainRoles.join('→')} · finalAtStart=${analysis.isFinalAtStart}`
      );
      console.log(
        `  guarantors: timing=${scenario.guarantorRules.collectionTiming}` +
          (analysis.guarantorStageRole
            ? ` · stage=${analysis.guarantorStageName}(${analysis.guarantorStageRole})`
            : ' · no stage gate') +
          ` · gateActive=${analysis.gateActiveAtStart} · blocked=${analysis.gateBlockedAtStart}`
      );
      console.log(
        `  attendance: current=${analysis.verifyAttendanceOnCurrent} · onFinal=${analysis.verifyAttendanceOnFinal}`
      );
      console.log(`  checks: ${row.checks.allPass ? 'PASS' : 'FAIL'} ${JSON.stringify(row.checks)}`);
    }
  } finally {
    // Restore original settings so production config is not left on last scenario
    settingsDoc.guarantorRules = original.guarantorRules;
    settingsDoc.markModified('guarantorRules');
    if (original.workflowSteps?.length) {
      settingsDoc.workflow.steps = original.workflowSteps;
      settingsDoc.markModified('workflow');
    }
    await settingsDoc.save();
    console.log(`\nRestored original salary_advance settings.`);
  }

  const passed = results.filter((r) => r.checks.allPass).length;
  const failed = results.length - passed;

  console.log(`\n${line()}`);
  console.log('  SUMMARY');
  console.log(line());
  console.log(`  Total scenarios: ${results.length}`);
  console.log(`  Passed checks:   ${passed}`);
  console.log(`  Failed checks:   ${failed}`);
  console.log(`  Employee:        ${employee.emp_no}`);
  console.log(`  Open in UI:      Superadmin → Loans → Advances / Pending`);

  const report = {
    generatedAt: new Date().toISOString(),
    module: 'salary_advance',
    employee: {
      _id: String(employee._id),
      emp_no: employee.emp_no,
      name: employee.employee_name || employee.first_name || null,
      gross_salary: employee.gross_salary ?? null,
    },
    actor: { _id: String(actor._id), name: actor.name, role: actor.role },
    presentPayrollMonth: presentYm,
    summary: { total: results.length, passed, failed },
    results,
  };

  const outPath = path.join(__dirname, 'simulate_salary_advance_real_data.report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n  Report written: ${outPath}`);

  await mongoose.disconnect();

  if (failed > 0) {
    console.log('\n  RESULT: SOME SCENARIOS FAILED CHECKS');
    process.exit(1);
  }
  console.log('\n  RESULT: ALL SCENARIOS PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
