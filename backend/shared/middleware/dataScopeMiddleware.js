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

    switch (scope) {
        case 'own':
            // Employee sees only their own data
            // Try employeeRef first, then employeeId, then user _id
            if (user.employeeRef) {
                return { $or: [{ _id: user.employeeRef }, { employeeId: user.employeeRef }] };
            } else if (user.employeeId) {
                return { $or: [{ emp_no: user.employeeId }, { employeeId: user.employeeId }] };
            } else {
                return { _id: user._id };
            }

        case 'department':
            // HOD sees their department
            if (!user.department) {
                console.warn(`[DataScope] User ${user._id} has 'department' scope but no department assigned`);
                return { _id: null }; // No access
            }
            return { department_id: user.department };

        case 'departments':
            // HR sees assigned departments
            if (!user.departments || user.departments.length === 0) {
                console.warn(`[DataScope] User ${user._id} has 'departments' scope but no departments assigned`);
                return { _id: null }; // No access
            }
            return { department_id: { $in: user.departments } };

        case 'all':
            // Admin sees everything
            return {};

        default:
            console.warn(`[DataScope] Unknown scope '${scope}' for user ${user._id}, defaulting to 'own'`);
            return { _id: user._id };
    }
}

/**
 * Middleware to inject scope filter into request
 * Usage: Apply this middleware to routes that need scope filtering
 */
const applyScopeFilter = async (req, res, next) => {
    try {
        // Get full user object with populated fields
        const user = await User.findById(req.user.userId)
            .populate('department')
            .populate('departments')
            .populate('employeeRef');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Build and attach scope filter
        req.scopeFilter = buildScopeFilter(user);
        req.scopedUser = user; // Attach full user for reference

        console.log(`[DataScope] User: ${user.email}, Role: ${user.role}, Scope: ${user.dataScope || getDefaultScope(user.role)}`);

        next();
    } catch (error) {
        console.error('[DataScope] Error applying scope filter:', error);
        return res.status(500).json({
            success: false,
            message: 'Error applying data scope filter',
            error: error.message
        });
    }
};

/**
 * Helper to check if user has access to specific resource
 * @param {Object} user - User object
 * @param {Object} resource - Resource to check (e.g., employee, leave)
 * @returns {Boolean}
 */
function hasAccessToResource(user, resource) {
    const scope = user.dataScope || getDefaultScope(user.role);

    switch (scope) {
        case 'own':
            // Check if resource belongs to user
            return (
                resource._id?.toString() === user.employeeRef?.toString() ||
                resource.employeeId?.toString() === user.employeeRef?.toString() ||
                resource.emp_no === user.employeeId
            );

        case 'department':
            // Check if resource is in user's department
            return resource.department_id?.toString() === user.department?.toString();

        case 'departments':
            // Check if resource is in any of user's departments
            const deptIds = user.departments.map(d => d.toString());
            return deptIds.includes(resource.department_id?.toString());

        case 'all':
            return true;

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
