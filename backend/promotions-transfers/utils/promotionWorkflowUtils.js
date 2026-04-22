/**
 * Single source of truth for promotion/transfer approval configuration steps
 * (must match PromotionTransferSettings model enum and UI WorkflowManager).
 */
const CONFIG_APPROVER_ROLES = new Set(['hod', 'hr', 'manager', 'super_admin', 'reporting_manager']);

/** Roles allowed as `workflow.finalAuthority.role` in PromotionTransferSettings. */
const FINAL_AUTHORITY_ROLES = new Set(['hr', 'super_admin', 'manager', 'reporting_manager']);

/** Default labels from WorkflowManager like "Level 2 Approval" — replace with role-based text. */
const GENERIC_LEVEL_STEP_NAME = /^level\s*\d+\s*approval$/i;

const ROLE_DISPLAY_LABEL = {
  reporting_manager: 'Reporting manager',
  hod: 'Department head (HOD)',
  manager: 'Division manager',
  hr: 'HR',
  super_admin: 'Administrator',
};

/**
 * @param {string} role
 * @param {string} [stepName] from settings
 * @returns {string}
 */
function chainStepLabel(role, stepName) {
  const r = String(role || '')
    .toLowerCase()
    .trim();
  const sn = (stepName && String(stepName).trim()) || '';
  if (sn && !GENERIC_LEVEL_STEP_NAME.test(sn)) {
    return sn;
  }
  if (ROLE_DISPLAY_LABEL[r]) {
    return ROLE_DISPLAY_LABEL[r];
  }
  return r
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * @param {import('mongoose').Document|Object|null|undefined} settings
 */
function toPlainWorkflow(settings) {
  if (!settings) return {};
  const o = settings.toObject ? settings.toObject() : { ...settings };
  return o.workflow || {};
}

/**
 * @param {Record<string, any>} wf plain workflow
 * @returns {string}
 */
function normalizeFinalAuthorityRole(wf) {
  const r = String(wf?.finalAuthority?.role || 'hr')
    .toLowerCase()
    .trim();
  if (FINAL_AUTHORITY_ROLES.has(r)) return r;
  return 'hr';
}

/**
 * Ensures a distinct final-approval step exists when the chain does not already end with that role
 * (e.g. legacy RM/HOD-only chains otherwise complete without HR).
 *
 * @param {Array<{ role?: string; label?: string; status?: string; stepOrder?: number; isCurrent?: boolean }>} approvalSteps
 * @param {Record<string, any>} wf
 */
function appendFinalAuthorityStepIfNeeded(approvalSteps, wf) {
  const last = approvalSteps[approvalSteps.length - 1];
  if (!last) return;
  const faRole = normalizeFinalAuthorityRole(wf);
  if (String(last.role || '').toLowerCase() === faRole) return;
  approvalSteps.push({
    stepOrder: approvalSteps.length + 1,
    role: faRole,
    label: chainStepLabel(faRole, 'Final approval'),
    status: 'pending',
    isCurrent: false,
  });
}

/**
 * Sanitize config steps for persistence and for building the same chain at request time.
 * - Sorts by stepOrder
 * - Normalizes approverRole
 * - Drops invalid roles
 * - Keeps HOD / reporting_manager as configured (admins may place reporting manager anywhere in the chain)
 * - Renumbers stepOrder 1..n
 *
 * @param {any[]} steps
 * @returns {Array<{ stepOrder: number; approverRole: string; stepName: string }>}
 */
function sanitizePromotionWorkflowConfigSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return [];

  return [...steps]
    .map((s, idx) => ({
      stepOrder: Number(s.stepOrder) || idx + 1,
      approverRole: String(s.approverRole || s.role || '')
        .toLowerCase()
        .trim(),
      stepName: (s.stepName && String(s.stepName).trim()) || '',
    }))
    .filter((s) => s.approverRole && CONFIG_APPROVER_ROLES.has(s.approverRole))
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((s, i) => ({
      stepOrder: i + 1,
      approverRole: s.approverRole,
      stepName: s.stepName || `${s.approverRole.toUpperCase()} approval`,
    }));
}

