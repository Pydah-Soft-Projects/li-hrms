jest.mock('../../model/Permission', () => ({
  findById: jest.fn(),
}));
jest.mock('../../model/PermissionDeductionSettings', () => ({}));
jest.mock('../../services/permissionService', () => ({
  createPermissionRequest: jest.fn(),
  approvePermissionRequest: jest.fn(),
  rejectPermissionRequest: jest.fn(),
  getOutpassByQR: jest.fn(),
}));
jest.mock('../../../shared/middleware/dataScopeMiddleware', () => ({
  buildWorkflowVisibilityFilter: jest.fn(),
  getEmployeeIdsInScope: jest.fn(),
}));
jest.mock('../../../notifications/services/notificationService', () => ({
  notifyWorkflowEvent: jest.fn().mockResolvedValue(undefined),
}));

const Permission = require('../../model/Permission');
const {
  approvePermissionRequest,
  rejectPermissionRequest,
} = require('../../services/permissionService');
const permissionController = require('../permissionController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('permission payroll lock approval flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('approve returns 409 when service reports payroll lock', async () => {
    approvePermissionRequest.mockResolvedValue({
      success: false,
      statusCode: 409,
      code: 'PAYROLL_BATCH_COMPLETED',
      reason: 'payroll_batch_completed',
      message: 'Requests are locked',
    });

    const req = {
      params: { id: 'permission-1' },
      user: { _id: 'user-1', userId: 'user-1', role: 'hr', name: 'Tester' },
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:5000'),
    };
    const res = mockRes();

    await permissionController.approvePermission(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'PAYROLL_BATCH_COMPLETED',
      })
    );
  });

  test('reject still succeeds when service allows rejection', async () => {
    rejectPermissionRequest.mockResolvedValue({
      success: true,
      message: 'Permission request rejected successfully',
      data: { _id: 'permission-1' },
    });
    Permission.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
    });

    const req = {
      params: { id: 'permission-1' },
      body: { reason: 'manual reject allowed' },
      user: { _id: 'user-1', userId: 'user-1', role: 'hr', name: 'Tester' },
    };
    const res = mockRes();

    await permissionController.rejectPermission(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });
});
