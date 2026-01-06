// Module Categories Configuration
export const MODULE_CATEGORIES = [
    {
        code: 'DASHBOARD',
        name: 'Dashboard',
        icon: '📊',
        modules: [
            { code: 'DASHBOARD', label: 'Dashboard', href: '/dashboard' }
        ]
    },
    {
        code: 'EMPLOYEE_MANAGEMENT',
        name: 'Employee Management',
        icon: '👥',
        modules: [
            { code: 'EMPLOYEES', label: 'Employees', href: '/employees' },
            { code: 'PROFILE', label: 'My Profile', href: '/profile' }
        ]
    },
    {
        code: 'TIME_ATTENDANCE',
        name: 'Time & Attendance',
        icon: '⏰',
        modules: [
            { code: 'LEAVE_OD', label: 'Leave & OD', href: '/leaves' },
            { code: 'OT_PERMISSIONS', label: 'OT & Permissions', href: '/ot-permissions' },
            { code: 'SHIFT_ROSTER', label: 'Shift Roster', href: '/shift-roster' },
            { code: 'CONFUSED_SHIFTS', label: 'Confused Shifts', href: '/confused-shifts' },
            { code: 'SHIFTS', label: 'Shifts', href: '/shifts' },
            { code: 'ATTENDANCE', label: 'Attendance', href: '/attendance' }
        ]
    },
    {
        code: 'ORGANIZATION',
        name: 'Organization',
        icon: '🏢',
        modules: [
            { code: 'DEPARTMENTS', label: 'Departments', href: '/departments' },
            { code: 'DEPARTMENTAL_SETTINGS', label: 'Departmental Settings', href: '/departmental-settings' }
        ]
    },
    {
        code: 'FINANCE_PAYROLL',
        name: 'Finance & Payroll',
        icon: '💰',
        modules: [
            { code: 'PAYMENTS', label: 'Payments', href: '/payments' },
            { code: 'PAY_REGISTER', label: 'Pay Register', href: '/pay-register' },
            { code: 'PAYSLIPS', label: 'Payslips', href: '/payslips' },
            { code: 'ALLOWANCES_DEDUCTIONS', label: 'Allowances & Deductions', href: '/allowances-deductions' },
            { code: 'LOANS_SALARY_ADVANCE', label: 'Loans & Salary Advance', href: '/loans-salary-advance' }
        ]
    },
    {
        code: 'ARREARS',
        name: 'Arrears',
        icon: '📈',
        modules: [
            { code: 'ARREARS', label: 'Arrears', href: '/arrears' }
        ]
    },
    {
        code: 'BONUS_MANAGEMENT',
        name: 'Bonus Management',
        icon: '🎁',
        modules: [
            { code: 'BONUS_POLICIES', label: 'Bonus Policies', href: '/superadmin/bonus/policies' },
            { code: 'BONUS_CALCULATOR', label: 'Bonus Calculator', href: '/superadmin/bonus/calculator' },
            { code: 'BONUS_BATCHES', label: 'Bonus Batches', href: '/superadmin/bonus/batches' }
        ]
    },
    {
        code: 'SETTINGS',
        name: 'Settings',
        icon: '⚙️',
        modules: [
            { code: 'GENERAL_SETTINGS', label: 'General Settings', href: '/settings' }
        ]
    }
];

// Helper to get modules for a category
export function getModulesForCategory(categoryCode: string) {
    const category = MODULE_CATEGORIES.find(c => c.code === categoryCode);
    return category?.modules || [];
}

// Helper to check if a module is enabled based on feature control
export function isModuleEnabled(moduleCode: string, featureControl: string[] | null): boolean {
    if (!featureControl || featureControl.length === 0) return true; // If no feature control or empty, allow all
    return featureControl.includes(moduleCode);
}

// Helper to check if a category has any enabled modules
export function isCategoryEnabled(categoryCode: string, featureControl: string[] | null): boolean {
    const modules = getModulesForCategory(categoryCode);
    return modules.some(module => isModuleEnabled(module.code, featureControl));
}
