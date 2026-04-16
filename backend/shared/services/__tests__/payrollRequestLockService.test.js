jest.mock('../../../settings/model/Settings');
jest.mock('../../../employees/model/Employee');
jest.mock('../../../payroll/model/PayrollRecord');
jest.mock('../../../payroll/model/PayrollBatch');

const Settings = require('../../../settings/model/Settings');
const Employee = require('../../../employees/model/Employee');
const PayrollRecord = require('../../../payroll/model/PayrollRecord');
const PayrollBatch = require('../../../payroll/model/PayrollBatch');
const {
  assertEmployeeDateRequestsEditable,
  assertEmployeeNumberDateRequestsEditable,
  isAutoRejectPendingRequestsEnabled,
  AUTO_REJECT_SETTING_KEY,
} = require('../payrollRequestLockService');

function mockLean(value) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('payrollRequestLockService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('throws PAYROLL_BATCH_COMPLETED when employee date belongs to completed payroll batch', async () => {
    PayrollRecord.findOne.mockReturnValue(
      mockLean({
        payrollBatchId: 'batch-1',
        month: '2026-04',
        startDate: '2026-03-26',
        endDate: '2026-04-25',
      })
    );
    PayrollBatch.findById.mockReturnValue(mockLean({ status: 'complete' }));

    await expect(
      assertEmployeeDateRequestsEditable('emp-1', '2026-04-10', 'E1001')
    ).rejects.toMatchObject({
      code: 'PAYROLL_BATCH_COMPLETED',
      reason: 'payroll_batch_completed',
      statusCode: 409,
      employeeLabel: 'E1001',
      period: '2026-04-10',
    });
  });

  test('does not throw when payroll batch is not completed', async () => {
    PayrollRecord.findOne.mockReturnValue(
      mockLean({
        payrollBatchId: 'batch-2',
        month: '2026-04',
        startDate: '2026-03-26',
        endDate: '2026-04-25',
      })
    );
    PayrollBatch.findById.mockReturnValue(mockLean({ status: 'freeze' }));

    await expect(
      assertEmployeeDateRequestsEditable('emp-1', '2026-04-10', 'E1001')
    ).resolves.toBeUndefined();
  });

  test('resolves employee number before checking lock', async () => {
    Employee.findOne.mockReturnValue(mockLean({ _id: 'emp-42', emp_no: '2144' }));
    PayrollRecord.findOne.mockReturnValue(
      mockLean({
        payrollBatchId: 'batch-3',
        month: '2026-04',
        startDate: '2026-03-26',
        endDate: '2026-04-25',
      })
    );
    PayrollBatch.findById.mockReturnValue(mockLean({ status: 'complete' }));

    await expect(
      assertEmployeeNumberDateRequestsEditable('2144', '2026-04-04')
    ).rejects.toMatchObject({
      code: 'PAYROLL_BATCH_COMPLETED',
      employeeLabel: '2144',
      period: '2026-04-04',
    });
  });

  test('reads auto reject toggle from settings', async () => {
    Settings.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ key: AUTO_REJECT_SETTING_KEY, value: true }),
    });

    await expect(isAutoRejectPendingRequestsEnabled()).resolves.toBe(true);
  });
});
