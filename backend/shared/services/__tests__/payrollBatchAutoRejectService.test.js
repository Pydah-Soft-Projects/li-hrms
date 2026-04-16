jest.mock('../../../leaves/model/Leave');
jest.mock('../../../leaves/model/OD');
jest.mock('../../../overtime/model/OT');
jest.mock('../../../permissions/model/Permission');
jest.mock('../payrollRequestLockService', () => ({
  isAutoRejectPendingRequestsEnabled: jest.fn(),
  resolveBatchEmployeePeriods: jest.fn(),
}));

const Leave = require('../../../leaves/model/Leave');
const OD = require('../../../leaves/model/OD');
const OT = require('../../../overtime/model/OT');
const Permission = require('../../../permissions/model/Permission');
const {
  isAutoRejectPendingRequestsEnabled,
  resolveBatchEmployeePeriods,
} = require('../payrollRequestLockService');
const {
  autoRejectPendingRequestsForCompletedBatch,
} = require('../payrollBatchAutoRejectService');

function buildWorkflowDoc(status = 'pending') {
  return {
    status,
    workflow: {
      approvalChain: [{ role: 'hod', status: 'pending', isCurrent: true }],
      history: [],
      isCompleted: false,
      currentStepRole: 'hod',
      nextApproverRole: 'hod',
      nextApprover: 'hod',
      currentStep: 'hod',
    },
    approvals: {
      hod: { status: null, approvedBy: null, approvedAt: null, comments: null },
    },
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(true),
  };
}

describe('payrollBatchAutoRejectService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns disabled summary when payroll setting is off', async () => {
    isAutoRejectPendingRequestsEnabled.mockResolvedValue(false);

    const result = await autoRejectPendingRequestsForCompletedBatch(
      { _id: 'batch-1', month: '2026-04' },
      'system-user'
    );

    expect(result).toEqual({
      enabled: false,
      leaveRejected: 0,
      odRejected: 0,
      permissionRejected: 0,
      otRejected: 0,
    });
    expect(resolveBatchEmployeePeriods).not.toHaveBeenCalled();
  });

  test('auto-rejects non-final requests within completed payroll period for the batch employees only', async () => {
    isAutoRejectPendingRequestsEnabled.mockResolvedValue(true);
    resolveBatchEmployeePeriods.mockResolvedValue([
      {
        employeeId: 'emp-1',
        month: '2026-04',
        startDate: '2026-03-26',
        endDate: '2026-04-25',
      },
    ]);

    const leavePending = {
      ...buildWorkflowDoc('pending'),
      employeeId: 'emp-1',
      fromDate: '2026-04-10',
      toDate: '2026-04-11',
    };
    const odPending = {
      ...buildWorkflowDoc('manager_approved'),
      employeeId: 'emp-1',
      fromDate: '2026-04-05',
      toDate: '2026-04-05',
    };
    const permissionPending = {
      ...buildWorkflowDoc('pending'),
      employeeId: 'emp-1',
      date: '2026-04-08',
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      save: jest.fn().mockResolvedValue(true),
    };
    const otPending = {
      ...buildWorkflowDoc('hod_approved'),
      employeeId: 'emp-1',
      date: '2026-04-09',
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      save: jest.fn().mockResolvedValue(true),
    };

    Leave.find.mockResolvedValue([leavePending]);
    OD.find.mockResolvedValue([odPending]);
    Permission.find.mockResolvedValue([permissionPending]);
    OT.find.mockResolvedValue([otPending]);

    const result = await autoRejectPendingRequestsForCompletedBatch(
      { _id: 'batch-1', month: '2026-04' },
      'system-user'
    );

    expect(result).toEqual({
      enabled: true,
      leaveRejected: 1,
      odRejected: 1,
      permissionRejected: 1,
      otRejected: 1,
    });

    expect(leavePending.status).toBe('rejected');
    expect(leavePending.workflow.isCompleted).toBe(true);
    expect(leavePending.save).toHaveBeenCalled();
    expect(odPending.status).toBe('rejected');
    expect(permissionPending.status).toBe('rejected');
    expect(permissionPending.rejectionReason).toMatch(/Auto-rejected because payroll batch was completed/);
    expect(otPending.status).toBe('rejected');
    expect(otPending.rejectionReason).toMatch(/2026-04/);
  });
});
