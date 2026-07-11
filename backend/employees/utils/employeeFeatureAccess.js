const { isSecondSalaryGloballyEnabled } = require('../../settings/secondSalaryFeatureGate');

const SECOND_SALARY_PERM = 'EMPLOYEES:second_salary';
const CREATE_ROLES = ['super_admin', 'sub_admin', 'hr', 'hod', 'manager'];

function isSuperAdmin(user) {
  if (!user) return false;
  return user.role === 'super_admin' || (Array.isArray(user.roles) && user.roles.includes('super_admin'));
}

function hasFeature(user, perm) {
  const fc = Array.isArray(user?.featureControl) ? user.featureControl : [];
  return fc.includes(perm);
}

function canManageEmployeesFeature(user) {
  if (!user) return false;
  const fc = user.featureControl;
  if (!fc || fc.length === 0) return false;
  return fc.includes('EMPLOYEES') || fc.includes('EMPLOYEES:write');
}

function canVerifyEmployeesFeature(user) {
  if (!user) return false;
  if (isSuperAdmin(user) || user.role === 'sub_admin') {
    if (!user.featureControl || user.featureControl.length === 0) return true;
  }
  const fc = user.featureControl;
  if (!fc || fc.length === 0) return true;
  return fc.includes('EMPLOYEES') || fc.includes('EMPLOYEES:verify');
}

function hasCreateApplicationRole(user) {
  if (!user) return false;
  const role = user.role;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return CREATE_ROLES.includes(role) || roles.some((r) => CREATE_ROLES.includes(r));
}

/** EMPLOYEES:write OR EMPLOYEES:verify (independent of each other). */
function canCreateApplication(user) {
  if (!user || !hasCreateApplicationRole(user)) return false;
  if (isSuperAdmin(user)) return true;
  return canManageEmployeesFeature(user) || canVerifyEmployeesFeature(user);
}

/** Only SuperAdmin or explicit EMPLOYEES:second_salary when org feature is on. */
function canEditSecondSalary(user) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return hasFeature(user, SECOND_SALARY_PERM);
}

function payloadHasSecondSalary(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.second_salary !== undefined && data.second_salary !== null && data.second_salary !== '') return true;
  if (data.secondSalary !== undefined && data.secondSalary !== null && data.secondSalary !== '') return true;
  const df = data.dynamicFields;
  if (df && typeof df === 'object') {
    if (df.second_salary !== undefined && df.second_salary !== null && df.second_salary !== '') return true;
    if (df.secondSalary !== undefined && df.secondSalary !== null && df.secondSalary !== '') return true;
  }
  return false;
}

function stripSecondSalaryFromPayload(data) {
  if (!data || typeof data !== 'object') return;
  delete data.second_salary;
  delete data.secondSalary;
  if (data.dynamicFields && typeof data.dynamicFields === 'object') {
    delete data.dynamicFields.second_salary;
    delete data.dynamicFields.secondSalary;
  }
}

/**
 * Enforce second salary rules on application/employee payloads.
 * Strips field when user lacks permission; throws when org feature is disabled but value sent.
 */
async function enforceSecondSalaryOnPayload(user, data, { allowSuperAdminFinalize = false } = {}) {
  if (!payloadHasSecondSalary(data)) return;

  const globallyOn = await isSecondSalaryGloballyEnabled();
  if (!globallyOn) {
    stripSecondSalaryFromPayload(data);
    return;
  }

  const mayEdit = allowSuperAdminFinalize && isSuperAdmin(user) ? true : canEditSecondSalary(user);
  if (!mayEdit) {
    stripSecondSalaryFromPayload(data);
  }
}

function assertCanCreateApplication(user) {
  if (!canCreateApplication(user)) {
    const err = new Error('Not authorized to create or update employee applications');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = {
  SECOND_SALARY_PERM,
  isSuperAdmin,
  canCreateApplication,
  canEditSecondSalary,
  payloadHasSecondSalary,
  stripSecondSalaryFromPayload,
  enforceSecondSalaryOnPayload,
  assertCanCreateApplication,
};
