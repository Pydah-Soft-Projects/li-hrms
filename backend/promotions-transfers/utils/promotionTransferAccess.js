/**
 * Feature-control access for promotions vs transfers.
 * Supports split modules (PROMOTIONS / TRANSFERS) and legacy PROMOTIONS_TRANSFERS.
 */

const User = require('../../users/model/User');

const PROMOTION_TYPES = new Set(['promotion', 'demotion', 'increment']);
const TRANSFER_TYPES = new Set(['transfer']);
const LEGACY = 'PROMOTIONS_TRANSFERS';

function resolveFeatureControl(user) {
  if (!user) return [];
  let effective = [...(user.featureControl || [])];

  if (Array.isArray(user.customRoles)) {
    user.customRoles.forEach((role) => {
      if (role?.isActive && Array.isArray(role.activeModules)) {
        effective = [...new Set([...effective, ...role.activeModules])];
      }
    });
  }

  return effective;
}

function hasModuleRead(fc, code) {
  return (
    fc.includes(code) ||
    fc.includes(`${code}:read`) ||
    fc.includes(`${code}:write`)
  );
}

function hasModuleWrite(fc, code) {
  return fc.includes(code) || fc.includes(`${code}:write`);
}

function isSuperAdmin(user) {
  if (!user) return false;
  return user.role === 'super_admin' || (Array.isArray(user.roles) && user.roles.includes('super_admin'));
}

function isPromotionType(requestType) {
  return PROMOTION_TYPES.has(String(requestType || '').toLowerCase());
}

function isTransferType(requestType) {
  return TRANSFER_TYPES.has(String(requestType || '').toLowerCase());
}

function moduleCodeForRequestType(requestType) {
  if (isTransferType(requestType)) return 'TRANSFERS';
  if (isPromotionType(requestType)) return 'PROMOTIONS';
  return null;
}

function canViewModule(user, code) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const fc = resolveFeatureControl(user);
  if (!fc.length) return true; // legacy empty = role-based allow
  return hasModuleRead(fc, code) || hasModuleRead(fc, LEGACY);
}

function canManageModule(user, code) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const fc = resolveFeatureControl(user);
  if (!fc.length) return false;
  return hasModuleWrite(fc, code) || hasModuleWrite(fc, LEGACY);
}

function canViewAny(user) {
  return canViewModule(user, 'PROMOTIONS') || canViewModule(user, 'TRANSFERS');
}

function canManageRequestType(user, requestType) {
  const code = moduleCodeForRequestType(requestType);
  if (!code) return false;
  return canManageModule(user, code);
}

function canViewRequestType(user, requestType) {
  const code = moduleCodeForRequestType(requestType);
  if (!code) return false;
  return canViewModule(user, code);
}

/** Mongo filter fragment for list endpoints based on which types the actor may view. */
function requestTypeVisibilityFilter(user) {
  if (!user || isSuperAdmin(user)) return null;

  const canPromo = canViewModule(user, 'PROMOTIONS');
  const canXfer = canViewModule(user, 'TRANSFERS');

  if (canPromo && canXfer) return null;
  if (canPromo) return { requestType: { $in: [...PROMOTION_TYPES] } };
  if (canXfer) return { requestType: 'transfer' };

  // No module access — block all rows (caller should 403 earlier for page access)
  return { requestType: { $in: [] } };
}

function assertCanManageRequestType(user, requestType) {
  if (canManageRequestType(user, requestType)) return;
  const label = isTransferType(requestType) ? 'transfers' : 'promotions';
  const err = new Error(`Not authorized to manage ${label} requests`);
  err.statusCode = 403;
  throw err;
}

function assertCanViewRequestType(user, requestType) {
  if (canViewRequestType(user, requestType)) return;
  const label = isTransferType(requestType) ? 'transfers' : 'promotions';
  const err = new Error(`Not authorized to view ${label} requests`);
  err.statusCode = 403;
  throw err;
}

async function loadPtActor(req) {
  if (req.ptActor) return req.ptActor;
  const userId = req.user?.userId || req.user?._id;
  if (!userId) return null;
  const user = await User.findById(userId)
    .select('name email role roles featureControl customRoles')
    .populate('customRoles');
  req.ptActor = user || req.user;
  return req.ptActor;
}

module.exports = {
  PROMOTION_TYPES,
  isPromotionType,
  isTransferType,
  moduleCodeForRequestType,
  canViewModule,
  canManageModule,
  canViewAny,
  canManageRequestType,
  canViewRequestType,
  requestTypeVisibilityFilter,
  assertCanManageRequestType,
  assertCanViewRequestType,
  loadPtActor,
  resolveFeatureControl,
};
