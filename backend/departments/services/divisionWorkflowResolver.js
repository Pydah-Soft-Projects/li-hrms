const DivisionWorkflowSettings = require('../model/DivisionWorkflowSettings');
const LeaveSettings = require('../../leaves/model/LeaveSettings');
const LoanSettings = require('../../loans/model/LoanSettings');
const PermissionDeductionSettings = require('../../permissions/model/PermissionDeductionSettings');
const PromotionTransferSettings = require('../../promotions-transfers/model/PromotionTransferSettings');

function toPlain(doc) {
  if (!doc) return null;
  return doc.toObject ? doc.toObject() : { ...doc };
}

function mergeWorkflowObjects(globalWf, overrideWf) {
  if (overrideWf == null || typeof overrideWf !== 'object') return globalWf;
  const base = globalWf && typeof globalWf === 'object' ? { ...globalWf } : {};
  const out = { ...base, ...overrideWf };
  if (Array.isArray(overrideWf.steps)) out.steps = overrideWf.steps;
  return out;
}

function normalizeDivisionId(divisionId) {
  if (!divisionId) return null;
  if (typeof divisionId === 'object' && divisionId._id) return divisionId._id;
  return divisionId;
}

/**
 * @param {object|null} globalWorkflow
 * @param {import('mongoose').Types.ObjectId|string|null} divisionId
 * @param {'leave'|'od'|'ccl'|'loan'|'salary_advance'|'permission'|'ot'|'promotions_transfers'} key
 */
async function applyDivisionWorkflowOverride(globalWorkflow, divisionId, key) {
  const divId = normalizeDivisionId(divisionId);
  if (!divId) return globalWorkflow;
  const doc = await DivisionWorkflowSettings.findOne({ division: divId }).lean();
  const ov = doc?.workflows?.[key];
  return mergeWorkflowObjects(globalWorkflow, ov);
}

const DEFAULT_LEAVE_WORKFLOW = {
  isEnabled: true,
  steps: [
    {
      stepOrder: 1,
      stepName: 'HOD Approval',
      approverRole: 'hod',
      availableActions: ['approve', 'reject'],
      approvedStatus: 'hod_approved',
      rejectedStatus: 'hod_rejected',
      nextStepOnApprove: 2,
      isActive: true,
    },
    {
      stepOrder: 2,
      stepName: 'HR Approval',
      approverRole: 'hr',
      availableActions: ['approve', 'reject'],
      approvedStatus: 'approved',
      rejectedStatus: 'hr_rejected',
      nextStepOnApprove: null,
      isActive: true,
    },
  ],
  finalAuthority: { role: 'hr', anyHRCanApprove: true },
};

async function resolveLeaveTypeWorkflowSettings(type, divisionId) {
  let settings = await LeaveSettings.getActiveSettings(type);
  if (!settings) {
    const wf = await applyDivisionWorkflowOverride(DEFAULT_LEAVE_WORKFLOW, divisionId, type);
    if (type === 'od') {
      return {
        type: 'od',
        workflow: wf,
        settings: {
          allowBackdated: false,
          maxBackdatedDays: 0,
          allowFutureDated: true,
          maxAdvanceDays: 365,
        },
      };
    }
    return {
      type,
      workflow: wf,
      settings: {},
    };
  }
  const plain = toPlain(settings);
  plain.workflow = await applyDivisionWorkflowOverride(plain.workflow, divisionId, type);
  return plain;
}

async function resolveLoanWorkflowSettings(requestType, divisionId) {
  const key = requestType === 'salary_advance' ? 'salary_advance' : 'loan';
  let settings = await LoanSettings.getActiveSettings(requestType);
  if (!settings) {
    const defaultWf = {
      isEnabled: true,
      steps: [
        {
          stepOrder: 1,
          stepName: 'HOD Approval',
          approverRole: 'hod',
          availableActions: ['approve', 'reject', 'forward'],
          approvedStatus: 'hod_approved',
          rejectedStatus: 'hod_rejected',
          nextStepOnApprove: 2,
          isActive: true,
        },
        {
          stepOrder: 2,
          stepName: 'HR Approval',
          approverRole: 'hr',
          availableActions: ['approve', 'reject'],
          approvedStatus: 'approved',
          rejectedStatus: 'hr_rejected',
          nextStepOnApprove: null,
          isActive: true,
        },
      ],
      finalAuthority: { role: 'hr', anyHRCanApprove: true },
    };
    const wf = await applyDivisionWorkflowOverride(defaultWf, divisionId, key);
    return {
      workflow: wf,
      settings: {
        maxAmount: null,
        minAmount: 1000,
        maxDuration: 60,
        minDuration: 1,
      },
    };
  }
  const plain = toPlain(settings);
  plain.workflow = await applyDivisionWorkflowOverride(plain.workflow, divisionId, key);
  return plain;
}

async function resolvePermissionWorkflowSettings(divisionId) {
  const settings = await PermissionDeductionSettings.getActiveSettings();
  const plain = toPlain(settings) || { workflow: {} };
  if (!plain.workflow) plain.workflow = {};
  plain.workflow = await applyDivisionWorkflowOverride(plain.workflow, divisionId, 'permission');
  return plain;
}

const DEFAULT_PROMOTION_TRANSFER_WORKFLOW = {
  isEnabled: true,
  steps: [
    { stepOrder: 1, stepName: 'HOD approval', approverRole: 'hod' },
  ],
  finalAuthority: { role: 'hr', anyHRCanApprove: true },
  allowHigherAuthorityToApproveLowerLevels: false,
};

/**
 * Global promotion & transfer workflow merged with optional division override
 * (`workflows.promotions_transfers` on DivisionWorkflowSettings).
 *
 * @param {import('mongoose').Types.ObjectId|string|null|undefined} divisionId
 * @returns {Promise<{ workflow: Record<string, any> }>}
 */
async function resolvePromotionTransferWorkflowSettings(divisionId) {
  const settings = await PromotionTransferSettings.getActiveSettings();
  if (!settings) {
    const workflow = await applyDivisionWorkflowOverride(
      { ...DEFAULT_PROMOTION_TRANSFER_WORKFLOW },
      divisionId,
      'promotions_transfers'
    );
    return { workflow };
  }
  const plain = toPlain(settings);
  const globalWf =
    plain.workflow && typeof plain.workflow === 'object' ? plain.workflow : { ...DEFAULT_PROMOTION_TRANSFER_WORKFLOW };
  const workflow = await applyDivisionWorkflowOverride(globalWf, divisionId, 'promotions_transfers');
  return { workflow };
}

module.exports = {
  mergeWorkflowObjects,
  applyDivisionWorkflowOverride,
  resolveLeaveTypeWorkflowSettings,
  resolveLoanWorkflowSettings,
  resolvePermissionWorkflowSettings,
  resolvePromotionTransferWorkflowSettings,
};
