/**
 * Loan workflow UI helpers — aligned with leave/OD approval timeline pattern.
 */

export type LoanApprovalChainStep = {
  stepOrder?: number;
  role: string;
  label?: string;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  isCurrent?: boolean;
  actionByName?: string;
  actionByRole?: string;
  comments?: string;
  updatedAt?: string;
};

export type LoanWorkflowLike = {
  currentStep?: string;
  nextApprover?: string | null;
  nextApproverRole?: string | null;
  isCompleted?: boolean;
  approvalChain?: LoanApprovalChainStep[];
  history?: Array<{
    step?: string;
    action?: string;
    actionByName?: string;
    actionByRole?: string;
    comments?: string;
    timestamp?: string;
  }>;
  finalAuthority?: string;
};

export type LoanSettingsWorkflowLike = {
  type?: string;
  workflow?: {
    steps?: Array<{
      approverRole?: string;
      stepName?: string;
      isActive?: boolean;
      stepOrder?: number;
    }>;
    finalAuthority?: {
      role?: string;
      anyHRCanApprove?: boolean;
      authorizedHRUsers?: string[];
      userId?: string;
    };
    allowHigherAuthorityToApproveLowerLevels?: boolean;
  };
};

export type LoanTimelineStep = {
  label: string;
  role: string;
  status: 'approved' | 'rejected' | 'current' | 'pending';
  actionByName?: string;
  actionByRole?: string;
  timestamp?: string;
  comments?: string;
};

function formatRoleLabel(role: string): string {
  const r = String(role || '').trim();
  if (r === 'final_authority') return 'Final Approval';
  if (r === 'hod') return 'HOD Approval';
  if (r === 'hr') return 'HR Approval';
  if (r === 'manager') return 'Manager Approval';
  return `${r.replace(/_/g, ' ')} Approval`;
}

function resolveFinalAuthRole(loanSettings: LoanSettingsWorkflowLike | null): string | null {
  const role = loanSettings?.workflow?.finalAuthority?.role;
  return role ? String(role).trim() : null;
}

/**
 * Hide redundant final_authority row when the configured final role already exists in the chain (legacy records).
 */
export function getLoanDisplayApprovalChain(
  chain: LoanApprovalChainStep[] | undefined,
  loanSettings: LoanSettingsWorkflowLike | null
): LoanApprovalChainStep[] {
  if (!Array.isArray(chain) || chain.length === 0) return [];
  const finalRole = resolveFinalAuthRole(loanSettings);
  if (!finalRole || finalRole === 'specific_user') return chain;
  const hasMatchingRoleStep = chain.some((s) => s.role === finalRole && s.role !== 'final_authority');
  if (!hasMatchingRoleStep) return chain;
  return chain.filter((s) => s.role !== 'final_authority');
}

function resolveEffectiveNextApprover(
  next: string | null | undefined,
  loanSettings: LoanSettingsWorkflowLike | null
): string | null {
  if (!next) return null;
  if (next !== 'final_authority') return next;
  const finalRole = resolveFinalAuthRole(loanSettings);
  if (finalRole && finalRole !== 'specific_user') return finalRole;
  return 'final_authority';
}

function chainStepToTimelineStep(
  step: LoanApprovalChainStep,
  opts: {
    next: string | null;
    isCompleted: boolean;
    loanSettings: LoanSettingsWorkflowLike | null;
  }
): LoanTimelineStep {
  const { next, isCompleted, loanSettings } = opts;
  const effectiveNext = resolveEffectiveNextApprover(next, loanSettings);
  const stepRole = step.role;

  let status: LoanTimelineStep['status'] = 'pending';
  if (step.status === 'approved') status = 'approved';
  else if (step.status === 'rejected') status = 'rejected';
  else if (!isCompleted && (step.isCurrent || (effectiveNext && stepRole === effectiveNext))) {
    status = 'current';
  }

  const label =
    step.label ||
    (stepRole === 'final_authority' ? 'Final Approval' : formatRoleLabel(stepRole));

  return {
    label,
    role: stepRole,
    status,
    actionByName: step.actionByName,
    actionByRole: step.actionByRole,
    timestamp: step.updatedAt,
    comments: step.comments,
  };
}

