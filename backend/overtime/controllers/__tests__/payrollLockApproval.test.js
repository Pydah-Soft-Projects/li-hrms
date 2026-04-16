jest.mock('../../model/OT', () => ({
  findById: jest.fn(),
}));
jest.mock('../../../attendance/model/AttendanceDaily', () => ({}));
jest.mock('../../../shifts/model/ConfusedShift', () => ({}));
jest.mock('../../../employees/model/Employee', () => ({}));
jest.mock('../../services/otService', () => ({
  createOTRequest: jest.fn(),
  approveOTRequest: jest.fn(),
  rejectOTRequest: jest.fn(),
  convertExtraHoursToOT: jest.fn(),
  previewConvertExtraHoursToOT: jest.fn(),
  simulateOtHoursPolicy: jest.fn(),
}));
jest.mock('../../../shared/middleware/dataScopeMiddleware', () => ({
  buildWorkflowVisibilityFilter: jest.fn(),
  getEmployeeIdsInScope: jest.fn(),
}));
jest.mock('../../../notifications/services/notificationService', () => ({
  notifyWorkflowEvent: jest.fn().mockResolvedValue(undefined),
}));

const OT = require('../../model/OT');
const { approveOTRequest, rejectOTRequest } = require('../../services/otService');
const otController = require('../otController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('OT payroll lock approval flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('approve returns 409 when service reports payroll lock', async () => {
    approveOTRequest.mockResolvedValue({
      success: false,
      statusCode: 409,
      code: 'PAYROLL_BATCH_COMPLETED',
      reason: 'payroll_batch_completed',
      message: 'Requests are locked',
    });

    const req = {
      params: { id: 'ot-1' },
      user: { _id: 'user-1', userId: 'user-1', role: 'hr', name: 'Tester' },
    };
    const res = mockRes();

    await otController.approveOT(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'PAYROLL_BATCH_COMPLETED',
      })
    );
  });

  test('reject still succeeds when service allows rejection', async () => {
    rejectOTRequest.mockResolvedValue({
      success: true,
      message: 'OT request rejected successfully',
      data: { _id: 'ot-1' },
    });
    OT.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
    });

    const req = {
      params: { id: 'ot-1' },
      body: { reason: 'manual reject allowed' },
      user: { _id: 'user-1', userId: 'user-1', role: 'hr', name: 'Tester' },
    };
    const res = mockRes();

    await otController.rejectOT(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });
});
