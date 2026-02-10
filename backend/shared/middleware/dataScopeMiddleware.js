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
                { employeeId: user.employeeRef },  // OT, Permission: employeeId is MongoDB ref
                { emp_no: user.employeeId },      // Leave/OD: emp_no (string)
                { appliedBy: user._id },
                { requestedBy: user._id }         // OT, Permission use requestedBy
            ]
        };
    } else if (user.employeeId) {
        ownFilter = {
            $or: [
                { emp_no: user.employeeId },      // Leave/OD: emp_no
                { employeeId: user.employeeId },  // When employeeId is used as ref
                { appliedBy: user._id },
                { requestedBy: user._id }
            ]
        };
    } else {
        ownFilter = {
            $or: [
                { _id: user._id },
                { appliedBy: user._id },
                { requestedBy: user._id }
            ]
        };
    }

    if (scope === 'own') {
        return ownFilter;
    }

    // 2. Administrative Scope Filter
    let administrativeFilter = { _id: null };

    switch (scope) {
        case 'division':
        case 'divisions':
        case 'department':
        case 'departments':
        case 'hr':
            // Single source: divisionMapping
            if (user.divisionMapping && Array.isArray(user.divisionMapping) && user.divisionMapping.length > 0) {
                const orConditions = [];
                user.divisionMapping.forEach(mapping => {
                    const divisionId = typeof mapping.division === 'string' ? mapping.division : mapping.division?._id;
                    if (!divisionId) return;
                    const divisionCondition = createDivisionFilter([divisionId]);

                    if (mapping.departments && Array.isArray(mapping.departments) && mapping.departments.length > 0) {
                        const departmentCondition = createDepartmentFilter(mapping.departments);
                        orConditions.push({ $and: [divisionCondition, departmentCondition] });
                    } else {
                        orConditions.push(divisionCondition);
                    }
                });
                if (orConditions.length > 0) {
                    administrativeFilter = orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
                }
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
    if (user.role === 'super_admin' || user.role === 'sub_admin' || user.role === 'admin') {
        return {};
    }

    const userRole = user.role;

    return {
        $or: [
            // 1. Applicant (Owner) - Always sees their own applications
            { appliedBy: user._id },
            { requestedBy: user._id },  // OT, Permission use requestedBy
            { employeeId: user.employeeRef },  // OT, Permission: employeeId is MongoDB ref
            { emp_no: user.employeeId },  // Leave/OD: emp_no (string)

            // 2. Current Desk (Next Approver) - Visible when it's their turn
            { 'workflow.nextApprover': userRole },
            { 'workflow.nextApproverRole': userRole },

            // 3. Past Desks (Audit Trail) - Visible if they already took action
            {
                'workflow.approvalChain': {
                    $elemMatch: {
                        role: userRole,
                        status: { $in: ['approved', 'rejected', 'skipped'] }
                    }
                }
            },

            // 4. Specifically involved in history
            { 'workflow.history.actionBy': user._id },

            // 5. Global Management Visibility
            // HR sees all active leaves in their scope for tracking
            ...(userRole === 'hr' ? [{ isActive: true }] : []),
            // HOD/Manager sees everything once it's finalized (regardless of if they were in the chain)
            // if we want them to see all approved leaves in their department
            ...((userRole === 'hod' || userRole === 'manager') ? [{ status: { $in: ['approved', 'rejected', 'cancelled', 'checked_out', 'checked_in'] } }] : [])
        ]
    };
}

/**
 * Middleware to inject scope filter into request
 */
const applyScopeFilter = async (req, res, next) => {
    try {
        // req.user from protect middleware already has basic info
        const userId = req.user.userId || req.user._id;

        // 1. Try to find in User collection first
        let user = await User.findById(userId);

        // 2. If not found, check if it's an employee loggin in directly
        if (!user) {
            const employee = await Employee.findById(userId);
            if (employee) {
                // Normalize employee to look like a User for scoping purposes
                user = employee.toObject ? employee.toObject() : employee;
                user.role = 'employee';
                user.dataScope = 'own';
                user.employeeRef = employee._id;
                user.employeeId = employee.emp_no;
                user._id = employee._id;
                user.divisionMapping = [];
            }
        }

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
 * Centralized Jurisdictional Helper
 * Verifies if a record falls within the user's assigned administrative data scope.
 * @param {Object} user - User object from req.scopedUser or full database fetch
 * @param {Object} record - The document (Leave, OD, OT, Permission) to check
 * @returns {Boolean} True if authorized, false otherwise
 */
function checkJurisdiction(user, record) {
    if (!user || !record) return false;

    // 1. Global Bypass (Super Admin / Sub Admin / Global HR)
    if (user.role === 'super_admin' || user.role === 'sub_admin' || user.dataScope === 'all') {
        return true;
    }

    // 2. Ownership (Applicants can always access their own records)
    const isOwner =
        (record.employeeId && user.employeeRef && record.employeeId.toString() === user.employeeRef.toString()) ||
        (record.emp_no && user.employeeId && record.emp_no === user.employeeId) ||
        (record.employeeNumber && user.employeeId && record.employeeNumber === user.employeeId) ||
        (record.appliedBy && user._id && record.appliedBy.toString() === user._id.toString()) ||
        (record.requestedBy && user._id && record.requestedBy.toString() === user._id.toString());

    if (isOwner) return true;

    // 3. Organizational Scope Enforcement
    // Capture IDs from record (dual-field support)
    const resDivId = record.division_id?.toString() || record.division?.toString();
    const resDeptId = (record.department_id || record.department)?.toString();

    const scope = user.dataScope || getDefaultScope(user.role);

    switch (scope) {
        case 'hr':
        case 'divisions':
        case 'division':
        case 'departments':
        case 'department':
            if (user.divisionMapping && Array.isArray(user.divisionMapping) && user.divisionMapping.length > 0) {
                const hasMappingMatch = user.divisionMapping.some(mapping => {
                    const matchDivision = resDivId === (mapping.division?._id || mapping.division)?.toString();
                    if (!matchDivision) return false;

                    if (!mapping.departments || mapping.departments.length === 0) return true;
                    return mapping.departments.some(d => d.toString() === resDeptId);
                });
                if (hasMappingMatch) return true;
            }
            return false;

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
        const employees = await Employee.find({ is_active: true }).select('_id');
        return employees.map(e => e._id);
    }

    const { divisionMapping } = user;
    const orConditions = [];

    if (divisionMapping && Array.isArray(divisionMapping) && divisionMapping.length > 0) {
        divisionMapping.forEach(m => {
            const divId = typeof m.division === 'string' ? m.division : m.division?._id;
            if (divId) {
                const divCondition = createDivisionFilter([divId]);
                if (m.departments && Array.isArray(m.departments) && m.departments.length > 0) {
                    const deptFilter = createDepartmentFilter(m.departments);
                    orConditions.push({ $and: [divCondition, deptFilter] });
                } else {
                    orConditions.push(divCondition);
                }
            }
        });
    }

    if (orConditions.length === 0) return [];

    const employees = await Employee.find({ $or: orConditions }).select('_id');
    return employees.map(e => e._id);
}

module.exports = {
    applyScopeFilter,
    buildScopeFilter,
    buildWorkflowVisibilityFilter,
    checkJurisdiction,
    getDefaultScope,
    getEmployeeIdsInScope
};
