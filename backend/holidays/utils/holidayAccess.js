const User = require('../../users/model/User');
const {
    normalizeMappingList,
    isMappingListSubset,
    clampMappingToAllowed,
    mappingsOverlap,
} = require('./holidayScopeMapping');

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

function hasModuleWrite(user, code) {
    const fc = resolveFeatureControl(user);
    return fc.includes(code) || fc.includes(`${code}:write`);
}

async function loadHolidayActor(req) {
    if (req.holidayActor) return req.holidayActor;
    const userId = req.user?.userId || req.user?._id;
    if (!userId) return null;
    const user = await User.findById(userId)
        .select('name email role roles featureControl managedHolidayGroupIds holidayDivisionMapping customRoles')
        .populate('customRoles');
    req.holidayActor = user;
    return user;
}

function canManageGlobal(actor) {
    if (!actor) return false;
    if (actor.role === 'super_admin') return true;
    return hasModuleWrite(actor, 'HOLIDAY_CALENDAR_MANAGE_GLOBAL');
}

function canManageHoliday(actor) {
    if (!actor) return false;
    if (actor.role === 'super_admin') return true;
    return hasModuleWrite(actor, 'HOLIDAY_CALENDAR');
}

function getManagedGroupIdStrings(actor) {
    return (actor?.managedHolidayGroupIds || []).map((id) => id.toString());
}

function getHolidayDivisionMapping(actor) {
    return normalizeMappingList(actor?.holidayDivisionMapping || []);
}

function hasHolidayEmployeeScope(actor) {
    return getHolidayDivisionMapping(actor).length > 0;
}

function hasAnyHolidayManageScope(actor) {
    return canManageGlobal(actor)
        || getManagedGroupIdStrings(actor).length > 0
        || hasHolidayEmployeeScope(actor);
}

function assertGroupInScope(actor, groupId) {
    if (canManageGlobal(actor)) return;
    const gid = groupId?.toString?.() || String(groupId || '');
    const allowed = getManagedGroupIdStrings(actor);
    if (!gid || !allowed.includes(gid)) {
        const err = new Error('You are not authorized to manage holidays for this group');
        err.statusCode = 403;
        throw err;
    }
}

function assertMappingInScope(actor, divisionMapping) {
    if (canManageGlobal(actor)) return;
    const allowed = getHolidayDivisionMapping(actor);
    if (!isMappingListSubset(divisionMapping, allowed)) {
        const err = new Error('Selected employee scope is outside your holiday management scope');
        err.statusCode = 403;
        throw err;
    }
}

function assertCanManageHolidayRecord(actor, holiday) {
    if (!holiday) {
        const err = new Error('Holiday not found');
        err.statusCode = 404;
        throw err;
    }
    if (canManageGlobal(actor)) return;
    if (holiday.scope === 'GLOBAL' || holiday.isMaster) {
        const err = new Error('Only users with global holiday management can modify org-wide holidays');
        err.statusCode = 403;
        throw err;
    }
    if (holiday.scope === 'MAPPING') {
        assertMappingInScope(actor, holiday.divisionMapping);
        return;
    }
    const gid = holiday.groupId?._id?.toString?.() || holiday.groupId?.toString?.();
    assertGroupInScope(actor, gid);
}

function intersectGroupIds(actor, requestedIds) {
    const managed = getManagedGroupIdStrings(actor);
    if (!requestedIds || requestedIds.length === 0) return managed;
    return requestedIds.map(String).filter((id) => managed.includes(id));
}

/**
 * Scoped managers: group-based or mapping-based holiday writes.
 */
function normalizeHolidayWritePayload(actor, body) {
    const out = { ...body };

    if (!canManageHoliday(actor)) {
        const err = new Error('You do not have permission to manage the holiday calendar');
        err.statusCode = 403;
        throw err;
    }

    if (canManageGlobal(actor)) {
        if (out.scope === 'MAPPING') {
            out.divisionMapping = normalizeMappingList(out.divisionMapping);
            if (out.divisionMapping.length === 0) {
                const err = new Error('At least one division mapping row is required');
                err.statusCode = 400;
                throw err;
            }
            out.groupId = undefined;
            out.isMaster = false;
        }
        return out;
    }

    const managedGroups = getManagedGroupIdStrings(actor);
    const allowedMapping = getHolidayDivisionMapping(actor);
    const hasGroups = managedGroups.length > 0;
    const hasMapping = allowedMapping.length > 0;

    if (!hasGroups && !hasMapping) {
        const err = new Error('No holiday groups or employee scope assigned to your account');
        err.statusCode = 403;
        throw err;
    }

    const wantsMapping =
        out.scope === 'MAPPING'
        || (Array.isArray(out.divisionMapping) && out.divisionMapping.length > 0);

    if (wantsMapping) {
        if (!hasMapping) {
            const err = new Error('Your account is not configured for employee-scoped holidays');
            err.statusCode = 403;
            throw err;
        }
        const clamped = clampMappingToAllowed(allowedMapping, out.divisionMapping);
        if (clamped.length === 0) {
            const err = new Error('None of the selected scope rows are within your holiday employee scope');
            err.statusCode = 403;
            throw err;
        }
        out.scope = 'MAPPING';
        out.divisionMapping = clamped;
        out.isMaster = false;
        out.groupId = undefined;
        out.applicableTo = undefined;
        out.targetGroupIds = [];
        return out;
    }

    if (!hasGroups) {
        const clamped = clampMappingToAllowed(allowedMapping, []);
        out.scope = 'MAPPING';
        out.divisionMapping = clamped;
        out.isMaster = false;
        out.groupId = undefined;
        out.applicableTo = undefined;
        out.targetGroupIds = [];
        return out;
    }

    if (out.scope === 'GLOBAL' || out.isMaster) {
        let targetIds = managedGroups;
        if (out.applicableTo === 'SPECIFIC_GROUPS' && out.targetGroupIds?.length) {
            targetIds = intersectGroupIds(actor, out.targetGroupIds);
            if (targetIds.length === 0) {
                const err = new Error('None of the selected groups are in your scope');
                err.statusCode = 403;
                throw err;
            }
        }
        out.scope = 'GLOBAL';
        out.applicableTo = 'SPECIFIC_GROUPS';
        out.targetGroupIds = targetIds;
        out.isMaster = false;
        out.groupId = undefined;
    } else if (out.scope === 'GROUP' && out.groupId) {
        assertGroupInScope(actor, out.groupId);
        out.isMaster = false;
    }

    return out;
}

function canViewHolidayRecord(actor, holiday) {
    if (!holiday || canManageGlobal(actor)) return true;
    if (holiday.scope === 'GLOBAL') return true;
    if (holiday.scope === 'MAPPING') {
        return mappingsOverlap(holiday.divisionMapping, getHolidayDivisionMapping(actor));
    }
    const gid = holiday.groupId?._id?.toString?.() || holiday.groupId?.toString?.();
    return gid && getManagedGroupIdStrings(actor).includes(gid);
}

module.exports = {
    resolveFeatureControl,
    loadHolidayActor,
    canManageGlobal,
    canManageHoliday,
    getManagedGroupIdStrings,
    getHolidayDivisionMapping,
    hasHolidayEmployeeScope,
    hasAnyHolidayManageScope,
    assertGroupInScope,
    assertMappingInScope,
    assertCanManageHolidayRecord,
    normalizeHolidayWritePayload,
    canViewHolidayRecord,
};
