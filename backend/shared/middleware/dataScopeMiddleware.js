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
 * Employees who have reporting_to set are "reporting-based" - excluded from general admin scope.
 * Only their reporting manager(s) see them. Match employees with empty/no reporting_to.
 */
const excludeReportingBasedEmployeesFilter = {
    $and: [
        { $or: [{ reporting_to: { $exists: false } }, { reporting_to: null }, { reporting_to: [] }] },
        { $or: [{ 'dynamicFields.reporting_to': { $exists: false } }, { 'dynamicFields.reporting_to': null }, { 'dynamicFields.reporting_to': [] }] }
    ]
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
        // For 'own' scope, still include direct reports (reportingToMeFilter)
        const reportingToMeFilter = buildReportingToMeFilter(user);
        return { $or: [ownFilter, reportingToMeFilter] };
    }

    // 2. Administrative Scope Filter (excludes employees who have reporting_to - they follow reporting-based flow only)
    let administrativeFilter = { _id: null };

    switch (scope) {
        case 'division':
        case 'divisions':
            if (user.divisionMapping && Array.isArray(user.divisionMapping) && user.divisionMapping.length > 0) {
                const orConditions = [];
                user.divisionMapping.forEach(mapping => {
                    const divisionId = typeof mapping.division === 'string' ? mapping.division : mapping.division?._id;
                    const divisionCondition = createDivisionFilter([divisionId]);
                    let departmentCondition = null;
                    if (mapping.departments && Array.isArray(mapping.departments) && mapping.departments.length > 0) {
                        departmentCondition = createDepartmentFilter(mapping.departments);
                    }
                    if (departmentCondition && Object.keys(departmentCondition).length > 0 && !departmentCondition._id) {
                        orConditions.push({ $and: [divisionCondition, departmentCondition] });
                    } else {
                        orConditions.push(divisionCondition);
                    }
                });
                administrativeFilter = orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
            } else if (user.allowedDivisions && user.allowedDivisions.length > 0) {
                administrativeFilter = createDivisionFilter(user.allowedDivisions);
            } else if (user.departments && user.departments.length > 0) {
                administrativeFilter = createDepartmentFilter(user.departments);
            }
            break;

        case 'department':
            if (user.department) {
                administrativeFilter = createDepartmentFilter([user.department]);
            }
            break;

        case 'hr':
        case 'departments':
            if (user.divisionMapping && Array.isArray(user.divisionMapping) && user.divisionMapping.length > 0) {
                const orConditions = [];
                user.divisionMapping.forEach(mapping => {
                    const divisionId = typeof mapping.division === 'string' ? mapping.division : mapping.division?._id;
                    const divisionCondition = createDivisionFilter([divisionId]);
                    if (mapping.departments && Array.isArray(mapping.departments) && mapping.departments.length > 0) {
                        const departmentCondition = createDepartmentFilter(mapping.departments);
                        orConditions.push({ $and: [divisionCondition, departmentCondition] });
                    } else {
                        orConditions.push(divisionCondition);
                    }
                });
                administrativeFilter = orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
            } else if (user.allowedDivisions && Array.isArray(user.allowedDivisions) && user.allowedDivisions.length > 0) {
                administrativeFilter = createDivisionFilter(user.allowedDivisions);
            } else if (user.departments && user.departments.length > 0) {
                administrativeFilter = createDepartmentFilter(user.departments);
            }
            break;

        default:
            administrativeFilter = { _id: user._id };
    }

    // Exclude reporting-based employees from administrative scope (they only appear for their reporting manager)
    if (administrativeFilter && Object.keys(administrativeFilter).length > 0 && !administrativeFilter._id) {
        administrativeFilter = { $and: [administrativeFilter, excludeReportingBasedEmployeesFilter] };
    }

    // 3. Reporting-to-me filter: employees who report to this user (direct reports)
    const reportingToMeFilter = buildReportingToMeFilter(user);

    // Return combined filter: (Own Records) OR (Administrative Scope) OR (Direct Reports)
    return { $or: [ownFilter, administrativeFilter, reportingToMeFilter] };
}

