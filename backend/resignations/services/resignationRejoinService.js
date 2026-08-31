const ResignationRequest = require('../model/ResignationRequest');
const EmployeeHistory = require('../../employees/model/EmployeeHistory');

function formatISTTimestamp(date = new Date()) {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

/**
 * Cancel approved/pending resignation requests when an employee rejoins.
 * Prevents the daily resignation cron from re-deactivating rejoined employees.
 *
 * @returns {{ cancelledCount: number, cancelledIds: string[] }}
 */
async function cancelResignationsOnRejoin({ empNo, employeeId, rejoinApplicationId, approver }) {
  const approverId = approver?._id || approver || null;
  const approverName = approver?.name || 'System';
  const approverRole = approver?.role || null;
  const empNoUpper = String(empNo || '').trim().toUpperCase();

  const requests = await ResignationRequest.find({
    $or: [{ emp_no: empNoUpper }, ...(employeeId ? [{ employeeId }] : [])],
    status: { $in: ['approved', 'pending'] },
    requestType: 'resignation',
  });

  const cancelledIds = [];

  for (const req of requests) {
    const previousStatus = req.status;
    req.status = 'cancelled';
    req.workflow = req.workflow || {};
    req.workflow.isCompleted = true;
    req.workflow.currentStepRole = null;
    req.workflow.nextApproverRole = null;
    if (!Array.isArray(req.workflow.history)) req.workflow.history = [];
    req.workflow.history.push({
      step: 'rejoin',
      action: 'cancelled',
      actionBy: approverId,
      actionByName: approverName,
      actionByRole: approverRole,
      comments: rejoinApplicationId
        ? `Cancelled due to employee rejoin (application ${rejoinApplicationId})`
        : 'Cancelled due to employee rejoin',
      timestamp: new Date(),
      timestampIST: formatISTTimestamp(),
    });
    await req.save();
    cancelledIds.push(String(req._id));

    await EmployeeHistory.create({
      emp_no: empNoUpper,
      event: 'resignation_cancelled',
      performedBy: approverId,
      performedByName: approverName,
      performedByRole: approverRole,
      details: {
        resignationId: req._id,
        previousStatus,
        rejoinApplicationId: rejoinApplicationId || null,
        previousLeftDate: req.leftDate || null,
      },
      comments: 'Resignation cancelled because employee rejoined',
    }).catch((err) => {
      console.error(`[Rejoin] Failed to log resignation cancellation for ${empNoUpper}:`, err.message);
    });
  }

  if (cancelledIds.length > 0) {
    console.log(
      `[Rejoin] Cancelled ${cancelledIds.length} resignation request(s) for ${empNoUpper}: ${cancelledIds.join(', ')}`
    );
  }

  return { cancelledCount: cancelledIds.length, cancelledIds };
}

module.exports = { cancelResignationsOnRejoin };
