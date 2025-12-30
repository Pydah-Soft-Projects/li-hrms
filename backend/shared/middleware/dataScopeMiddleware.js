const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');

/**
 * Data Scope Middleware
 * Applies role-based data filtering to queries
 */

/**
 * Get default scope based on user role
 */
function getDefaultScope(role) {
    const scopeMap = {
        'employee': 'own',
        'hod': 'department',
        'hr': 'departments',
        'sub_admin': 'all',
        'super_admin': 'all'
    };
    return scopeMap[role] || 'own';
}

/**
 * Build scope filter for MongoDB queries
 * @param {Object} user - User object from req.user
 * @returns {Object} MongoDB filter object
 */
function buildScopeFilter(user) {
    if (!user) {
        return { _id: null }; // No access if no user
    }

    // Get scope from user settings or use default
    const scope = user.dataScope || getDefaultScope(user.role);

    if (scope === 'all' || user.role === 'super_admin') {
        return {};
    }

    switch (scope) {
        case 'own':
            // Employee sees only their own data
            if (user.employeeRef) {
                return { $or: [{ _id: user.employeeRef }, { employeeId: user.employeeRef }, { emp_no: user.employeeId }] };
            } else if (user.employeeId) {
                return { $or: [{ emp_no: user.employeeId }, { employeeId: user.employeeId }] };
            } else {
                return { _id: user._id };
            }

        case 'division':
        case 'divisions':
            // Division-level scoping with Department matrix support
            if (user.divisionMapping && Array.isArray(user.divisionMapping) && user.divisionMapping.length > 0) {
                const orConditions = [];
                user.divisionMapping.forEach(mapping => {
                    const condition = { division_id: mapping.division };
                    if (mapping.departments && Array.isArray(mapping.departments) && mapping.departments.length > 0) {
                        condition.department_id = { $in: mapping.departments };
                    }
                    orConditions.push(condition);
                });
                return orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
            } else if (user.allowedDivisions && user.allowedDivisions.length > 0) {
                return { division_id: { $in: user.allowedDivisions } };
            }
            // Fallback to departments if divisions not setup correctly
            if (user.departments && user.departments.length > 0) {
                return { department_id: { $in: user.departments } };
            }
            return { _id: null };

        case 'department':
            if (!user.department) return { _id: null };
            return { department_id: user.department };

        case 'departments':
            if (!user.departments || user.departments.length === 0) return { _id: null };
            return { department_id: { $in: user.departments } };

        default:
            return { _id: user._id };
    }
}

/**
 * Middleware to inject scope filter into request
 */
const applyScopeFilter = async (req, res, next) => {
    try {
        // req.user from protect middleware already has basic info
        // We might need to fetch full User record to get complex divisionMapping
        const user = await User.findById(req.user.userId || req.user._id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User record not found'
            });
        }

        // Build and attach scope filter
        req.scopeFilter = buildScopeFilter(user);
        req.scopedUser = user;

        next();
    } catch (error) {
        console.error('[DataScope] Error applying scope filter:', error);
        return res.status(500).json({
            success: false,
            message: 'Error applying data scope filter'
        });
    }
};

/**
 * Helper to check if user has access to specific resource
 */
function hasAccessToResource(user, resource) {
    const scope = user.dataScope || getDefaultScope(user.role);

    if (scope === 'all' || user.role === 'super_admin') return true;

    switch (scope) {
        case 'own':
            return (
                resource._id?.toString() === user.employeeRef?.toString() ||
                resource.employeeId?.toString() === user.employeeRef?.toString() ||
                resource.emp_no === user.employeeId
            );

        case 'division':
        case 'divisions':
            if (user.divisionMapping && Array.isArray(user.divisionMapping) && user.divisionMapping.length > 0) {
                return user.divisionMapping.some(mapping => {
                    const matchDivision = resource.division_id?.toString() === mapping.division?.toString();
                    if (!matchDivision) return false;
                    // If departments array is empty, access to all departments in that division
                    if (!mapping.departments || mapping.departments.length === 0) return true;
                    return mapping.departments.some(d => d.toString() === resource.department_id?.toString());
                });
            }
            if (user.allowedDivisions && user.allowedDivisions.length > 0) {
                return user.allowedDivisions.some(d => d.toString() === resource.division_id?.toString());
            }
            // Fallback
            return user.departments?.some(d => d.toString() === resource.department_id?.toString());

        case 'department':
            return resource.department_id?.toString() === user.department?.toString();

        case 'departments':
            return user.departments?.some(d => d.toString() === resource.department_id?.toString());

        default:
            return false;
    }
}

module.exports = {
    applyScopeFilter,
    buildScopeFilter,
    hasAccessToResource,
    getDefaultScope
};
