const mongoose = require('mongoose');
const ResignationRequest = require('../../model/ResignationRequest');
const EmployeeHistory = require('../../../employees/model/EmployeeHistory');
const { cancelResignationsOnRejoin } = require('../resignationRejoinService');

describe('cancelResignationsOnRejoin', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('cancels approved resignation requests for the employee', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const resignation = {
      _id: new mongoose.Types.ObjectId(),
      status: 'approved',
      leftDate: new Date('2026-05-25'),
      workflow: { history: [] },
      save,
    };
    jest.spyOn(ResignationRequest, 'find').mockResolvedValue([resignation]);
    jest.spyOn(EmployeeHistory, 'create').mockResolvedValue({});

    const employeeId = new mongoose.Types.ObjectId();
    const rejoinApplicationId = new mongoose.Types.ObjectId();

    const result = await cancelResignationsOnRejoin({
      empNo: '2208',
      employeeId,
      rejoinApplicationId,
      approver: { _id: new mongoose.Types.ObjectId(), name: 'HR User', role: 'hr' },
    });

    expect(result.cancelledCount).toBe(1);
    expect(resignation.status).toBe('cancelled');
    expect(resignation.workflow.isCompleted).toBe(true);
    expect(resignation.workflow.history).toHaveLength(1);
    expect(resignation.workflow.history[0].action).toBe('cancelled');
    expect(save).toHaveBeenCalled();
    expect(EmployeeHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        emp_no: '2208',
        event: 'resignation_cancelled',
        details: expect.objectContaining({
          previousStatus: 'approved',
          rejoinApplicationId,
        }),
      })
    );
  });

  it('returns zero when no resignation requests exist', async () => {
    jest.spyOn(ResignationRequest, 'find').mockResolvedValue([]);
    jest.spyOn(EmployeeHistory, 'create').mockResolvedValue({});

    const result = await cancelResignationsOnRejoin({
      empNo: '2208',
      employeeId: new mongoose.Types.ObjectId(),
      rejoinApplicationId: new mongoose.Types.ObjectId(),
      approver: { _id: new mongoose.Types.ObjectId(), name: 'HR User', role: 'hr' },
    });

    expect(result).toEqual({ cancelledCount: 0, cancelledIds: [] });
    expect(EmployeeHistory.create).not.toHaveBeenCalled();
  });
});
