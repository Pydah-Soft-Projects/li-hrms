jest.mock('../../../employees/model/Employee', () => ({
  find: jest.fn(),
}));

jest.mock('../../../payroll/model/PayrollRecord', () => ({
  find: jest.fn(),
}));

jest.mock('../../../payroll/model/PayrollSalaryHoldHistory', () => ({
  create: jest.fn(),
}));

const Employee = require('../../../employees/model/Employee');
const PayrollRecord = require('../../../payroll/model/PayrollRecord');
const PayrollSalaryHoldHistory = require('../../../payroll/model/PayrollSalaryHoldHistory');
const { findSalaryHeldPayrollRecordsInEmployeeScope, setPayrollRecordsSalaryHold } = require('../salaryHoldUtils');

function makeQueryBuilder(result) {
  return {
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe('salaryHoldUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('finds held payroll records for the selected employee scope', async () => {
    Employee.find.mockReturnValue(makeQueryBuilder([{ _id: 'emp-1', emp_no: '1001' }]));
    PayrollRecord.find.mockReturnValue(
      makeQueryBuilder([
        {
          _id: 'pr-1',
          emp_no: '1001',
          employeeId: 'emp-1',
          salaryOnHold: true,
          salaryHoldReason: 'Pending verification',
          month: '2026-07',
        },
      ])
    );

    const result = await findSalaryHeldPayrollRecordsInEmployeeScope({ department_id: 'dept-1' }, { month: '2026-07' });

    expect(Employee.find).toHaveBeenCalledWith({ department_id: 'dept-1' });
    expect(PayrollRecord.find).toHaveBeenCalledWith({
      salaryOnHold: true,
      employeeId: { $in: ['emp-1'] },
      month: '2026-07',
    });
    expect(result[0].salaryHoldReason).toBe('Pending verification');
  });

  test('records salary hold history when applying a hold to payroll records', async () => {
    const record = {
      _id: 'pr-2',
      emp_no: '1002',
      employeeId: 'emp-2',
      month: '2026-07',
      salaryOnHold: false,
      salaryHoldReason: null,
      salaryHeldAt: null,
      salaryHeldBy: null,
      salaryHoldReleasedAt: null,
      salaryHoldReleasedBy: null,
      save: jest.fn().mockResolvedValue(true),
    };
    PayrollRecord.find.mockResolvedValue([record]);
    PayrollSalaryHoldHistory.create.mockResolvedValue({});

    await setPayrollRecordsSalaryHold({
      payrollRecordIds: ['pr-2'],
      hold: true,
      reason: 'Verification pending',
      userId: 'user-1',
      batchId: 'batch-1',
    });

    expect(PayrollSalaryHoldHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'hold',
      payrollRecordId: 'pr-2',
      employeeId: 'emp-2',
      month: '2026-07',
      reason: 'Verification pending',
      performedBy: 'user-1',
    }));
  });
});
