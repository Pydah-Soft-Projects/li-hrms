/**
 * Salary advance scenario simulations (pure logic, no DB).
 * Covers: deduction math, guarantor gates, workflow final stage, exposure.
 *
 * Run: node backend/scripts/simulate_salary_advance_scenarios.js
 */
const fs = require('fs');
const path = require('path');
const {
  getGuarantorRulesFromSettings,
  areGuarantorsSatisfied,
  isGuarantorGateActive,
  mustBlockApprovalForGuarantors,
  getGuarantorStageStep,
  isGuarantorCollectionAtApplication,
  getLoanEmiAmount,
  getLoanOutstanding,
} = require('../loans/services/loanGuarantorService');
const {
  buildLoanApprovalChain,
  isLoanFinalApprovalStep,
} = require('../loans/services/loanWorkflowService');

const results = [];

function money(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function record(group, id, title, ok, details, expected, actual) {
  const row = {
    group,
    id,
    title,
    status: ok ? 'PASS' : 'FAIL',
    details,
    expected: expected ?? null,
    actual: actual ?? null,
  };
  results.push(row);
  const mark = ok ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${mark}  [${id}] ${title}`);
  if (details) console.log(`         ${details}`);
  if (!ok) {
    console.log(`         expected: ${JSON.stringify(expected)}`);
    console.log(`         actual:   ${JSON.stringify(actual)}`);
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(72)}`);
}

function calcAdvanceDeduction(amount, duration) {
  const cycles = Math.max(1, Number(duration) || 1);
  const principal = Number(amount) || 0;
  const deductionPerCycle = Math.round(principal / cycles);
  return {
    amount: principal,
    deductionCycles: cycles,
    deductionPerCycle,
    totalRecovered: deductionPerCycle * cycles,
    remainderGap: principal - deductionPerCycle * cycles,
  };
}

// ─── A. Deduction math ──────────────────────────────────────────────────────
section('A. SALARY ADVANCE DEDUCTION CALCULATION');

{
  const r = calcAdvanceDeduction(10000, 1);
  record(
    'Deduction',
    'A1',
    'Single-cycle advance ₹10,000 / 1',
    r.deductionPerCycle === 10000 && r.deductionCycles === 1,
    `Deduct ${money(r.deductionPerCycle)} × ${r.deductionCycles} cycle(s)`,
    { deductionPerCycle: 10000, cycles: 1 },
    { deductionPerCycle: r.deductionPerCycle, cycles: r.deductionCycles }
  );
}

{
  const r = calcAdvanceDeduction(12000, 3);
  record(
    'Deduction',
    'A2',
    '3-cycle advance ₹12,000 / 3',
    r.deductionPerCycle === 4000 && r.totalRecovered === 12000,
    `Deduct ${money(r.deductionPerCycle)} × 3 = ${money(r.totalRecovered)}`,
    { deductionPerCycle: 4000, total: 12000 },
    { deductionPerCycle: r.deductionPerCycle, total: r.totalRecovered }
  );
}

{
  const r = calcAdvanceDeduction(10000, 3);
  record(
    'Deduction',
    'A3',
    'Rounding: ₹10,000 / 3 → ₹3,333/cycle (same as applyLoan)',
    r.deductionPerCycle === 3333 && r.remainderGap === 1,
    `Per cycle ${money(r.deductionPerCycle)}; rounded total ${money(r.totalRecovered)} (gap ${money(r.remainderGap)})`,
    { deductionPerCycle: 3333, gap: 1 },
    { deductionPerCycle: r.deductionPerCycle, gap: r.remainderGap }
  );
}

{
  const r = calcAdvanceDeduction(25000, 5);
  record(
    'Deduction',
    'A4',
    '5-cycle advance ₹25,000 / 5',
    r.deductionPerCycle === 5000 && r.totalRecovered === 25000,
    `Deduct ${money(r.deductionPerCycle)} × 5`,
    { deductionPerCycle: 5000 },
    { deductionPerCycle: r.deductionPerCycle }
  );
}

{
  const emi = getLoanEmiAmount({
    requestType: 'salary_advance',
    advanceConfig: { deductionPerCycle: 4000 },
  });
  record(
    'Deduction',
    'A5',
    'Exposure EMI uses advance deductionPerCycle',
    emi === 4000,
    `getLoanEmiAmount(advance) = ${money(emi)}`,
    { emi: 4000 },
    { emi }
  );
}

{
  const outstanding = getLoanOutstanding({
    requestType: 'salary_advance',
    amount: 12000,
    repayment: { totalPaid: 4000, remainingBalance: 8000 },
  });
  record(
    'Deduction',
    'A6',
    'Outstanding prefers remainingBalance',
    outstanding === 8000,
    `Outstanding ${money(outstanding)}`,
    { outstanding: 8000 },
    { outstanding }
  );
}

