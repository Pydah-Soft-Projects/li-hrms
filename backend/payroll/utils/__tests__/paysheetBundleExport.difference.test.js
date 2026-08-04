const {
  netDiffFromRowsDefault,
  netSalaryFromRow,
  resolveNetSalaryDeltasByEmployee,
} = require('../paysheetBundleExport');

describe('paysheet bundle net difference', () => {
  test('reads net salary from non-exact header names and computes the correct delta', () => {
    const regular = {
      'Employee Code': 'E-01',
      'Name': 'John',
      'Net Salary': 1200,
    };
    const second = {
      'Employee Code': 'E-01',
      'Name': 'John',
      'Net Salary': 1500,
    };

    expect(netSalaryFromRow(regular)).toBe(1200);
    expect(netSalaryFromRow(second)).toBe(1500);
    expect(netDiffFromRowsDefault(regular, second)).toBe(300);
  });

  test('handles custom header casing without assuming uppercase exact names', () => {
    const regular = {
      'Net salary': 1400,
    };
    const second = {
      'net salary': 1700,
    };

    expect(netDiffFromRowsDefault(regular, second)).toBe(300);
  });

  test('matches regular and second salaries by employee even when row order differs', () => {
    const regularRows = [
      { 'Employee Code': 'E-02', 'Net Salary': 1000 },
      { 'Employee Code': 'E-01', 'Net Salary': 1200 },
    ];
    const secondRows = [
      { 'Employee Code': 'E-01', 'Net Salary': 1500 },
      { 'Employee Code': 'E-02', 'Net Salary': 1500 },
    ];

    expect(resolveNetSalaryDeltasByEmployee(regularRows, secondRows)).toEqual({
      'E-01': 300,
      'E-02': 500,
    });
  });
});