/**
 * Build filter for employees who report TO this user (direct reports)
 * Check both root reporting_to and dynamicFields.reporting_to
 * Supports both User._id and User.employeeRef (Employee._id) for flexible matching
 */
function buildReportingToMeFilter(user) {
    if (!user || !user._id) return { _id: null };
    const userId = user._id;
    const employeeRef = user.employeeRef;
    const conditions = [
        { reporting_to: userId },
        { 'dynamicFields.reporting_to': userId }
    ];
    if (employeeRef) {
        conditions.push({ reporting_to: employeeRef });
        conditions.push({ 'dynamicFields.reporting_to': employeeRef });
    }
    return { $or: conditions };
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
                // Initialize empty admin scopes
                user.divisionMapping = [];
                user.allowedDivisions = [];
                user.departments = [];
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

        // For record-based controllers (Leave, OD, Loan, OT, Permission): employee IDs who report to this user
        req.reportingToMeEmployeeIds = await getReportingToMeEmployeeIds(user);

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
 * @returns {Promise<Boolean>} True if authorized, false otherwise
 */
async function checkJurisdiction(user, record) {
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
        (record.appliedBy && user._id && record.appliedBy.toString() === user._id.toString());

    if (isOwner) return true;

    // 3. Reporting-based: Record's employee reports to this user (direct report)
    if (record.employeeId) {
        const emp = await Employee.findById(record.employeeId).select('reporting_to dynamicFields.reporting_to').lean();
        if (emp) {
            const rt = emp.reporting_to || emp.dynamicFields?.reporting_to;
            if (Array.isArray(rt) && rt.length > 0) {
                const userStr = user._id.toString();
                const empRefStr = user.employeeRef?.toString();
                const reportsToUser = rt.some(r => {
                    const rStr = (r && r._id ? r._id : r).toString();
                    return rStr === userStr || (empRefStr && rStr === empRefStr);
                });
                if (reportsToUser) return true;
            }
        }
    }

    // 4. Organizational Scope Enforcement (excludes reporting-based employees - they only appear for their reporting manager)
    // Capture IDs from record (dual-field support)
    const resDivId = record.division_id?.toString() || record.division?.toString();
    const resDeptId = (record.department_id || record.department)?.toString();

    const scope = user.dataScope || getDefaultScope(user.role);

    switch (scope) {
        case 'hr':
        case 'divisions':
        case 'division':
            // Priority 1: Division Mapping (Complex Scoping)
            if (user.divisionMapping && Array.isArray(user.divisionMapping) && user.divisionMapping.length > 0) {
                const hasMappingMatch = user.divisionMapping.some(mapping => {
                    const matchDivision = resDivId === (mapping.division?._id || mapping.division)?.toString();
                    if (!matchDivision) return false;

                    // If departments array is empty, access to all departments in that division
                    if (!mapping.departments || mapping.departments.length === 0) return true;

                    // Support department match
                    return mapping.departments.some(d => d.toString() === resDeptId);
                });
                if (hasMappingMatch) return true;
            }

            // Priority 2: Allowed Divisions (Broad Division Scope)
            if (user.allowedDivisions && Array.isArray(user.allowedDivisions) && user.allowedDivisions.length > 0) {
                if (user.allowedDivisions.some(d => d.toString() === resDivId)) return true;
            }

            // Priority 3: Fallback to departments (for 'hr' or backup)
            if (scope === 'hr' || scope === 'departments') {
                if (user.departments?.some(d => d.toString() === resDeptId)) return true;
                if (user.department?.toString() === resDeptId) return true;
            }
            return false;

        case 'departments':
        case 'department':
            // Direct Department check
            if (user.departments?.some(d => d.toString() === resDeptId)) return true;
            if (user.department?.toString() === resDeptId) return true;
            return false;

        default:
            return false;
    }
}

/**
 * Get employee IDs whose reporting_to includes this user (direct reports)
 * @param {Object} user - User object
 * @returns {Promise<Array>} Array of Employee ObjectIds
 */
async function getReportingToMeEmployeeIds(user) {
    if (!user) return [];
    const userId = user._id;
    const employeeRef = user.employeeRef;
    const conditions = [
        { reporting_to: userId },
        { 'dynamicFields.reporting_to': userId }
    ];
    if (employeeRef) {
        conditions.push({ reporting_to: employeeRef });
        conditions.push({ 'dynamicFields.reporting_to': employeeRef });
    }
    const employees = await Employee.find({ $or: conditions, is_active: true }).select('_id').lean();
    return employees.map(e => e._id);
}

/**
 * Get all employee IDs that fall within a user's assigned scope
 * Excludes reporting-based employees from administrative scope; includes reporting-to-me
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

    const scope = user.dataScope || getDefaultScope(user.role);
    const { allowedDivisions, divisionMapping, departments, department } = user;
    const orConditions = [];

    // 1. Own employee (always include)
    if (user.employeeRef) {
        orConditions.push({ _id: user.employeeRef });
    }

    // 2. Administrative scope - EXCLUDE employees who have reporting_to (they follow reporting-based flow only)
    let adminScopeCondition = null;
    switch (scope) {
        case 'division':
        case 'divisions':
            if (divisionMapping && Array.isArray(divisionMapping) && divisionMapping.length > 0) {
                const mappingConditions = [];
                divisionMapping.forEach(m => {
                    const divId = typeof m.division === 'string' ? m.division : m.division?._id;
                    if (divId) {
                        const divCondition = createDivisionFilter([divId]);
                        if (m.departments && Array.isArray(m.departments) && m.departments.length > 0) {
                            mappingConditions.push({ $and: [divCondition, createDepartmentFilter(m.departments)] });
                        } else {
                            mappingConditions.push(divCondition);
                        }
                    }
                });
                adminScopeCondition = mappingConditions.length === 1 ? mappingConditions[0] : { $or: mappingConditions };
            } else if (allowedDivisions && allowedDivisions.length > 0) {
                adminScopeCondition = createDivisionFilter(allowedDivisions);
            } else if (departments && departments.length > 0) {
                adminScopeCondition = createDepartmentFilter(departments);
            }
            break;
        case 'department':
            if (department) {
                adminScopeCondition = createDepartmentFilter([department]);
            }
            break;
        case 'hr':
        case 'departments':
            if (divisionMapping && Array.isArray(divisionMapping) && divisionMapping.length > 0) {
                const mappingConditions = [];
                divisionMapping.forEach(m => {
                    const divId = typeof m.division === 'string' ? m.division : m.division?._id;
                    if (divId) {
                        const divCondition = createDivisionFilter([divId]);
                        if (m.departments && Array.isArray(m.departments) && m.departments.length > 0) {
                            mappingConditions.push({ $and: [divCondition, createDepartmentFilter(m.departments)] });
                        } else {
                            mappingConditions.push(divCondition);
                        }
                    }
                });
                adminScopeCondition = mappingConditions.length === 1 ? mappingConditions[0] : { $or: mappingConditions };
            } else if (allowedDivisions && allowedDivisions.length > 0) {
                adminScopeCondition = createDivisionFilter(allowedDivisions);
            } else if (departments && departments.length > 0) {
                adminScopeCondition = createDepartmentFilter(departments);
            }
            break;
    }

    if (adminScopeCondition && Object.keys(adminScopeCondition).length > 0 && !adminScopeCondition._id) {
        orConditions.push({ $and: [excludeReportingBasedEmployeesFilter, adminScopeCondition] });
    }

    // 3. Reporting-to-me (direct reports) - always include
    const reportingToMeFilter = buildReportingToMeFilter(user);
    if (reportingToMeFilter && !reportingToMeFilter._id) {
        orConditions.push(reportingToMeFilter);
    }

    if (orConditions.length === 0) return [];

    const employees = await Employee.find({ $or: orConditions }).select('_id').lean();
    return employees.map(e => e._id);
}

module.exports = {
    applyScopeFilter,
    buildScopeFilter,
    buildWorkflowVisibilityFilter,
    checkJurisdiction,
    getDefaultScope,
    getEmployeeIdsInScope,
    getReportingToMeEmployeeIds
};