/**
 * Build the approval chain for a new request from global settings + employee.
 *
 * - When multi-level workflow is **on** and **at least one** stage is configured, that ordered list is the **entire**
 *   chain (no automatic reporting-manager or HOD prefix). Add `reporting_manager` as the first stage in settings if required.
 * - When workflow is **off** or **no** stages are configured, use the legacy single first approver: reporting manager if set on
 *   the employee, otherwise HOD, then any configured steps (normally empty).
 * - After the chain is built, if the last step is not already `workflow.finalAuthority.role` (default **hr**), that final-approval
 *   role is appended so HR (or the configured final authority) is always required unless it already appears last.
 *
 * @param {import('mongoose').Document|Object} employee
 * @param {import('mongoose').Document|Object|null|undefined} settings
 */
function buildApprovalChain(employee, settings) {
  const wf = toPlainWorkflow(settings);
  const workflowEnabled = wf.isEnabled !== false;
  const extraSteps = workflowEnabled ? sanitizePromotionWorkflowConfigSteps(wf.steps || []) : [];

  const reportingManagers = employee.dynamicFields?.reporting_to || employee.dynamicFields?.reporting_to_ || [];
  const hasReportingManager = Array.isArray(reportingManagers) && reportingManagers.length > 0;

  const approvalSteps = [];
  const useConfiguredChainOnly = workflowEnabled && extraSteps.length > 0;

  if (useConfiguredChainOnly) {
    extraSteps.forEach((s) => {
      const last = approvalSteps[approvalSteps.length - 1];
      if (last && last.role === s.approverRole) {
        return;
      }
      approvalSteps.push({
        stepOrder: approvalSteps.length + 1,
        role: s.approverRole,
        label: chainStepLabel(s.approverRole, s.stepName),
        status: 'pending',
        isCurrent: false,
      });
    });
  } else {
    if (hasReportingManager) {
      approvalSteps.push({
        stepOrder: 1,
        role: 'reporting_manager',
        label: chainStepLabel('reporting_manager'),
        status: 'pending',
        isCurrent: true,
      });
    } else {
      approvalSteps.push({
        stepOrder: 1,
        role: 'hod',
        label: chainStepLabel('hod'),
        status: 'pending',
        isCurrent: true,
      });
    }

    extraSteps.forEach((s) => {
      const last = approvalSteps[approvalSteps.length - 1];
      if (last && last.role === s.approverRole) {
        return;
      }
      approvalSteps.push({
        stepOrder: approvalSteps.length + 1,
        role: s.approverRole,
        label: chainStepLabel(s.approverRole, s.stepName),
        status: 'pending',
        isCurrent: false,
      });
    });
  }

  appendFinalAuthorityStepIfNeeded(approvalSteps, wf);

  if (approvalSteps.length === 0) {
    approvalSteps.push({
      stepOrder: 1,
      role: 'hr',
      label: chainStepLabel('hr'),
      status: 'pending',
      isCurrent: true,
    });
  }

  approvalSteps.forEach((row, i) => {
    row.stepOrder = i + 1;
    row.isCurrent = i === 0;
  });

  const firstRole = approvalSteps[0].role;
  const lastRole = approvalSteps[approvalSteps.length - 1].role;
  const finalAuthority = lastRole;

  return {
    approvalSteps,
    firstRole,
    finalAuthority,
    reportingManagerIds: hasReportingManager ? reportingManagers.map((m) => (m._id || m).toString()) : [],
  };
}

module.exports = {
  CONFIG_APPROVER_ROLES,
  buildApprovalChain,
  sanitizePromotionWorkflowConfigSteps,
  toPlainWorkflow,
  chainStepLabel,
};
