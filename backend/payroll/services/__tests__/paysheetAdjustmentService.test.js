const {
  getEditableColumnDefs,
  getValueByPath,
  isBlockedPaysheetAdjustmentPath,
  computeNetSalaryDelta,
} = require('../paysheetAdjustmentService');

describe('paysheetAdjustmentService', () => {
  test('getEditableColumnDefs includes all configured editable numeric columns', () => {
    const config = {
      allowPaysheetModification: true,
      outputColumns: [
        { header: 'Loan EMI', source: 'field', field: 'loanAdvance.totalEMI', paysheetEditable: true },
        { header: 'Basic', source: 'field', field: 'earnings.basicPay', paysheetEditable: true },
        { header: 'Name', source: 'field', field: 'employee.name', paysheetEditable: true },
        { header: 'OT', source: 'field', field: 'earnings.otPay', paysheetEditable: true, paysheetEditableFieldPath: 'earnings.otPay' },
      ],
    };
    const defs = getEditableColumnDefs(config);
    const paths = defs.map((d) => d.fieldPath).sort();
    expect(paths).toEqual(['earnings.basicPay', 'earnings.otPay', 'loanAdvance.totalEMI']);
    expect(defs).toHaveLength(3);
  });

  test('getValueByPath reads nested fields', () => {
    const obj = { loanAdvance: { totalEMI: 1500.5 }, earnings: { basicPay: 20000 } };
    expect(getValueByPath(obj, 'loanAdvance.totalEMI')).toBe(1500.5);
    expect(getValueByPath(obj, 'earnings.basicPay')).toBe(20000);
  });

  test('getEditableColumnDefs empty when modification disabled', () => {
    const config = {
      allowPaysheetModification: false,
      outputColumns: [
        { header: 'Loan EMI', source: 'field', field: 'loanAdvance.totalEMI', paysheetEditable: true },
      ],
    };
    expect(getEditableColumnDefs(config)).toHaveLength(0);
  });

  test('isBlockedPaysheetAdjustmentPath blocks employee and net salary', () => {
    expect(isBlockedPaysheetAdjustmentPath('employee.name')).toBe(true);
    expect(isBlockedPaysheetAdjustmentPath('netSalary')).toBe(true);
    expect(isBlockedPaysheetAdjustmentPath('deductions.attendanceDeduction')).toBe(false);
  });

  test('computeNetSalaryDelta increases net when deduction is reduced', () => {
    expect(computeNetSalaryDelta('loanAdvance.totalEMI', 1000, 800)).toBe(200);
  });

  test('computeNetSalaryDelta decreases net when earning is reduced', () => {
    expect(computeNetSalaryDelta('earnings.basicPay', 20000, 18000)).toBe(-2000);
  });
});
