// Module Categories Configuration
export const MODULE_CATEGORIES = [
    {
        code: 'MAIN',
        name: 'Main',
        icon: '🏠',
        modules: [
            { code: 'DASHBOARD', label: 'Dashboard', href: '/dashboard' }
        ]
    },
    {
        code: 'EMPLOYEE_MANAGEMENT',
        name: 'Employees',
        icon: '👥',
        modules: [
            { code: 'EMPLOYEES', label: 'Employees', href: '/employees', verifiable: true, bankable: true, editable: true, secondSalaryEditable: true },
            { code: 'PROMOTIONS_TRANSFERS', label: 'Promotions & Transfers', href: '/promotions-transfers' },
            { code: 'RESIGNATION', label: 'Resignations', href: '/resignations', terminable: true },
            { code: 'EMPLOYEE_BIRTHDAYS', label: 'Birthdays', href: '/employee-birthdays' },
            { code: 'ASSETS_MANAGEMENT', label: 'Assets', href: '/assets-management' },
            { code: 'PROFILE', label: 'My Profile', href: '/profile' }
        ]
    },
    {
        code: 'AUDITS_CATEGORY',
        name: 'Audits',
        icon: '🛡️',
        modules: [
            { code: 'ATTENDANCE_AUDIT', label: 'Audits', href: '/attendance-audit' }
        ]
    },
    {
        code: 'TIME_ATTENDANCE',
        name: 'Time & Attendance',
        icon: '⏰',
        modules: [
            { code: 'ATTENDANCE', label: 'Attendance', href: '/attendance' },
            { code: 'LIVE_ATTENDANCE', label: 'Live Attendance', href: '/live-attendance' },
            { code: 'LEAVE_OD', label: 'Leave & OD', href: '/leaves', fileUploadable: true },
            { code: 'LEAVE_REGISTER', label: 'Leave Register', href: '/leave-register' },
            { code: 'CCL', label: 'CCL', href: '/ccl' },
            { code: 'OT_PERMISSIONS', label: 'OT & Permissions', href: '/ot-permissions' },
            { code: 'SHIFT_ROSTER', label: 'Shift Roster', href: '/shift-roster' },
            { code: 'SHIFTS', label: 'Shifts', href: '/shifts' },
            { code: 'CONFUSED_SHIFTS', label: 'Confused Shifts', href: '/confused-shifts' },
            { code: 'HOLIDAY_CALENDAR', label: 'Holidays', href: '/holidays' },
            // Permission-only module: grants ability to manage GLOBAL holidays (not just scoped groups)
            { code: 'HOLIDAY_CALENDAR_MANAGE_GLOBAL', label: 'Holiday Calendar (Global Manage)', href: '/holidays' }
        ]
    },
    {
        code: 'ORGANIZATION',
        name: 'Organization',
        icon: '🏢',
        modules: [
            { code: 'DIVISIONS', label: 'Divisions', href: '/divisions' },
            { code: 'DEPARTMENTS', label: 'Departments', href: '/departments' },
            { code: 'EMPLOYEE_GROUPS', label: 'Employee Groups', href: '/employee-groups' },
            { code: 'DEPARTMENTAL_SETTINGS', label: 'Dept. Settings', href: '/departmental-settings' }
        ]
    },
    {
        code: 'ADMINISTRATION',
        name: 'Administration',
        icon: '🛡️',
        modules: [
            { code: 'USERS', label: 'Users', href: '/users' },
            { code: 'REPORTS', label: 'Reports', href: '/reports' }
        ]
    },
    {
        code: 'FINANCE_PAYROLL',
        name: 'Payroll',
        icon: '💰',
        modules: [
            { code: 'PAY_REGISTER', label: 'Pay Register', href: '/pay-register' },
            { code: 'PAYSHEET', label: 'Paysheet', href: '/payroll-sheet' },
            { code: 'PAYMENTS', label: 'Payments', href: '/payments' },
            { code: 'PAYSLIPS', label: 'Payslips', href: '/payslips', releasable: true },
            { code: 'ARREARS', label: 'Arrears', href: '/arrears' },
            { code: 'MANUAL_DEDUCTIONS', label: 'Manual Deductions', href: '/manual-deductions' },
            { code: 'ALLOWANCES_DEDUCTIONS', label: 'Allowances & Deductions', href: '/allowances-deductions' },
            { code: 'LOANS', label: 'Loans & Advance', href: '/loans' },
            { code: 'PAYROLL_CONFIG', label: 'Payroll Config', href: '/payroll-config' },
            { code: 'STATUTORY_DEDUCTIONS', label: 'Statutory Deductions', href: '/statutory-deductions' }
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

/** Legacy / alternate module codes that grant the same access (e.g. feature control vs nav config). */
const MODULE_CODE_ALIASES: Record<string, string[]> = {
    LOANS: ['LOANS_SALARY_ADVANCE', 'LOAN'],
    LOANS_SALARY_ADVANCE: ['LOANS', 'LOAN'],
    ATTENDANCE_AUDIT: ['AUDITS'],
    AUDITS: ['ATTENDANCE_AUDIT'],
};

function moduleCodesToCheck(moduleCode: string): string[] {
    const aliases = MODULE_CODE_ALIASES[moduleCode] || [];
    return [moduleCode, ...aliases];
}

function hasModulePermission(moduleCode: string, featureControl: string[]): boolean {
    return moduleCodesToCheck(moduleCode).some(
        (code) =>
            featureControl.includes(code) ||
            featureControl.includes(`${code}:read`) ||
            featureControl.includes(`${code}:write`) ||
            featureControl.includes(`${code}:verify`) ||
            featureControl.includes(`${code}:terminate`) ||
            featureControl.includes(`${code}:release`)
    );
}

// Helper to check if a module is enabled based on feature control
export function isModuleEnabled(moduleCode: string, featureControl: string[] | null): boolean {
    if (!featureControl || featureControl.length === 0) return true; // If no feature control or empty, allow all

    if (hasModulePermission(moduleCode, featureControl)) return true;

    // Employee groups: treat as part of org setup if departments access exists (backward compatible)
    if (moduleCode === 'EMPLOYEE_GROUPS') {
        return (
            featureControl.includes('DEPARTMENTS') ||
            featureControl.includes('DEPARTMENTS:read') ||
            featureControl.includes('DEPARTMENTS:write')
        );
    }

    return false;
}

// Helper to check if a category has any enabled modules
export function isCategoryEnabled(categoryCode: string, featureControl: string[] | null): boolean {
    const modules = getModulesForCategory(categoryCode);
    return modules.some(module => isModuleEnabled(module.code, featureControl));
}