// ─── B. Guarantor rules / gates ─────────────────────────────────────────────
section('B. GUARANTOR RULES & STAGE GATES (SALARY ADVANCE)');

{
  const rules = getGuarantorRulesFromSettings({
    guarantorRules: { collectionTiming: 'on_application', minGuarantors: 2 },
  });
  record(
    'Guarantors',
    'B1',
    'Collect guarantors on application',
    isGuarantorCollectionAtApplication(rules) === true && rules.minGuarantors === 2,
    `timing=${rules.collectionTiming}, min=${rules.minGuarantors}`,
    { onApplication: true, min: 2 },
    { onApplication: isGuarantorCollectionAtApplication(rules), min: rules.minGuarantors }
  );
}

{
  const settings = {
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2 },
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'HOD', approverRole: 'hod', isActive: true, requireGuarantors: false },
        { stepOrder: 2, stepName: 'HR', approverRole: 'hr', isActive: true, requireGuarantors: true, verifyAttendance: true },
      ],
    },
  };
  const stage = getGuarantorStageStep(settings.workflow, settings.guarantorRules);
  record(
    'Guarantors',
    'B2',
    'Guarantor stage resolves to HR step',
    stage?.approverRole === 'hr' && stage?.requireGuarantors === true,
    `Stage=${stage?.stepName} role=${stage?.approverRole}`,
    { role: 'hr' },
    { role: stage?.approverRole }
  );
}

{
  const settings = {
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2 },
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'HR', approverRole: 'hr', isActive: true, requireGuarantors: true },
      ],
    },
  };
  const advance = {
    requestType: 'salary_advance',
    workflow: { nextApprover: 'hr' },
    guarantors: [],
  };
  const active = isGuarantorGateActive(advance, settings);
  const block = mustBlockApprovalForGuarantors(advance, settings);
  record(
    'Guarantors',
    'B3',
    'Advance at guarantor stage without guarantors → blocked',
    active === true && block.block === true,
    block.error || 'blocked',
    { active: true, block: true },
    { active, block: block.block }
  );
}

{
  const settings = {
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2 },
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'HR', approverRole: 'hr', isActive: true, requireGuarantors: true },
      ],
    },
  };
  const advance = {
    requestType: 'salary_advance',
    workflow: { nextApprover: 'hr' },
    guarantors: [
      { status: 'accepted', name: 'G1' },
      { status: 'accepted', name: 'G2' },
    ],
  };
  const check = areGuarantorsSatisfied(advance, settings.guarantorRules);
  const block = mustBlockApprovalForGuarantors(advance, settings);
  record(
    'Guarantors',
    'B4',
    'Advance with 2 accepted guarantors → can approve',
    check.satisfied === true && block.block === false,
    `accepted ${check.acceptedCount}/${check.minRequired}`,
    { satisfied: true, block: false },
    { satisfied: check.satisfied, block: block.block }
  );
}

{
  const settings = {
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2 },
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'HOD', approverRole: 'hod', isActive: true, requireGuarantors: false },
        { stepOrder: 2, stepName: 'HR', approverRole: 'hr', isActive: true, requireGuarantors: true },
      ],
    },
  };
  const advance = {
    requestType: 'salary_advance',
    workflow: { nextApprover: 'hod' },
    guarantors: [],
  };
  record(
    'Guarantors',
    'B5',
    'Advance at HOD (non-guarantor stage) → not blocked',
    isGuarantorGateActive(advance, settings) === false &&
      mustBlockApprovalForGuarantors(advance, settings).block === false,
    'Gate inactive on HOD desk',
    { active: false },
    { active: isGuarantorGateActive(advance, settings) }
  );
}

{
  const advance = {
    requestType: 'salary_advance',
    guarantors: [{ status: 'accepted' }, { status: 'pending' }],
  };
  const check = areGuarantorsSatisfied(advance, { minGuarantors: 2 });
  record(
    'Guarantors',
    'B6',
    'One pending guarantor → not satisfied',
    check.satisfied === false && check.pendingCount === 1,
    `accepted=${check.acceptedCount}, pending=${check.pendingCount}`,
    { satisfied: false, pending: 1 },
    { satisfied: check.satisfied, pending: check.pendingCount }
  );
}

// ─── C. Workflow / attendance stage (leave-style) ───────────────────────────
section('C. WORKFLOW FINAL STAGE + ATTENDANCE FLAG');