/** Build chain from settings + history when stored approvalChain is missing (legacy loans). */
function buildFallbackApprovalChain(
  loan: { workflow?: LoanWorkflowLike; approvals?: { final?: { status?: string; approvedAt?: string; comments?: string } } },
  loanSettings: LoanSettingsWorkflowLike | null
): LoanApprovalChainStep[] {
  const history = loan.workflow?.history || [];
  const workflowSteps = (loanSettings?.workflow?.steps || []).filter((s) => s.isActive !== false);
  const finalAuth = loanSettings?.workflow?.finalAuthority;
  const currentApprover = loan.workflow?.nextApprover || loan.workflow?.nextApproverRole;
  const isCompleted = loan.workflow?.currentStep === 'completed' || loan.workflow?.isCompleted;

  const chain: LoanApprovalChainStep[] = [];
  const hasHodInSteps = workflowSteps.some((s) => s.approverRole === 'hod');

  if (!hasHodInSteps) {
    const hodEntry = history.find((h) => h.step === 'hod' && h.action !== 'submitted');
    const isHodCurrent = !isCompleted && currentApprover === 'hod';
    chain.push({
      stepOrder: chain.length + 1,
      role: 'hod',
      label: 'HOD Approval',
      status: hodEntry
        ? hodEntry.action === 'approved'
          ? 'approved'
          : 'rejected'
        : 'pending',
      isCurrent: isHodCurrent,
      actionByName: hodEntry?.actionByName,
      actionByRole: hodEntry?.actionByRole,
      comments: hodEntry?.comments,
      updatedAt: hodEntry?.timestamp,
    });
  }

  workflowSteps.forEach((step) => {
    const role = step.approverRole === 'final_authority' ? 'final_authority' : String(step.approverRole || '');
    if (!role || (role === 'hod' && !hasHodInSteps)) return;

    const historyEntry = history.find((h) => h.step === role && h.action !== 'submitted');
    const isCurrent = !isCompleted && currentApprover === role;

    chain.push({
      stepOrder: chain.length + 1,
      role,
      label: step.stepName || formatRoleLabel(role),
      status: historyEntry
        ? historyEntry.action === 'approved'
          ? 'approved'
          : 'rejected'
        : 'pending',
      isCurrent,
      actionByName: historyEntry?.actionByName,
      actionByRole: historyEntry?.actionByRole,
      comments: historyEntry?.comments,
      updatedAt: historyEntry?.timestamp,
    });
  });

  const finalRole = resolveFinalAuthRole(loanSettings);
  const hasMatchingRoleStep =
    finalRole &&
    finalRole !== 'specific_user' &&
    chain.some((s) => s.role === finalRole);

  if (finalAuth?.role && !hasMatchingRoleStep) {
    const finalEntry = history.find((h) => h.step === 'final_authority');
    const isCurrent = !isCompleted && currentApprover === 'final_authority';
    let status: LoanApprovalChainStep['status'] = 'pending';
    if (finalEntry) status = finalEntry.action === 'approved' ? 'approved' : 'rejected';
    else if (loan.approvals?.final?.status === 'approved') status = 'approved';
    else if (loan.approvals?.final?.status === 'rejected') status = 'rejected';

    chain.push({
      stepOrder: chain.length + 1,
      role: 'final_authority',
      label: 'Final Approval',
      status,
      isCurrent,
      actionByName: finalEntry?.actionByName,
      actionByRole: finalEntry?.actionByRole,
      comments: finalEntry?.comments || loan.approvals?.final?.comments,
      updatedAt: finalEntry?.timestamp || loan.approvals?.final?.approvedAt,
    });
  }

  return chain;
}

/** User is on the final approval step (pay period + terminal approve). */
export function isLoanFinalApprovalStep(
  loan: { workflow?: LoanWorkflowLike } | null,
  loanSettings: LoanSettingsWorkflowLike | null
): boolean {
  if (!loan) return false;
  const next = loan.workflow?.nextApprover || loan.workflow?.nextApproverRole;
  const finalAuth = loanSettings?.workflow?.finalAuthority;
  if (next === 'final_authority') return true;
  if (!finalAuth?.role) {
    const chain = getLoanDisplayApprovalChain(loan.workflow?.approvalChain, loanSettings);
    const pending = chain.filter((s) => s.status === 'pending');
    if (pending.length === 1 && pending[0].role === next) return true;
  }
  return false;
}

export function canUserActOnLoan(
  loan: { workflow?: LoanWorkflowLike; status?: string } | null,
  user: { role?: string; _id?: string; id?: string; userId?: string } | null,
  loanSettings: LoanSettingsWorkflowLike | null
): boolean {
  if (!loan || !user) return false;
  if (loan.workflow?.currentStep === 'completed' || loan.workflow?.isCompleted) return false;
  const terminal = ['approved', 'rejected', 'cancelled', 'disbursed', 'active', 'completed'];
  if (terminal.includes(String(loan.status || ''))) return false;

  const next = loan.workflow?.nextApprover || loan.workflow?.nextApproverRole;
  if (!next) return false;

  const userRole = user.role || '';
  if (['super_admin', 'sub_admin'].includes(userRole)) return true;

  if (next === 'final_authority') {
    const finalAuth = loanSettings?.workflow?.finalAuthority;
    if (!finalAuth?.role) return userRole === 'hr';
    if (['super_admin', 'sub_admin'].includes(userRole)) return true;
    if (finalAuth.role === 'hr' && userRole === 'hr') {
      if (finalAuth.anyHRCanApprove) return true;
      const uid = String(user._id || user.id || user.userId || '');
      return (finalAuth.authorizedHRUsers || []).some((id) => String(id) === uid);
    }
    if (finalAuth.role === 'specific_user') {
      const uid = String(user._id || user.id || user.userId || '');
      return String(finalAuth.userId) === uid;
    }
    return false;
  }

  if (next === userRole) return true;

  const allowBypass = loanSettings?.workflow?.allowHigherAuthorityToApproveLowerLevels === true;
  if (allowBypass && userRole === 'hr' && ['hod', 'manager'].includes(next)) return true;

  return false;
}

/**
 * Timeline rows for loan detail dialog — mirrors leave detail (dynamic approvalChain, no duplicate final step).
 */
export function buildLoanTimelineSteps(
  loan: {
    workflow?: LoanWorkflowLike;
    approvals?: { final?: { status?: string; approvedAt?: string; comments?: string } };
  },
  loanSettings: LoanSettingsWorkflowLike | null
): LoanTimelineStep[] {
  const next = loan.workflow?.nextApprover || loan.workflow?.nextApproverRole || null;
  const isCompleted = loan.workflow?.currentStep === 'completed' || loan.workflow?.isCompleted;

  let chain = loan.workflow?.approvalChain;
  if (!Array.isArray(chain) || chain.length === 0) {
    chain = buildFallbackApprovalChain(loan, loanSettings);
  }

  const displayChain = getLoanDisplayApprovalChain(chain, loanSettings);
  if (displayChain.length === 0) return [];

  return displayChain.map((step) =>
    chainStepToTimelineStep(step, { next, isCompleted: Boolean(isCompleted), loanSettings })
  );
}
