const assert = require('assert');
const { buildLoanApprovalChain, isLoanFinalApprovalStep } = require('../loanWorkflowService');

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
    approvalChain: chain,
  },
};
assert.strictEqual(isLoanFinalApprovalStep(loanAtFinal, settings), true);

const loanAtHr = {
  workflow: {
    nextApprover: 'hr',
    approvalChain: chain,
  },
};
assert.strictEqual(isLoanFinalApprovalStep(loanAtHr, settings), false);

console.log('loanWorkflowService.test.js: all assertions passed');
