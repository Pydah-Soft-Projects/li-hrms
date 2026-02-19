
interface EmployeeMinimal {
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    emp_no?: string;
}

export const getEmployeeName = (emp: EmployeeMinimal | null | undefined) => {
    if (!emp) return '';
    if (emp.employee_name) return emp.employee_name;
    if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
    if (emp.first_name) return emp.first_name;
    return emp.emp_no || '';
};

export const getEmployeeInitials = (emp: EmployeeMinimal | null | undefined) => {
    const name = getEmployeeName(emp);
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
    }
    return (name[0] || 'E').toUpperCase();
};

export function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
}
