/**
 * Tests bulk approve / freeze / complete handlers (mocked PayrollBatchService).
 */

jest.mock('../../services/payrollBatchService', () => ({
  changeStatus: jest.fn(),
}));

const PayrollBatchService = require('../../services/payrollBatchService');
const payrollBatchController = require('../payrollBatchController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const user = { _id: 'user-id-1' };

describe('payrollBatchController bulk status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('bulkApproveBatches', () => {
    test('returns 400 when batchIds is missing', async () => {
      const req = { body: { reason: 'ok' }, user };
      const res = mockRes();
      await payrollBatchController.bulkApproveBatches(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringMatching(/required/i) }),
      );
      expect(PayrollBatchService.changeStatus).not.toHaveBeenCalled();
    });

    test('calls changeStatus with approved for each id and returns 200 with results', async () => {
      PayrollBatchService.changeStatus.mockResolvedValue({ _id: 'b1', status: 'approved' });
      const req = { body: { batchIds: ['id1', 'id2'], reason: 'monthly' }, user };
      const res = mockRes();
      await payrollBatchController.bulkApproveBatches(req, res);
      expect(PayrollBatchService.changeStatus).toHaveBeenCalledTimes(2);
      expect(PayrollBatchService.changeStatus).toHaveBeenCalledWith('id1', 'approved', 'user-id-1', 'monthly');
      expect(PayrollBatchService.changeStatus).toHaveBeenCalledWith('id2', 'approved', 'user-id-1', 'monthly');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
          errors: expect.any(Array),
        }),
      );
      const body = res.json.mock.calls[0][0];
      expect(body.data).toHaveLength(2);
      expect(body.errors).toHaveLength(0);
    });

    test('collects per-batch errors without failing whole request', async () => {
      PayrollBatchService.changeStatus
        .mockResolvedValueOnce({ _id: 'ok' })
        .mockRejectedValueOnce(new Error('not pending'));
      const req = { body: { batchIds: ['good', 'bad'] }, user };
      const res = mockRes();
      await payrollBatchController.bulkApproveBatches(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.data).toHaveLength(1);
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0]).toEqual({ batchId: 'bad', error: 'not pending' });
    });
  });

  describe('bulkFreezeBatches', () => {
    test('uses changeStatus freeze', async () => {
      PayrollBatchService.changeStatus.mockResolvedValue({ status: 'freeze' });
      const req = { body: { batchIds: ['x1'], reason: 'lock' }, user };
      const res = mockRes();
      await payrollBatchController.bulkFreezeBatches(req, res);
      expect(PayrollBatchService.changeStatus).toHaveBeenCalledWith('x1', 'freeze', 'user-id-1', 'lock');
      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.message).toMatch(/Frozen 1 of 1/);
    });
  });

  describe('bulkCompleteBatches', () => {
    test('uses changeStatus complete', async () => {
      PayrollBatchService.changeStatus.mockResolvedValue({ status: 'complete' });
      const req = { body: { batchIds: ['y1'] }, user };
      const res = mockRes();
      await payrollBatchController.bulkCompleteBatches(req, res);
      expect(PayrollBatchService.changeStatus).toHaveBeenCalledWith('y1', 'complete', 'user-id-1', undefined);
      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.message).toMatch(/Completed 1 of 1/);
    });
  });
});