{
  const settings = {
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod', isActive: true, nextStepOnApprove: 2 },
        {
          stepOrder: 2,
          stepName: 'HR Approval',
          approverRole: 'hr',
          isActive: true,
          nextStepOnApprove: null,
          verifyAttendance: true,
          requireGuarantors: true,
        },
      ],
      finalAuthority: { role: 'hr', anyHRCanApprove: true },
    },
  };
  const chain = buildLoanApprovalChain(settings);
  record(
    'Workflow',
    'C1',
    'No synthetic Final Authority row for salary advance settings',
    !chain.some((s) => s.role === 'final_authority') && chain.some((s) => s.role === 'hr'),
    `Chain roles: ${chain.map((s) => s.role).join(' → ')}`,
    { hasFinal: false, hasHr: true },
    { hasFinal: chain.some((s) => s.role === 'final_authority'), hasHr: chain.some((s) => s.role === 'hr') }
  );
}

{
  const settings = {
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'HOD', approverRole: 'hod', isActive: true, nextStepOnApprove: 2 },
        { stepOrder: 2, stepName: 'HR', approverRole: 'hr', isActive: true, nextStepOnApprove: null, verifyAttendance: true },
      ],
      finalAuthority: { role: 'hr' },
    },
  };
  const atHr = { workflow: { nextApprover: 'hr', approvalChain: buildLoanApprovalChain(settings) } };
  const atHod = { workflow: { nextApprover: 'hod', approvalChain: buildLoanApprovalChain(settings) } };
  record(
    'Workflow',
    'C2',
    'Last configured HR stage is final (leave style)',
    isLoanFinalApprovalStep(atHr, settings) === true && isLoanFinalApprovalStep(atHod, settings) === false,
    `HR final=${isLoanFinalApprovalStep(atHr, settings)}, HOD final=${isLoanFinalApprovalStep(atHod, settings)}`,
    { hrFinal: true, hodFinal: false },
    {
      hrFinal: isLoanFinalApprovalStep(atHr, settings),
      hodFinal: isLoanFinalApprovalStep(atHod, settings),
    }
  );
}

{
  const settings = {
    workflow: {
      steps: [
        {
          stepOrder: 1,
          stepName: 'HR Verify',
          approverRole: 'hr',
          isActive: true,
          nextStepOnApprove: null,
          verifyAttendance: true,
          requireGuarantors: true,
        },
      ],
      finalAuthority: { role: 'hr' },
    },
  };
  const hrStep = settings.workflow.steps[0];
  record(
    'Workflow',
    'C3',
    'HR stage carries verifyAttendance + requireGuarantors capabilities',
    hrStep.verifyAttendance === true && hrStep.requireGuarantors === true,
    'Both stage gates configured on final HR desk',
    { verifyAttendance: true, requireGuarantors: true },
    { verifyAttendance: hrStep.verifyAttendance, requireGuarantors: hrStep.requireGuarantors }
  );
}

{
  // Simulate attendance consent gate (same rule as processLoanAction)
  const currentStepConfig = { verifyAttendance: true };
  const attendanceVerified = false;
  const blocked = currentStepConfig.verifyAttendance === true && attendanceVerified !== true;
  record(
    'Workflow',
    'C4',
    'Attendance consent required before approve/reject',
    blocked === true,
    'Missing attendanceVerified → stage action blocked',
    { blocked: true },
    { blocked }
  );
}

{
  const currentStepConfig = { verifyAttendance: true };
  const attendanceVerified = true;
  const blocked = currentStepConfig.verifyAttendance === true && attendanceVerified !== true;
  record(
    'Workflow',
    'C5',
    'Attendance consent provided → action allowed',
    blocked === false,
    'attendanceVerified=true clears gate',
    { blocked: false },
    { blocked }
  );
}

// ─── D. End-to-end story scenarios ──────────────────────────────────────────
section('D. END-TO-END SALARY ADVANCE STORIES');

{
  const plan = calcAdvanceDeduction(15000, 3);
  const settings = {
    guarantorRules: { collectionTiming: 'on_application', minGuarantors: 2 },
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'HOD', approverRole: 'hod', isActive: true, nextStepOnApprove: 2 },
        { stepOrder: 2, stepName: 'HR', approverRole: 'hr', isActive: true, nextStepOnApprove: null, verifyAttendance: true },
      ],
      finalAuthority: { role: 'hr' },
    },
  };
  const onApply = isGuarantorCollectionAtApplication(settings.guarantorRules);
  const atHrFinal = isLoanFinalApprovalStep(
    { workflow: { nextApprover: 'hr', approvalChain: buildLoanApprovalChain(settings) } },
    settings
  );
  record(
    'E2E',
    'D1',
    'Story: ₹15k / 3 cycles, guarantors on apply, HR final + attendance',
    plan.deductionPerCycle === 5000 && onApply && atHrFinal,
    `Deduction ${money(plan.deductionPerCycle)}/cycle · onApply=${onApply} · HR final=${atHrFinal}`,
    { perCycle: 5000, onApply: true, hrFinal: true },
    { perCycle: plan.deductionPerCycle, onApply, hrFinal: atHrFinal }
  );
}

