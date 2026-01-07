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
        'manager': 'division',
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

    // 1. Own Records Filter (Always allow users to see their own data)
    let ownFilter = { _id: null };
    if (user.employeeRef) {
        ownFilter = {
            $or: [
                { _id: user.employeeRef },
                { employeeId: user.employeeRef },
                { emp_no: user.employeeId },
                { employeeNumber: user.employeeId },
                { appliedBy: user._id }
            ]
        };
    } else if (user.employeeId) {
        ownFilter = {
            $or: [
                { emp_no: user.employeeId },
                { employeeNumber: user.employeeId },
                { employeeId: user.employeeId },
                { appliedBy: user._id }
            ]
        };
    } else {
        ownFilter = {
            $or: [
                { _id: user._id },
                { appliedBy: user._id }
            ]
        };
    }

    if (scope === 'own') {
        return ownFilter;
    }

    // 2. Administrative Scope Filter
    let administrativeFilter = { _id: null };

    // Helper to create department filter that works for both schemas
    const createDepartmentFilter = (deptIds) => {
        if (!deptIds || deptIds.length === 0) return { _id: null };
        return {
            $or: [
                { department_id: { $in: deptIds } },
                { department: { $in: deptIds } }
            ]
        };
    };

    // Helper to create division filter that works for both schemas
    const createDivisionFilter = (divIds) => {
        if (!divIds || divIds.length === 0) return { _id: null };
        return {
            $or: [
                { division_id: { $in: divIds } },
                { division: { $in: divIds } } // Just in case some models use 'division'
            ]
        };
    };

    switch (scope) {
        case 'division':
        case 'divisions':
            if (user.divisionMapping && Array.isArray(user.divisionMapping) && user.divisionMapping.length > 0) {
                const orConditions = [];
                user.divisionMapping.forEach(mapping => {
                    // Filter matching Division
                    const divisionCondition = {
                        $or: [
                            { division_id: mapping.division },
                            // Add 'division' field just in case, though typically it's division_id
                            { division: mapping.division }
                        ]
                    };

                    // Filter matching Departments within Division
                    let departmentCondition = null;
                    if (mapping.departments && Array.isArray(mapping.departments) && mapping.departments.length > 0) {
                        departmentCondition = createDepartmentFilter(mapping.departments);
                    }

                    // Combined condition for this mapping entry
                    // (Division MATCH) AND (Optional Department MATCH)
                    // If no specific departments provided, user gets access to ALL departments in that division
                    if (departmentCondition && Object.keys(departmentCondition).length > 0 && !departmentCondition._id) {
                        orConditions.push({
                            $and: [divisionCondition, departmentCondition]
                        });
                    } else {
                        orConditions.push(divisionCondition);
                    }
                });
                administrativeFilter = orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
            } else if (user.allowedDivisions && user.allowedDivisions.length > 0) {
                // If mapping is empty but divisions are assigned, allow access to all departments in those divisions
                administrativeFilter = createDivisionFilter(user.allowedDivisions);
            } else if (user.departments && user.departments.length > 0) {
                // Fallback to departments if divisions not setup correctly
                administrativeFilter = createDepartmentFilter(user.departments);
            }
            break;

        case 'department':
            if (user.department) {
                administrativeFilter = createDepartmentFilter([user.department]);
            }
            break;

        case 'departments':
            if (user.departments && user.departments.length > 0) {
                administrativeFilter = createDepartmentFilter(user.departments);
            }
            break;

        default:
            administrativeFilter = { _id: user._id };
    }

    // Return combined filter: (Own Records) OR (Administrative Scope)
    return { $or: [ownFilter, administrativeFilter] };
}

/**
 * Build workflow visibility filter for sequential travel
 * Ensures records are only visible once they reach a user's stage or if they've acted on them
 * @param {Object} user - User object from req.user
 * @returns {Object} MongoDB filter object
 */
