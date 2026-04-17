const Leave = require('../../leaves/model/Leave');
const OD = require('../../leaves/model/OD');
const OT = require('../../overtime/model/OT');
const Permission = require('../../permissions/model/Permission');
const {
  isAutoRejectPendingRequestsEnabled,
  resolveBatchEmployeePeriods,
} = require('./payrollRequestLockService');

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

async function autoRejectLeaveLikeRequests(Model, periods, userId, reason, includeCancelled = true) {
  let count = 0;

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
      if (!overlapsRange(doc.fromDate, doc.toDate, period.startDate, period.endDate)) continue;
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
    }
  }

  return count;
}

async function autoRejectFlatRequests(Model, periods, userId, reason) {
  let count = 0;

  for (const period of periods) {
    const docs = await Model.find({
      employeeId: period.employeeId,
      isActive: { $ne: false },
      date: { $gte: period.startDate, $lte: period.endDate },
      status: { $nin: ['approved', 'rejected', 'checked_out', 'checked_in'] },
    });

    for (const doc of docs) {
      if (doc.workflow) {
        markWorkflowRejected(doc, userId, reason);
      }
      doc.status = 'rejected';
      doc.rejectedBy = userId;
      doc.rejectedAt = new Date();
      doc.rejectionReason = reason;
      await doc.save();
      count += 1;
    }
  }

  return count;
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

  const [leaveRejected, odRejected, permissionRejected, otRejected] = await Promise.all([
    autoRejectLeaveLikeRequests(Leave, periods, userId, reason),
    autoRejectLeaveLikeRequests(OD, periods, userId, reason),
    autoRejectFlatRequests(Permission, periods, userId, reason),
    autoRejectFlatRequests(OT, periods, userId, reason),
  ]);

  return {
    enabled: true,
    leaveRejected,
    odRejected,
    permissionRejected,
    otRejected,
  };
}

module.exports = {
  autoRejectPendingRequestsForCompletedBatch,
};
