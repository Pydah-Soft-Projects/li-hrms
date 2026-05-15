/**
 * Loan / salary-advance workflow helpers — approval chain aligned with leave/OD pattern.
 */

function formatRoleLabel(role) {
  const r = String(role || '').trim();
  if (r === 'final_authority') return 'Final Approval';
  if (r === 'hod') return 'HOD Approval';
  if (r === 'hr') return 'HR Approval';
  if (r === 'manager') return 'Manager Approval';
  return `${r.replace(/_/g, ' ')} Approval`;
}

/**
 * Build approval chain from loan settings workflow (HOD → dynamic steps → Final Approval).
 */
function buildLoanApprovalChain(workflowConfig = {}) {
  const wf = workflowConfig.workflow || workflowConfig;
  const workflowSteps = (wf.steps || []).filter((s) => s.isActive !== false);
  const finalAuth = wf.finalAuthority;
  const hasHodInSteps = workflowSteps.some((s) => s.approverRole === 'hod');

  const chain = [];

  if (!hasHodInSteps) {
    chain.push({
      stepOrder: 1,
      role: 'hod',
      label: 'HOD Approval',
      status: 'pending',
      isCurrent: true,
    });
  }

  workflowSteps.forEach((step) => {
    const role = step.approverRole === 'final_authority' ? 'final_authority' : step.approverRole;
    if (role === 'hod' && !hasHodInSteps) return;
    chain.push({
      stepOrder: chain.length + 1,
      role,
      label: step.stepName || formatRoleLabel(role),
      status: 'pending',
      isCurrent: chain.length === 0,
    });
  });

  if (finalAuth?.role) {
    const hasFinal = chain.some((s) => s.role === 'final_authority');
    const finalRole = String(finalAuth.role || '').trim();
    // Leave-style: when final authority maps to an existing workflow role (e.g. HR), that step is the final gate — no duplicate row.
    const hasMatchingRoleStep =
      finalRole &&
      finalRole !== 'specific_user' &&
      chain.some((s) => s.role === finalRole);
    if (!hasFinal && !hasMatchingRoleStep) {
      chain.push({
        stepOrder: chain.length + 1,
        role: 'final_authority',
        label: 'Final Approval',
        status: 'pending',
        isCurrent: false,
      });
    }
  }

  if (chain.length === 0) {
    chain.push({
      stepOrder: 1,
      role: 'hod',
      label: 'HOD Approval',
      status: 'pending',
      isCurrent: true,
    });
    const finalRole = String(finalAuth.role || '').trim();
    const hasMatchingRoleStep =
      finalRole && finalRole !== 'specific_user' && chain.some((s) => s.role === finalRole);
    if (finalAuth?.role && !hasMatchingRoleStep) {
      chain.push({
        stepOrder: 2,
        role: 'final_authority',
        label: 'Final Approval',
        status: 'pending',
        isCurrent: false,
      });
    }
  }

  return chain;
}

function applyHistoryToChain(chain, history = [], loan = {}) {
  const hist = Array.isArray(history) ? history : [];
  for (const step of chain) {
    const entry = hist.find(
      (h) => h.step === step.role && (h.action === 'approved' || h.action === 'rejected')
    );
    if (entry) {
      step.status = entry.action === 'approved' ? 'approved' : 'rejected';
      step.actionByName = entry.actionByName;
      step.actionByRole = entry.actionByRole;
      step.comments = entry.comments;
      step.updatedAt = entry.timestamp;
      step.isCurrent = false;
    }
  }

  if (loan.approvals?.final?.status === 'approved') {
    const finalStep = chain.find((s) => s.role === 'final_authority');
    if (finalStep && finalStep.status === 'pending') {
      finalStep.status = 'approved';
      finalStep.isCurrent = false;
      finalStep.comments = loan.approvals.final.comments;
      finalStep.updatedAt = loan.approvals.final.approvedAt;
    }
  }
  if (loan.approvals?.final?.status === 'rejected') {
    const finalStep = chain.find((s) => s.role === 'final_authority');
    if (finalStep) {
      finalStep.status = 'rejected';
      finalStep.isCurrent = false;
    }
  }

  return chain;
}

function setCurrentFromNextApprover(chain, nextApprover, isCompleted) {
  if (isCompleted || !nextApprover) {
    chain.forEach((s) => {
      s.isCurrent = false;
    });
    return chain;
  }
  let found = false;
  for (const step of chain) {
    if (step.status === 'pending' && step.role === nextApprover) {
      step.isCurrent = true;
      found = true;
    } else {
      step.isCurrent = false;
    }
  }
  if (!found) {
    const firstPending = chain.find((s) => s.status === 'pending');
    if (firstPending) firstPending.isCurrent = true;
  }
  return chain;
}

