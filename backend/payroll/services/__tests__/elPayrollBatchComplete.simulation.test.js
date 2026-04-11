/**
 * Simulation-style tests: documents the EL-as-paid settlement flow when payroll batches complete,
 * and guards ordering (regular EL debit before second-salary batch mirror).
 */

const mongoose = require('mongoose');

jest.mock('../../model/PayrollBatch');
jest.mock('../../model/PayrollRecord');
jest.mock('../../model/SecondSalaryBatch');
jest.mock('../../model/SecondSalaryRecord');
jest.mock('../../../employees/model/Employee', () => ({}));
jest.mock('../../../leaves/services/leaveRegisterService', () => ({
  addELUsedInPayroll: jest.fn().mockResolvedValue({ ledger: true }),
}));
jest.mock('../arrearsIntegrationService', () => ({
  processArrearsSettlements: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../deductionIntegrationService', () => ({
  processDeductionSettlements: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../arrears/model/ArrearsRequest', () => ({
  findById: jest.fn(),
}));
jest.mock('../../../manual-deductions/model/DeductionRequest', () => ({
  findById: jest.fn(),
}));

const PayrollBatchService = require('../payrollBatchService');
const PayrollBatch = require('../../model/PayrollBatch');
const PayrollRecord = require('../../model/PayrollRecord');
const SecondSalaryService = require('../secondSalaryService');
const SecondSalaryBatch = require('../../model/SecondSalaryBatch');
const SecondSalaryRecord = require('../../model/SecondSalaryRecord');
const leaveRegisterService = require('../../../leaves/services/leaveRegisterService');
const ArrearsRequest = require('../../../arrears/model/ArrearsRequest');
const DeductionRequest = require('../../../manual-deductions/model/DeductionRequest');

describe('EL used in payroll — regular batch complete simulation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ArrearsRequest.findById.mockResolvedValue({ settlementHistory: [] });
    DeductionRequest.findById.mockResolvedValue({ settlementHistory: [] });
  });

  test('completing a regular payroll batch calls addELUsedInPayroll for each record with elUsedInPayroll, then syncs second salary', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const empId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const batchDoc = {
      _id: batchId,
      status: 'freeze',
      statusHistory: { push: jest.fn() },
      department: new mongoose.Types.ObjectId(),
      division: new mongoose.Types.ObjectId(),
      month: '2026-04',
      save: jest.fn().mockResolvedValue(true),
    };
    PayrollBatch.findById = jest.fn().mockResolvedValue(batchDoc);

    const elRows = [
      { employeeId: empId, month: '2026-04', elUsedInPayroll: 3 },
      { employeeId: new mongoose.Types.ObjectId(), month: '2026-04', elUsedInPayroll: 0.5 },
    ];
    const prRows = [
      {
        _id: new mongoose.Types.ObjectId(),
        employeeId: empId,
        month: '2026-04',
        arrearsSettlements: [],
        deductionSettlements: [],
      },
    ];

    PayrollRecord.find = jest.fn().mockImplementation((query) => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn(),
      };
      if (query.elUsedInPayroll) {
        chain.lean.mockResolvedValue(elRows);
      } else {
        chain.lean.mockResolvedValue(prRows);
      }
      return chain;
    });

    const syncSpy = jest.spyOn(PayrollBatchService, 'syncSecondSalaryBatchStatusForRegularBatch').mockResolvedValue(undefined);

    await PayrollBatchService.changeStatus(batchId.toString(), 'complete', userId, 'month-end pay');

    expect(batchDoc.status).toBe('complete');
    expect(leaveRegisterService.addELUsedInPayroll).toHaveBeenCalledTimes(2);
    expect(leaveRegisterService.addELUsedInPayroll).toHaveBeenNthCalledWith(1, empId, 3, '2026-04', batchId);
    expect(leaveRegisterService.addELUsedInPayroll).toHaveBeenNthCalledWith(
      2,
      elRows[1].employeeId,
      0.5,
      '2026-04',
      batchId
    );

    expect(syncSpy).toHaveBeenCalledWith(batchDoc, 'complete', userId, 'month-end pay');

    const elOrder = leaveRegisterService.addELUsedInPayroll.mock.invocationCallOrder[0];
    const syncOrder = syncSpy.mock.invocationCallOrder[0];
    expect(elOrder).toBeLessThan(syncOrder);

    syncSpy.mockRestore();
  });

  test('completing without elUsedInPayroll records still runs sync and does not call addELUsedInPayroll', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const batchDoc = {
      _id: batchId,
      status: 'freeze',
      statusHistory: { push: jest.fn() },
      department: new mongoose.Types.ObjectId(),
      division: new mongoose.Types.ObjectId(),
      month: '2026-05',
      save: jest.fn().mockResolvedValue(true),
    };
    PayrollBatch.findById = jest.fn().mockResolvedValue(batchDoc);

    PayrollRecord.find = jest.fn().mockImplementation((query) => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn(),
      };
      if (query.elUsedInPayroll) {
        chain.lean.mockResolvedValue([]);
      } else {
        chain.lean.mockResolvedValue([]);
      }
      return chain;
    });

    const syncSpy = jest.spyOn(PayrollBatchService, 'syncSecondSalaryBatchStatusForRegularBatch').mockResolvedValue(undefined);

    await PayrollBatchService.changeStatus(batchId.toString(), 'complete', userId, '');

    expect(leaveRegisterService.addELUsedInPayroll).not.toHaveBeenCalled();
    expect(syncSpy).toHaveBeenCalled();
    syncSpy.mockRestore();
  });
});

describe('EL used in payroll — second salary batch complete simulation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('completing a second salary batch calls addELUsedInPayroll for each record with attendance.elUsedInPayroll > 0', async () => {
    const batchId = new mongoose.Types.ObjectId();
    const recordId = new mongoose.Types.ObjectId();
    const empA = new mongoose.Types.ObjectId();
    const empB = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const batchDoc = {
      _id: batchId,
      status: 'freeze',
      statusHistory: { push: jest.fn() },
      employeePayrolls: [recordId],
      save: jest.fn().mockResolvedValue(true),
    };
    SecondSalaryBatch.findById = jest.fn().mockResolvedValue(batchDoc);

    SecondSalaryRecord.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { employeeId: empA, month: '2026-04', attendance: { elUsedInPayroll: 2 } },
          { employeeId: empB, month: '2026-04', attendance: { elUsedInPayroll: 0 } },
        ]),
      }),
    });

    await SecondSalaryService.updateBatchStatus(batchId.toString(), 'complete', userId, '2nd pay');

    expect(leaveRegisterService.addELUsedInPayroll).toHaveBeenCalledTimes(1);
    expect(leaveRegisterService.addELUsedInPayroll).toHaveBeenCalledWith(empA, 2, '2026-04', batchId);
  });
});
