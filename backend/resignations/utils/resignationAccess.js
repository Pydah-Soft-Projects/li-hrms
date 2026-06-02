const User = require('../../users/model/User');
const { getEmployeeIdsInScope } = require('../../shared/middleware/dataScopeMiddleware');

function resolveFeatureControl(user) {
  if (!user) return [];
  let effectivePermissions = [...(user.featureControl || [])];

  if (user.customRoles && Array.isArray(user.customRoles)) {
    user.customRoles.forEach((role) => {
      if (role.isActive && Array.isArray(role.activeModules)) {
        effectivePermissions = [...new Set([...effectivePermissions, ...role.activeModules])];
      }
    });
  }

  return effectivePermissions;
}

function hasModuleRead(user, code) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const fc = resolveFeatureControl(user);
  if (!fc.length) return true;
  return (
    fc.includes(code) ||
    fc.includes(`${code}:read`) ||
    fc.includes(`${code}:write`)
  );
}

function hasModuleWrite(user, code) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const fc = resolveFeatureControl(user);
  if (!fc.length) return false;
  return fc.includes(code) || fc.includes(`${code}:write`);
}

function hasModuleTerminate(user, code) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const fc = resolveFeatureControl(user);
  if (!fc.length) return false;
  return fc.includes(`${code}:terminate`);
}

function canInitiateTerminationLegacy(user, settings) {
  const role = (user?.role || '').toLowerCase();
  const allowedRoles = settings?.workflow?.terminationAllowedRoles || ['super_admin', 'hr'];
  return role === 'super_admin' || allowedRoles.includes(role);
}

function assertCanCreateRequest(user, requestType, settings) {
  const type = requestType || 'resignation';
  const role = (user?.role || '').toLowerCase();
  if (role === 'super_admin') return;

  const fc = resolveFeatureControl(user);

  if (type === 'termination') {
    if (role === 'employee') {
      const err = new Error('Employees cannot initiate terminations.');
      err.statusCode = 403;
      throw err;
    }
    if (fc.length === 0) {
      if (!canInitiateTerminationLegacy(user, settings)) {
        const err = new Error(`Your role (${role}) is not authorized to initiate terminations based on current policy.`);
        err.statusCode = 403;
        throw err;
      }
      return;
    }
    if (!hasModuleTerminate(user, 'RESIGNATION')) {
      const err = new Error('You do not have terminate permission for resignations.');
      err.statusCode = 403;
      throw err;
    }
    return;
  }

  if (fc.length > 0 && !hasModuleWrite(user, 'RESIGNATION')) {
    const err = new Error('You do not have write access to Resignations.');
    err.statusCode = 403;
    throw err;
  }
}

function assertCanViewRequests(user) {
  const role = (user?.role || '').toLowerCase();
  if (role === 'super_admin') return;

  const fc = resolveFeatureControl(user);
  if (!fc.length) return;

  const canRes = hasModuleRead(user, 'RESIGNATION');
  const canTerm = hasModuleTerminate(user, 'RESIGNATION');

  if (!canRes && !canTerm) {
    const err = new Error('You do not have permission to view resignation or termination requests.');
    err.statusCode = 403;
    throw err;
  }
}

function assertCanManageRequest(user, requestType, settings) {
  const type = requestType || 'resignation';
  const role = (user?.role || '').toLowerCase();
  if (role === 'super_admin') return;

  const fc = resolveFeatureControl(user);

  if (type === 'termination') {
    if (fc.length === 0) {
      if (!canInitiateTerminationLegacy(user, settings)) {
        const err = new Error('You are not authorized to manage termination requests.');
        err.statusCode = 403;
        throw err;
      }
      return;
    }
    if (!hasModuleTerminate(user, 'RESIGNATION')) {
      const err = new Error('You do not have terminate permission for resignations.');
      err.statusCode = 403;
      throw err;
    }
    return;
  }

  if (fc.length === 0) {
    if (!['sub_admin', 'hr', 'hod', 'manager'].includes(role)) {
      const err = new Error('You are not authorized to manage resignation requests.');
      err.statusCode = 403;
      throw err;
    }
    return;
  }

  if (!hasModuleWrite(user, 'RESIGNATION')) {
    const err = new Error('You do not have write access to Resignations.');
    err.statusCode = 403;
    throw err;
  }
}

function buildRequestTypeFilter(user) {
  const role = (user?.role || '').toLowerCase();
  if (role === 'super_admin') return null;

  const fc = resolveFeatureControl(user);
  if (!fc.length) return null;

  const canRes = hasModuleRead(user, 'RESIGNATION');
  const canTerm = hasModuleTerminate(user, 'RESIGNATION');

  if (canRes && canTerm) return null;
  if (canTerm && !canRes) return { requestType: 'termination' };
  if (canRes && !canTerm) {
    return {
      $or: [
        { requestType: { $ne: 'termination' } },
        { requestType: { $exists: false } },
        { requestType: null },
      ],
    };
  }

  return { _id: null };
}

async function assertEmployeeInScope(user, employeeDoc, isSelfRequest) {
  const role = (user?.role || '').toLowerCase();
  if (role === 'super_admin' || isSelfRequest) return;

  const scopedEmployeeIds = await getEmployeeIdsInScope(user);
  const employeeId = employeeDoc?._id?.toString?.();
  if (!employeeId) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  const inScope = scopedEmployeeIds.some((id) => id.toString() === employeeId);
  if (!inScope) {
    const err = new Error('This employee is outside your assigned scope.');
    err.statusCode = 403;
    throw err;
  }
}

async function loadResignationActor(req) {
  if (req.resignationActor) return req.resignationActor;
  const userId = req.user?.userId || req.user?._id;
  if (!userId) return null;
  const user = await User.findById(userId)
    .select('name email role featureControl dataScope divisionMapping customRoles employeeId')
    .populate('customRoles');
  req.resignationActor = user;
  return user;
}

module.exports = {
  resolveFeatureControl,
  hasModuleRead,
  hasModuleWrite,
  hasModuleTerminate,
  assertCanCreateRequest,
  assertCanViewRequests,
  assertCanManageRequest,
  buildRequestTypeFilter,
  assertEmployeeInScope,
  loadResignationActor,
};
