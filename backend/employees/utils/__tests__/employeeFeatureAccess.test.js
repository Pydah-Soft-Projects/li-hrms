const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canCreateApplication,
  canEditSecondSalary,
  payloadHasSecondSalary,
  stripSecondSalaryFromPayload,
} = require('../employeeFeatureAccess');

test('canCreateApplication allows write or verify', () => {
  const hrWrite = { role: 'hr', featureControl: ['EMPLOYEES:write'] };
  const hrVerify = { role: 'hr', featureControl: ['EMPLOYEES:verify'] };
  const hrReadOnly = { role: 'hr', featureControl: ['EMPLOYEES:read'] };
  assert.equal(canCreateApplication(hrWrite), true);
  assert.equal(canCreateApplication(hrVerify), true);
  assert.equal(canCreateApplication(hrReadOnly), false);
});

test('canEditSecondSalary is superadmin-only unless explicit permission', () => {
  assert.equal(canEditSecondSalary({ role: 'super_admin', featureControl: [] }), true);
  assert.equal(canEditSecondSalary({ role: 'hr', featureControl: ['EMPLOYEES:write'] }), false);
  assert.equal(canEditSecondSalary({ role: 'hr', featureControl: ['EMPLOYEES:second_salary'] }), true);
});

test('stripSecondSalaryFromPayload removes nested values', () => {
  const data = { second_salary: 100, dynamicFields: { second_salary: 200, name: 'x' } };
  assert.equal(payloadHasSecondSalary(data), true);
  stripSecondSalaryFromPayload(data);
  assert.equal(data.second_salary, undefined);
  assert.equal(data.dynamicFields.second_salary, undefined);
  assert.equal(data.dynamicFields.name, 'x');
});
