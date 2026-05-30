const { getEditableColumnDefs, getValueByPath } = require('../paysheetAdjustmentService');

describe('paysheetAdjustmentService', () => {
  test('getEditableColumnDefs returns only configured editable loan/advance columns', () => {
    const config = {
      allowPaysheetModification: true,
      outputColumns: [
        { header: 'Loan EMI', source: 'field', field: 'loanAdvance.totalEMI', paysheetEditable: true },
        { header: 'Name', source: 'field', field: 'employee.name', paysheetEditable: true },
      ],
    };
    const defs = getEditableColumnDefs(config);
    expect(defs).toHaveLength(1);
    expect(defs[0].fieldPath).toBe('loanAdvance.totalEMI');
  });

  test('getValueByPath reads nested loanAdvance fields', () => {
    const obj = { loanAdvance: { totalEMI: 1500.5 } };
    expect(getValueByPath(obj, 'loanAdvance.totalEMI')).toBe(1500.5);
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
});