function buildWorkflowVisibilityFilter(user) {
    if (!user) return { _id: null };

    // Super Admin and Sub Admin see everything within their scope immediately
    if (user.role === 'super_admin' || user.role === 'sub_admin') {
        return {};
    }

    const userRole = user.role;

    return {
        $or: [
            // 1. Applicant (Owner) - Always sees their own applications
            { appliedBy: user._id },
            { employeeId: user.employeeRef },

            // 2. Current Desk (Next Approver) - Visible when it's their turn
            { 'workflow.nextApprover': userRole },
            { 'workflow.nextApproverRole': userRole },

            // 3. Past Desks (Audit Trail) - Visible if they already took action
            {
                'workflow.approvalChain': {
                    $elemMatch: {
                        role: userRole,
                        status: { $in: ['approved', 'rejected', 'skipped', 'forwarded'] }
                    }
                }
            },

            // 4. Specifically involved in history
            { 'workflow.history.actionBy': user._id },

            // 5. Global HR Visibility for Approved Records
            ...(userRole === 'hr' ? [{ status: 'approved' }] : [])
        ]
    };
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

                    // Support dual field names for department match
                    const resourceDeptId = (resource.department_id || resource.department)?.toString();
                    return mapping.departments.some(d => d.toString() === resourceDeptId);
                });
            }
            if (user.allowedDivisions && user.allowedDivisions.length > 0) {
                return user.allowedDivisions.some(d => d.toString() === resource.division_id?.toString());
            }
            // Fallback (Support dual field names)
            const fallbackDeptId = (resource.department_id || resource.department)?.toString();
            return user.departments?.some(d => d.toString() === fallbackDeptId);

        case 'department':
            const singleDeptId = (resource.department_id || resource.department)?.toString();
            return singleDeptId === user.department?.toString();

        case 'departments':
            const multiDeptId = (resource.department_id || resource.department)?.toString();
            return user.departments?.some(d => d.toString() === multiDeptId);

        default:
            return false;
    }
}

/**
 * Get all employee IDs that fall within a user's assigned scope
 * Use this for "Employee-First Scoping" in controllers
 * @param {Object} user - User object with scoping fields
 * @returns {Promise<Array>} Array of Employee ObjectIds
 */
async function getEmployeeIdsInScope(user) {
    if (!user) return [];

    // Super Admins see everything
    if (user.role === 'super_admin' || user.role === 'sub_admin') {
        const employees = await Employee.find({ isActive: true }).select('_id');
        return employees.map(e => e._id);
    }

    const { allowedDivisions, divisionMapping, departments, department } = user;
    const orConditions = [];

    // 1. Division Mapping (Strict mandatory intersection)
    if (divisionMapping && Array.isArray(divisionMapping) && divisionMapping.length > 0) {
        divisionMapping.forEach(m => {
            const divId = typeof m.division === 'string' ? m.division : m.division?._id;
            if (divId) {
                const divCondition = { division_id: divId };
                if (m.departments && Array.isArray(m.departments) && m.departments.length > 0) {
                    divCondition.department_id = { $in: m.departments };
                }
                orConditions.push(divCondition);
            }
        });
    }

    // 2. Allowed Divisions (fallback/broad access)
    if (allowedDivisions && Array.isArray(allowedDivisions) && allowedDivisions.length > 0) {
        orConditions.push({ division_id: { $in: allowedDivisions } });
    }

    // 3. Direct Departments
    const allDepts = Array.isArray(departments) ? [...departments] : [];
    if (department) allDepts.push(department);
    if (allDepts.length > 0) {
        orConditions.push({ department_id: { $in: allDepts } });
    }

    if (orConditions.length === 0) return [];

    const employees = await Employee.find({ $or: orConditions }).select('_id');
    return employees.map(e => e._id);
}

module.exports = {
    applyScopeFilter,
    buildScopeFilter,
    buildWorkflowVisibilityFilter,
    hasAccessToResource,
    getDefaultScope,
    getEmployeeIdsInScope
};
