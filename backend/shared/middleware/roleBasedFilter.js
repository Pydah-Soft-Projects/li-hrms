/**
 * Role-Based Filter Middleware
 * Automatically filters queries based on user role and scope
 * Applies to GET requests for employee/attendance/payroll data
 */

const roleBasedFilter = (resourceType) => {
    return (req, res, next) => {
        const { role, department, departments, scope, employeeId } = req.user;

        // Initialize filter object
        req.roleFilter = {};

        switch (role) {
            case 'employee':
                // Employees see ONLY their own data
                if (resourceType === 'employees') {
                    req.roleFilter.emp_no = employeeId;
                } else if (resourceType === 'attendance' || resourceType === 'payroll') {
                    req.roleFilter.employeeId = employeeId;
                } else if (resourceType === 'leaves' || resourceType === 'loans') {
                    req.roleFilter.employeeId = employeeId;
                }
                break;

            case 'hod':
                // HODs see their department only
                if (resourceType === 'employees') {
                    req.roleFilter.department_id = department;
                } else if (resourceType === 'attendance' || resourceType === 'payroll') {
                    // Need to join with employee to filter by department
                    req.roleFilter.departmentScope = department;
                } else if (resourceType === 'leaves' || resourceType === 'loans') {
                    req.roleFilter.departmentScope = department;
                }
                break;

            case 'hr':
            case 'sub_admin':
                // HR sees based on scope
                if (scope === 'restricted' && departments?.length > 0) {
                    const deptIds = departments.map(d => d._id || d);

                    if (resourceType === 'employees') {
                        req.roleFilter.department_id = { $in: deptIds };
                    } else {
                        req.roleFilter.departmentScope = { $in: deptIds };
                    }
                }
                // Global scope = no filter (see all)
                break;

            case 'super_admin':
                // SuperAdmin sees everything - no filter
                break;

            default:
                return res.status(403).json({
                    success: false,
                    message: 'Invalid role'
                });
        }

        console.log(`[RBAC Filter] Role: ${role}, Resource: ${resourceType}, Filter:`, req.roleFilter);
        next();
    };
};

module.exports = { roleBasedFilter };
