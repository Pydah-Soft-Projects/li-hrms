/**
 * Permission Check Middleware
 * Validates if user has permission for specific actions
 * Used for CREATE, UPDATE, DELETE operations
 */

const permissionCheck = (action, resourceType) => {
    return (req, res, next) => {
        const { role, department, departments, scope } = req.user;

        // Define permission matrix
        const permissions = {
            // Employees Module
            'create:employee': ['super_admin', 'hr', 'sub_admin'],
            'update:employee': ['super_admin', 'hr', 'sub_admin'],
            'delete:employee': ['super_admin'],

            // Attendance Module
            'mark:attendance': ['super_admin', 'hr', 'hod', 'employee'], // Self only for employee
            'edit:attendance': ['super_admin', 'hr'],
            'approve:regularization': ['super_admin', 'hr', 'hod'],

            // Leaves/OD Module
            'apply:leave': ['super_admin', 'hr', 'hod', 'employee'],
            'approve:leave': ['super_admin', 'hr', 'hod'],
            'apply:od': ['super_admin', 'hr', 'hod', 'employee'],
            'approve:od': ['super_admin', 'hr', 'hod'],

            // Payslips Module
            'release:payslip': ['super_admin'],
            'view:payslip': ['super_admin', 'hr', 'employee'], // Scoped

            // Loans Module
            'apply:loan': ['super_admin', 'hr', 'hod', 'employee'],
            'approve:loan': ['super_admin', 'hr', 'hod'],

            // Shifts Module
            'manage:shifts': ['super_admin', 'hr', 'hod'],
            'assign:shift': ['super_admin', 'hr', 'hod'],

            // Settings Module
            'manage:settings': ['super_admin'],

            // Reports Module
            'view:reports': ['super_admin', 'hr', 'hod'],
            'export:reports': ['super_admin', 'hr'],
        };

        const permissionKey = `${action}:${resourceType}`;
        const allowedRoles = permissions[permissionKey];

        if (!allowedRoles) {
            console.warn(`[RBAC] Permission configuration not found for: ${permissionKey}`);
            return res.status(500).json({
                success: false,
                message: 'Permission configuration not found'
            });
        }

        if (!allowedRoles.includes(role)) {
            console.log(`[RBAC] Permission denied - Role: ${role}, Action: ${permissionKey}`);
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to perform this action'
            });
        }

        // Additional scope validation for scoped roles
        if (action !== 'create' && ['hr', 'hod', 'sub_admin'].includes(role)) {
            req.scopeValidation = {
                role,
                department,
                departments,
                scope
            };
        }

        console.log(`[RBAC] Permission granted - Role: ${role}, Action: ${permissionKey}`);
        next();
    };
};

module.exports = { permissionCheck };
