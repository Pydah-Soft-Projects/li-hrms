const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const OT = require('../../overtime/model/OT');
const Permission = require('../../permissions/model/Permission');
const {
  isAutoRejectPendingRequestsEnabled,
  resolveBatchEmployeePeriods,
} = require('./payrollRequestLockService');

function isTerminalRejectedStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'rejected' || s.endsWith('_rejected');
}

function overlapsRange(docStart, docEnd, rangeStart, rangeEnd) {
  const aStart = new Date(docStart);
  const aEnd = new Date(docEnd || docStart);
  const bStart = new Date(rangeStart);
  const bEnd = new Date(rangeEnd || rangeStart);
  return aStart <= bEnd && aEnd >= bStart;
}

function markWorkflowRejected(doc, userId, comments) {
  if (!doc?.workflow) return;

  const currentStep = Array.isArray(doc.workflow.approvalChain)
    ? doc.workflow.approvalChain.find((step) => step?.isCurrent || step?.status === 'pending')
    : null;

  if (currentStep) {
    currentStep.status = 'rejected';
    currentStep.isCurrent = false;
    currentStep.actionBy = userId;
    currentStep.actionByName = 'System';
    currentStep.actionByRole = 'system';
    currentStep.comments = comments;
    currentStep.updatedAt = new Date();
  }

  doc.workflow.isCompleted = true;
  doc.workflow.currentStepRole = null;
  doc.workflow.nextApprover = null;
  doc.workflow.nextApproverRole = null;
  doc.workflow.currentStep = 'completed';
  if (!Array.isArray(doc.workflow.history)) {
    doc.workflow.history = [];
  }
  doc.workflow.history.push({
    step: currentStep?.role || 'system',
    action: 'rejected',
    actionBy: userId,
    actionByName: 'System',
    actionByRole: 'system',
    comments,
    timestamp: new Date(),
  });
  doc.markModified('workflow');
}

async function autoRejectLeaveLikeRequests(Model, periods, userId, reason, options = {}) {
  const includeCancelled = options.includeCancelled !== false;
  const dryRun = options.dryRun === true;
  const modelName = Model.modelName;
  let count = 0;
  const rejected = [];

  for (const period of periods) {
    const docs = await Model.find({
      employeeId: period.employeeId,
      isActive: { $ne: false },
      status: {
        $nin: includeCancelled
          ? ['approved', 'rejected', 'cancelled']
          : ['approved', 'rejected'],
      },
    });

    for (const doc of docs) {
      if (isTerminalRejectedStatus(doc.status)) continue;
      if (!overlapsRange(doc.fromDate, doc.toDate, period.startDate, period.endDate)) continue;
      if (dryRun) {
        count += 1;
        rejected.push({
          model: modelName,
          id: String(doc._id),
          status: doc.status,
          periodLabel: period.label || null,
        });
        continue;
      }
      doc.status = 'rejected';
      markWorkflowRejected(doc, userId, reason);
      if (doc.approvals && doc.workflow?.approvalChain) {
        const lastRejectedStep = doc.workflow.approvalChain.find((step) => step.status === 'rejected');
        const role = lastRejectedStep?.role;
        if (role && doc.approvals[role]) {
          doc.approvals[role] = {
            status: 'rejected',
            approvedBy: userId,
            approvedAt: new Date(),
            comments: reason,
          };
          doc.markModified('approvals');
        }
      }
      await doc.save();
      count += 1;
      rejected.push({
        model: modelName,
        id: String(doc._id),
        status: 'rejected',
        periodLabel: period.label || null,
      });
    }
  }

  return { count, rejected };
}

async function autoRejectFlatRequests(Model, periods, userId, reason, options = {}) {
  const dryRun = options.dryRun === true;
  const modelName = Model.modelName;
  let count = 0;
  const rejected = [];

  for (const period of periods) {
    const docs = await Model.find({
      employeeId: period.employeeId,
      isActive: { $ne: false },
      date: { $gte: period.startDate, $lte: period.endDate },
      status: { $nin: ['approved', 'rejected', 'checked_out', 'checked_in'] },
    });

    for (const doc of docs) {
      if (isTerminalRejectedStatus(doc.status)) continue;
      if (doc.workflow) {
        if (!dryRun) markWorkflowRejected(doc, userId, reason);
      }
      if (dryRun) {
        count += 1;
        rejected.push({
          model: modelName,
          id: String(doc._id),
          status: doc.status,
          periodLabel: period.label || null,
        });
        continue;
      }
      doc.status = 'rejected';
      doc.rejectedBy = userId;
      doc.rejectedAt = new Date();
      doc.rejectionReason = reason;
      await doc.save();
      count += 1;
      rejected.push({
        model: modelName,
        id: String(doc._id),
        status: 'rejected',
        periodLabel: period.label || null,
      });
    }
  }

  return { count, rejected };
}

/**
 * Reject in-flight requests for explicit payroll periods (one row per employee+window).
 * Used by leave-register reconcile; does not check the payroll-batch settings toggle.
 * @param {object} [options]
 * @param {boolean} [options.leaveOnly] — when true, only Leave rows are rejected (register reconcile).
 */
async function autoRejectPendingRequestsForPayrollPeriods(periods, userId, reason, options = {}) {
  const dryRun = options.dryRun === true;
  const leaveOnly = options.leaveOnly === true;
  if (!Array.isArray(periods) || periods.length === 0) {
    return {
      dryRun,
      leaveOnly,
      leaveRejected: 0,
      odRejected: 0,
      permissionRejected: 0,
      otRejected: 0,
      rejected: [],
    };
  }

  const rejectOpts = { dryRun };
  const leave = await autoRejectLeaveLikeRequests(Leave, periods, userId, reason, rejectOpts);

  let od = { count: 0, rejected: [] };
  let permission = { count: 0, rejected: [] };
  let ot = { count: 0, rejected: [] };
  if (!leaveOnly) {
    [od, permission, ot] = await Promise.all([
      autoRejectLeaveLikeRequests(OD, periods, userId, reason, rejectOpts),
      autoRejectFlatRequests(Permission, periods, userId, reason, rejectOpts),
      autoRejectFlatRequests(OT, periods, userId, reason, rejectOpts),
    ]);
  }

  const rejected = [...leave.rejected, ...od.rejected, ...permission.rejected, ...ot.rejected];

  return {
    dryRun,
    leaveOnly,
    leaveRejected: leave.count,
    odRejected: od.count,
    permissionRejected: permission.count,
    otRejected: ot.count,
    rejected,
  };
}

async function autoRejectPendingRequestsForCompletedBatch(batch, userId) {
  const enabled = await isAutoRejectPendingRequestsEnabled();
  if (!enabled) {
    return {
      enabled: false,
      leaveRejected: 0,
      odRejected: 0,
      permissionRejected: 0,
      otRejected: 0,
    };
  }

  const periods = await resolveBatchEmployeePeriods(batch);
  if (!periods.length) {
    return {
      enabled: true,
      leaveRejected: 0,
      odRejected: 0,
      permissionRejected: 0,
      otRejected: 0,
    };
  }

  const reason = `Auto-rejected because payroll batch was completed for ${batch.month}`;

  const summary = await autoRejectPendingRequestsForPayrollPeriods(periods, userId, reason);

  return {
    enabled: true,
    leaveRejected: summary.leaveRejected,
    odRejected: summary.odRejected,
    permissionRejected: summary.permissionRejected,
    otRejected: summary.otRejected,
  };
}

module.exports = {
  autoRejectPendingRequestsForCompletedBatch,
  autoRejectPendingRequestsForPayrollPeriods,
};