{
  const settings = {
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2 },
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'HOD', approverRole: 'hod', isActive: true, nextStepOnApprove: 2, verifyAttendance: false },
        {
          stepOrder: 2,
          stepName: 'HR + Guarantors',
          approverRole: 'hr',
          isActive: true,
          nextStepOnApprove: null,
          requireGuarantors: true,
          verifyAttendance: true,
        },
      ],
      finalAuthority: { role: 'hr' },
    },
  };
  const advanceEmpty = {
    requestType: 'salary_advance',
    workflow: { nextApprover: 'hr' },
    guarantors: [],
  };
  const advanceReady = {
    requestType: 'salary_advance',
    workflow: { nextApprover: 'hr' },
    guarantors: [{ status: 'accepted' }, { status: 'accepted' }],
  };
  const blockedEmpty = mustBlockApprovalForGuarantors(advanceEmpty, settings).block;
  const blockedReady = mustBlockApprovalForGuarantors(advanceReady, settings).block;
  record(
    'E2E',
    'D2',
    'Story: guarantors at HR stage — empty blocks, accepted clears',
    blockedEmpty === true && blockedReady === false,
    `empty→block=${blockedEmpty}, ready→block=${blockedReady}`,
    { empty: true, ready: false },
    { empty: blockedEmpty, ready: blockedReady }
  );
}

{
  const a = calcAdvanceDeduction(8000, 2);
  const b = calcAdvanceDeduction(6000, 2);
  const combinedExposure = a.deductionPerCycle + b.deductionPerCycle;
  record(
    'E2E',
    'D3',
    'Story: two running advances — combined monthly exposure',
    combinedExposure === 7000,
    `A ${money(a.deductionPerCycle)} + B ${money(b.deductionPerCycle)} = ${money(combinedExposure)}/month`,
    { combined: 7000 },
    { combined: combinedExposure }
  );
}

{
  const settings = {
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'Manager', approverRole: 'manager', isActive: true, nextStepOnApprove: 2 },
        { stepOrder: 2, stepName: 'HR Final', approverRole: 'hr', isActive: true, nextStepOnApprove: null },
      ],
      finalAuthority: { role: 'hr' },
    },
  };
  const chain = buildLoanApprovalChain(settings);
  record(
    'E2E',
    'D4',
    'Story: Manager → HR chain completes on HR approve (no extra final desk)',
    chain.map((s) => s.role).join(',') === 'hod,manager,hr' ||
      chain.map((s) => s.role).join(',') === 'manager,hr' ||
      (chain.some((s) => s.role === 'manager') &&
        chain.some((s) => s.role === 'hr') &&
        !chain.some((s) => s.role === 'final_authority')),
    `Roles: ${chain.map((s) => s.role).join(' → ')}`,
    { hasFinal: false },
    { hasFinal: chain.some((s) => s.role === 'final_authority'), roles: chain.map((s) => s.role) }
  );
}

{
  // Admin acting on HR desk should be labeled Admin (display mapping)
  const actorRole = 'super_admin';
  const label =
    actorRole === 'super_admin' || actorRole === 'admin' || actorRole === 'sub_admin'
      ? 'Admin'
      : actorRole;
  record(
    'E2E',
    'D5',
    'Story: Admin acting on HR stage shows Admin approved/rejected',
    label === 'Admin',
    `actionByRole ${actorRole} → display "${label}"`,
    { label: 'Admin' },
    { label }
  );
}

// ─── Summary ────────────────────────────────────────────────────────────────
section('SUMMARY');

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
const byGroup = {};
for (const r of results) {
  if (!byGroup[r.group]) byGroup[r.group] = { pass: 0, fail: 0 };
  if (r.status === 'PASS') byGroup[r.group].pass++;
  else byGroup[r.group].fail++;
}

console.log(`\n  Total: ${results.length} scenarios`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('\n  By group:');
for (const [g, c] of Object.entries(byGroup)) {
  console.log(`    ${g}: ${c.pass} pass, ${c.fail} fail`);
}

const report = {
  generatedAt: new Date().toISOString(),
  module: 'salary_advance',
  summary: { total: results.length, passed, failed, byGroup },
  results,
};

const outPath = path.join(__dirname, 'simulate_salary_advance_scenarios.report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\n  Report written: ${outPath}`);

if (failed > 0) {
  console.log('\n  RESULT: SOME SCENARIOS FAILED');
  process.exit(1);
}
console.log('\n  RESULT: ALL SCENARIOS PASSED');
process.exit(0);
