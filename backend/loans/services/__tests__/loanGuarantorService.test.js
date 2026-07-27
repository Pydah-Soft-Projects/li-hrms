const assert = require('assert');
const {
  DEFAULT_GUARANTOR_RULES,
  getGuarantorRulesFromSettings,
  validateGuarantorEligibility,
  areGuarantorsSatisfied,
  isGuarantorGateActive,
  mustBlockApprovalForGuarantors,
  getGuarantorStageStep,
} = require('../loanGuarantorService');

// monthsBackKeys is not exported — test via attendance indirectly; re-implement minimal check
function testGuarantorRulesDefaults() {
  const rules = getGuarantorRulesFromSettings({});
  assert.strictEqual(rules.collectionTiming, 'on_workflow_stage');
  assert.strictEqual(rules.minGuarantors, 2);
  assert.strictEqual(rules.maxGuaranteePercentOfSalary, 60);
}

function testValidateGuarantorEligibilityPass() {
  const financials = {
    employee: { is_active: true, date_of_joining: new Date('2020-01-01'), department_id: 'd1', designation_id: 'g1' },
    salary: 50000,
    ownEmi: 5000,
    guaranteedEmi: 10000,
    totalEmi: 15000,
    availableSalary: 35000,
    exposurePercent: 30,
    exposure: { totals: { runningGuaranteedCount: 1 } },
  };
  const result = validateGuarantorEligibility(financials, DEFAULT_GUARANTOR_RULES);
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.reasons.length, 0);
}

function testValidateGuarantorEligibilityFailOverLimit() {
  const financials = {
    employee: { is_active: true, date_of_joining: new Date('2020-01-01') },
    salary: 50000,
    ownEmi: 20000,
    guaranteedEmi: 15000,
    totalEmi: 35000,
    availableSalary: 15000,
    exposurePercent: 70,
    exposure: { totals: { runningGuaranteedCount: 2 } },
  };
  const result = validateGuarantorEligibility(financials, DEFAULT_GUARANTOR_RULES);
  assert.strictEqual(result.eligible, false);
  assert.ok(result.reasons.some((r) => r.includes('Guarantee limit exceeded')));
}

function testAreGuarantorsSatisfied() {
  const loan = {
    requestType: 'loan',
    guarantors: [
      { status: 'accepted' },
      { status: 'accepted' },
    ],
  };
  assert.strictEqual(areGuarantorsSatisfied(loan, DEFAULT_GUARANTOR_RULES).satisfied, true);

  const loanPending = {
    requestType: 'loan',
    guarantors: [{ status: 'accepted' }, { status: 'pending' }],
  };
  assert.strictEqual(areGuarantorsSatisfied(loanPending, DEFAULT_GUARANTOR_RULES).satisfied, false);
}

function testGuarantorGateActive() {
  const settings = {
    guarantorRules: { collectionTiming: 'on_workflow_stage', minGuarantors: 2 },
    workflow: {
      steps: [
        { stepOrder: 1, stepName: 'HR', approverRole: 'hr', isActive: true, requireGuarantors: true },
        { stepOrder: 2, stepName: 'MD', approverRole: 'final_authority', isActive: true },
      ],
    },
  };
  const loanAtGate = {
    requestType: 'loan',
    workflow: { nextApprover: 'hr' },
    guarantors: [],
  };
  assert.strictEqual(isGuarantorGateActive(loanAtGate, settings), true);
  const block = mustBlockApprovalForGuarantors(loanAtGate, settings);
  assert.strictEqual(block.block, true);

  const loanWithGuarantors = {
    requestType: 'loan',
    workflow: { nextApprover: 'hr' },
    guarantors: [{ status: 'accepted' }, { status: 'accepted' }],
  };
  assert.strictEqual(mustBlockApprovalForGuarantors(loanWithGuarantors, settings).block, false);
}

function testGetGuarantorStageStep() {
  const workflow = {
    steps: [
      { stepOrder: 1, approverRole: 'hod', requireGuarantors: false, isActive: true },
      { stepOrder: 2, approverRole: 'hr', requireGuarantors: true, isActive: true },
    ],
  };
  const step = getGuarantorStageStep(workflow, {});
  assert.strictEqual(step.approverRole, 'hr');
}

testGuarantorRulesDefaults();
testValidateGuarantorEligibilityPass();
testValidateGuarantorEligibilityFailOverLimit();
testAreGuarantorsSatisfied();
testGuarantorGateActive();
testGetGuarantorStageStep();

console.log('loanGuarantorService.test.js: all assertions passed');
