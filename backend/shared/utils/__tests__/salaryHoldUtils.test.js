const { findSalaryHeldInEmployeeQuery } = require('../salaryHoldUtils');

describe('salaryHoldUtils', () => {
  test('exposes the employee-level hold lookup helper expected by payroll exports', () => {
    expect(typeof findSalaryHeldInEmployeeQuery).toBe('function');
  });
});
