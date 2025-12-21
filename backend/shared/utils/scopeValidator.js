/**
 * Scope Validator Utility
 * Validates if a resource is within user's scope
 * Used for UPDATE/DELETE operations to ensure users can only modify resources they have access to
 */

const Employee = require('../../employees/model/Employee');

const validateScope = async (user, resourceType, resourceId) => {
    const { role, department, departments, scope, employeeId } = user;

    console.log(`[Scope Validation] Role: ${role}, Resource: ${resourceType}, ID: ${resourceId}`);

    // SuperAdmin has access to everything
    if (role === 'super_admin') {
        return { valid: true };
    }

    // Employee can only access their own resources
    if (role === 'employee') {
        if (resourceType === 'employee') {
            const employee = await Employee.findOne({ emp_no: resourceId });
            const isOwn = employee?.emp_no === employeeId;
            return {
                valid: isOwn,
                message: isOwn ? null : 'You can only access your own records'
            };
        }
        return {
            valid: false,
            message: 'Employees cannot access this resource'
        };
    }

    // HOD can access department resources
    if (role === 'hod') {
        if (resourceType === 'employee') {
            const employee = await Employee.findById(resourceId).populate('department_id');
            const empDeptId = employee?.department_id?._id || employee?.department_id;
            const isInDept = empDeptId?.toString() === department?.toString();

            return {
                valid: isInDept,
                message: isInDept ? null : 'You can only access employees in your department'
            };
        }
    }

    // HR scope validation
    if (role === 'hr' || role === 'sub_admin') {
        if (scope === 'global') {
            return { valid: true };
        }

        if (scope === 'restricted' && departments?.length > 0) {
            if (resourceType === 'employee') {
                const employee = await Employee.findById(resourceId).populate('department_id');
                const empDeptId = employee?.department_id?._id || employee?.department_id;
                const isInScope = departments.some(d =>
                    (d._id || d).toString() === empDeptId?.toString()
                );

                return {
                    valid: isInScope,
                    message: isInScope ? null : 'You can only access employees in your assigned departments'
                };
            }
        }
    }

    return {
        valid: false,
        message: 'Access denied'
    };
};

/**
 * Validate if user can apply leave/OD for a specific employee
 */
const validateApplyForEmployee = async (user, targetEmployeeId) => {
    const { role, department, departments, scope, employeeId } = user;

    // SuperAdmin can apply for anyone
    if (role === 'super_admin') {
        return { valid: true };
    }

    // Employee can only apply for self
    if (role === 'employee') {
        const isOwn = targetEmployeeId === employeeId;
        return {
            valid: isOwn,
            message: isOwn ? null : 'You can only apply for yourself'
        };
    }

    // HOD can apply for self + department members
    if (role === 'hod') {
        if (targetEmployeeId === employeeId) {
            return { valid: true };
        }

        const employee = await Employee.findOne({ emp_no: targetEmployeeId });
        const empDeptId = employee?.department_id?._id || employee?.department_id;
        const isInDept = empDeptId?.toString() === department?.toString();

        return {
            valid: isInDept,
            message: isInDept ? null : 'You can only apply for yourself or your department members'
        };
    }

    // HR can apply for self + scoped employees
    if (role === 'hr' || role === 'sub_admin') {
        if (targetEmployeeId === employeeId) {
            return { valid: true };
        }

        if (scope === 'global') {
            return { valid: true };
        }

        if (scope === 'restricted' && departments?.length > 0) {
            const employee = await Employee.findOne({ emp_no: targetEmployeeId });
            const empDeptId = employee?.department_id?._id || employee?.department_id;
            const isInScope = departments.some(d =>
                (d._id || d).toString() === empDeptId?.toString()
            );

            return {
                valid: isInScope,
                message: isInScope ? null : 'You can only apply for employees in your assigned departments'
            };
        }
    }

    return {
        valid: false,
        message: 'Access denied'
    };
};

module.exports = {
    validateScope,
    validateApplyForEmployee
};