/**
 * Ensure loan has approvalChain (build or hydrate from history).
 */
function ensureLoanApprovalChain(loan, settings) {
  const wf = settings?.workflow || settings || {};
  let chain = loan.workflow?.approvalChain;
  if (!Array.isArray(chain) || chain.length === 0) {
    chain = buildLoanApprovalChain(wf);
    chain = applyHistoryToChain(chain, loan.workflow?.history, loan);
  }
  const isCompleted = loan.workflow?.currentStep === 'completed';
  chain = setCurrentFromNextApprover(chain, loan.workflow?.nextApprover, isCompleted);
  loan.workflow.approvalChain = chain;
  loan.workflow.finalAuthority = wf.finalAuthority?.role || loan.workflow.finalAuthority || 'hr';
  loan.workflow.nextApproverRole = loan.workflow.nextApprover;
  loan.workflow.isCompleted = isCompleted;
  return chain;
}

function getActiveChainStepIndex(chain) {
  if (!Array.isArray(chain) || !chain.length) return -1;
  const cur = chain.findIndex((s) => s.isCurrent && s.status === 'pending');
  if (cur >= 0) return cur;
  return chain.findIndex((s) => s.status === 'pending');
}

function isLoanFinalApprovalStep(loan, settings) {
  const next = loan.workflow?.nextApprover;
  const finalAuth = settings?.workflow?.finalAuthority;
  if (next === 'final_authority') return true;
  if (!finalAuth?.role) {
    const chain = loan.workflow?.approvalChain || buildLoanApprovalChain(settings?.workflow || {});
    const pending = chain.filter((s) => s.status === 'pending');
    if (pending.length === 1 && pending[0].role === next) return true;
  }
  return false;
}

function canUserAuthorizeFinalAction(user, settings) {
  const userRole = user?.role;
  const finalAuth = settings?.workflow?.finalAuthority;
  if (['super_admin', 'sub_admin'].includes(userRole)) return true;
  if (!finalAuth?.role) {
    return userRole === 'hr';
  }
  if (finalAuth.role === 'hr' && userRole === 'hr') {
    if (finalAuth.anyHRCanApprove) return true;
    const uid = String(user._id || user.id || user.userId || '');
    return (finalAuth.authorizedHRUsers || []).some((id) => String(id) === uid);
  }
  if (finalAuth.role === 'specific_user') {
    const uid = String(user._id || user.id || user.userId || '');
    return String(finalAuth.userId) === uid;
  }
  return userRole === 'hr';
}

/**
 * Whether the user may act on the loan at the current workflow step.
 */
function canUserActOnLoanStep(loan, user, settings) {
  if (!loan || !user) return false;
  if (loan.workflow?.currentStep === 'completed') return false;
  const next = loan.workflow?.nextApprover;
  if (!next) return false;

  const userRole = user.role;
  if (['super_admin', 'sub_admin'].includes(userRole)) return true;

  if (next === 'final_authority') {
    return canUserAuthorizeFinalAction(user, settings);
  }

  if (next === 'reporting_manager') return false;

  if (next === userRole) return true;

  const allowBypass = settings?.workflow?.allowHigherAuthorityToApproveLowerLevels === true;
  if (allowBypass && userRole === 'hr' && ['hod', 'manager'].includes(next)) return true;

  return false;
}

/**
 * After approve/reject — update approvalChain to match new nextApprover / terminal state.
 */
function syncChainAfterWorkflowAction(loan, { currentApprover, action, isFinalStep, nextRole }) {
  const chain = loan.workflow?.approvalChain;
  if (!Array.isArray(chain) || !chain.length) return;

  const step = chain.find((s) => s.role === currentApprover);
  if (step && (action === 'approved' || action === 'rejected')) {
    step.status = action === 'approved' ? 'approved' : 'rejected';
    step.isCurrent = false;
  }

  if (isFinalStep) {
    chain.forEach((s) => {
      s.isCurrent = false;
    });
    return;
  }

  setCurrentFromNextApprover(chain, nextRole, false);
}

module.exports = {
  buildLoanApprovalChain,
  ensureLoanApprovalChain,
  getActiveChainStepIndex,
  isLoanFinalApprovalStep,
  canUserActOnLoanStep,
  canUserAuthorizeFinalAction,
  syncChainAfterWorkflowAction,
};
