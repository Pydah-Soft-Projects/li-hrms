const assert = require('assert');
const { buildLoanApprovalChain, isLoanFinalApprovalStep, ensureLoanApprovalChain } = require('../loanWorkflowService');

const settings = {
  workflow: {
    steps: [
      { stepOrder: 1, stepName: 'HOD Approval', approverRole: 'hod', isActive: true, nextStepOnApprove: 2 },
      { stepOrder: 2, stepName: 'HR Approval', approverRole: 'hr', isActive: true, nextStepOnApprove: null },
    ],
    finalAuthority: { role: 'hr', anyHRCanApprove: true },
  },
};

const chain = buildLoanApprovalChain(settings);
assert.ok(chain.some((s) => s.role === 'hod'));
assert.ok(chain.some((s) => s.role === 'hr'));
assert.ok(
  !chain.some((s) => s.role === 'final_authority'),
  'No duplicate Final Approval row when HR step already covers final authority'
);

const loanAtFinal = {
  workflow: {
    nextApprover: 'final_authority',
    approvalChain: [...chain, { role: 'final_authority', status: 'pending', isCurrent: true }],
  },
};
assert.strictEqual(isLoanFinalApprovalStep(loanAtFinal, settings), true);

const loanAtHr = {
  workflow: {
    nextApprover: 'hr',
    approvalChain: chain,
  },
};
// Leave-style: last configured stage (nextStepOnApprove null) is the finishing step
assert.strictEqual(isLoanFinalApprovalStep(loanAtHr, settings), true);

const loanAtHod = {
  workflow: {
    nextApprover: 'hod',
    approvalChain: chain,
  },
};
assert.strictEqual(isLoanFinalApprovalStep(loanAtHod, settings), false);

const stuck = {
  workflow: {
    nextApprover: 'final_authority',
    currentStep: 'final',
    approvalChain: [
      { role: 'hod', status: 'approved', isCurrent: false },
      { role: 'hr', status: 'pending', isCurrent: false },
      { role: 'final_authority', status: 'pending', isCurrent: true },
    ],
  },
};
ensureLoanApprovalChain(stuck, settings);
assert.strictEqual(stuck.workflow.nextApprover, 'hr');
assert.ok(!stuck.workflow.approvalChain.some((s) => s.role === 'final_authority'));

console.log('loanWorkflowService.test.js: all assertions passed');
