const otPayService = require('./otPayService');

/**
 * Second salary cycle: same OT rules as primary payroll, but z = employee.second_salary when useSecondSalary is set.
 */
async function getResolvedOTSettings(departmentId, divisionId = null, employee = null) {
  return otPayService.getResolvedOTSettings(departmentId, divisionId, employee);
}

async function calculateOTPay(otHours, departmentId, divisionId = null, options = {}) {
  return otPayService.calculateOTPay(otHours, departmentId, divisionId, {
    ...options,
    useSecondSalary: true,
  });
}

module.exports = {
  getResolvedOTSettings,
  calculateOTPay,
};
