jest.mock('../../model/Leave');
jest.mock('../../model/OD');
jest.mock('../../model/LeaveSettings', () => ({
  getActiveSettings: jest.fn().mockResolvedValue({
    workflow: {
      allowHigherAuthorityToApproveLowerLevels: false,
      steps: [],
      finalAuthority: { role: 'hr' },
    },
  }),
}));
jest.mock('../../../employees/model/Employee', () => ({
  findById: jest.fn(),
}));
jest.mock('../../../users/model/User', () => ({
  findById: jest.fn(),
}));
jest.mock('../../../settings/model/Settings', () => ({}));
jest.mock('../../../employees/config/sqlHelper', () => ({
  isHRMSConnected: jest.fn().mockReturnValue(false),
  getEmployeeByIdMSSQL: jest.fn(),
}));
jest.mock('../../../departments/controllers/departmentSettingsController', () => ({
  getResolvedLeaveSettings: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../../shared/middleware/dataScopeMiddleware', () => ({
  buildWorkflowVisibilityFilter: jest.fn(),
  getEmployeeIdsInScope: jest.fn(),
  checkJurisdiction: jest.fn().mockReturnValue(true),
}));
jest.mock('../../../departments/model/Department', () => ({}));
jest.mock('../../../employees/model/EmployeeHistory', () => ({
  create: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../../shifts/model/PreScheduledShift', () => ({}));
jest.mock('../../../attendance/model/AttendanceDaily', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../services/leaveRegisterService', () => ({
  addLeaveDebit: jest.fn().mockResolvedValue({}),
  addTransaction: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../../notifications/services/notificationService', () => ({
  notifyWorkflowEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/dateCycleService', () => ({}));
jest.mock('../../services/leaveRegisterYearMonthlyApplyService', () => ({
  syncStoredMonthApplyFieldsForEmployeeDate: jest.fn().mockResolvedValue(undefined),
  scheduleSyncMonthApply: jest.fn(),
}));
jest.mock('../../services/leaveRegisterYearService', () => ({}));
jest.mock('../../services/leaveRegisterPdfExportService', () => ({
  streamLeaveRegisterPdf: jest.fn(),
}));
jest.mock('../../services/leaveRegisterExportShared', () => ({
  resolveLeaveRegisterExportRequest: jest.fn(),
}));
jest.mock('../../services/leaveRegisterXlsxExportService', () => ({
  buildLeaveRegisterXlsxBuffer: jest.fn(),
}));
jest.mock('../../../overtime/services/esiLeaveOtService', () => ({
  syncEsiLeaveOtForLeave: jest.fn().mockResolvedValue(undefined),
  isEsiLeaveType: jest.fn().mockReturnValue(false),
}));
jest.mock('../../../shared/services/conflictValidationService', () => ({
  validateLeaveRequest: jest.fn().mockResolvedValue({ isValid: true }),
  validateODRequest: jest.fn().mockResolvedValue({ isValid: true }),
}));
jest.mock('../../../shared/services/payrollRequestLockService', () => ({
  assertEmployeeRangeRequestsEditable: jest.fn(),
}));
jest.mock('../../../attendance/services/summaryCalculationService', () => ({
  recalculateOnAttendanceUpdate: jest.fn().mockResolvedValue(undefined),
}));

const Leave = require('../../model/Leave');
const OD = require('../../model/OD');
const { assertEmployeeRangeRequestsEditable } = require('../../../shared/services/payrollRequestLockService');
const leaveController = require('../leaveController');
const odController = require('../odController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function buildLeaveDoc() {
  return {
    _id: 'leave-1',
    employeeId: 'emp-1',
    emp_no: '2144',
    fromDate: '2026-04-10',
    toDate: '2026-04-10',
    numberOfDays: 1,
    leaveType: 'CL',
    status: 'pending',
    approvals: {},
    workflow: {
      approvalChain: [{ role: 'hod', status: 'pending', isCurrent: true }],
      finalAuthority: 'hr',
      currentStepRole: 'hod',
      nextApprover: 'hod',
      nextApproverRole: 'hod',
      currentStep: 'hod',
      history: [],
      isCompleted: false,
    },
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(true),
    populate: jest.fn().mockResolvedValue(true),
  };
}

function buildOdDoc() {
  return {
    _id: 'od-1',
    employeeId: 'emp-1',
    emp_no: '2144',
    fromDate: '2026-04-10',
    toDate: '2026-04-10',
    numberOfDays: 1,
    odType: 'OFFICIAL',
    odType_extended: 'full_day',
    status: 'pending',
    approvals: {},
    workflow: {
      approvalChain: [{ role: 'hod', status: 'pending', isCurrent: true }],
      finalAuthority: 'hr',
      currentStepRole: 'hod',
      nextApprover: 'hod',
      nextApproverRole: 'hod',
      currentStep: 'hod',
      history: [],
      isCompleted: false,
      reportingManagerIds: [],
    },
    save: jest.fn().mockResolvedValue(true),
    populate: jest.fn().mockResolvedValue(true),
  };
}

describe('payroll lock approval simulations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('leave approve is blocked with 409 after payroll completion', async () => {
    Leave.findById.mockResolvedValue(buildLeaveDoc());
    assertEmployeeRangeRequestsEditable.mockRejectedValue(
      Object.assign(new Error('locked'), {
        code: 'PAYROLL_BATCH_COMPLETED',
        reason: 'payroll_batch_completed',
        statusCode: 409,
      })
    );

    const req = {
      params: { id: 'leave-1' },
      body: { action: 'approve', comments: 'ok' },
      user: { _id: 'user-1', userId: 'user-1', role: 'sub_admin', name: 'Tester' },
    };
    const res = mockRes();

    await leaveController.processLeaveAction(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'PAYROLL_BATCH_COMPLETED',
        reason: 'payroll_batch_completed',
      })
    );
  });

  test('leave reject still succeeds in locked payroll period', async () => {
    const leaveDoc = buildLeaveDoc();
    Leave.findById.mockResolvedValue(leaveDoc);

    const req = {
      params: { id: 'leave-1' },
      body: { action: 'reject', comments: 'manual reject allowed' },
      user: { _id: 'user-1', userId: 'user-1', role: 'sub_admin', name: 'Tester' },
    };
    const res = mockRes();

    await leaveController.processLeaveAction(req, res);

    expect(assertEmployeeRangeRequestsEditable).not.toHaveBeenCalled();
    expect(leaveDoc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(leaveDoc.status).toBe('rejected');
  });

  test('OD approve is blocked with 409 after payroll completion', async () => {
    OD.findById.mockResolvedValue(buildOdDoc());
    assertEmployeeRangeRequestsEditable.mockRejectedValue(
      Object.assign(new Error('locked'), {
        code: 'PAYROLL_BATCH_COMPLETED',
        reason: 'payroll_batch_completed',
        statusCode: 409,
      })
    );

    const req = {
      params: { id: 'od-1' },
      body: { action: 'approve', comments: 'ok' },
      user: { _id: 'user-1', userId: 'user-1', role: 'sub_admin', name: 'Tester' },
      scopedUser: { _id: 'user-1', role: 'sub_admin' },
    };
    const res = mockRes();

    await odController.processODAction(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'PAYROLL_BATCH_COMPLETED',
      })
    );
  });

  test('OD reject still succeeds in locked payroll period', async () => {
    const odDoc = buildOdDoc();
    OD.findById.mockResolvedValue(odDoc);

    const req = {
      params: { id: 'od-1' },
      body: { action: 'reject', comments: 'manual reject allowed' },
      user: { _id: 'user-1', userId: 'user-1', role: 'sub_admin', name: 'Tester' },
      scopedUser: { _id: 'user-1', role: 'sub_admin' },
    };
    const res = mockRes();

    await odController.processODAction(req, res);

    expect(assertEmployeeRangeRequestsEditable).not.toHaveBeenCalled();
    expect(odDoc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(odDoc.status).toBe('hod_rejected');
  });
});
