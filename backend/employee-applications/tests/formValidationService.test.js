const test = require('node:test');
const assert = require('node:assert/strict');

const { transformFormData } = require('../services/formValidationService');

test('transformFormData keeps second_salary as a permanent field', () => {
  const result = transformFormData({
    emp_no: 'EMP100',
    employee_name: 'Test Employee',
    second_salary: 2500,
  }, null);

  assert.equal(result.permanentFields.second_salary, 2500);
  assert.equal(result.dynamicFields.second_salary, undefined);
});
