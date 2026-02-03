/**
 * Role-Based Permission System
 * 
 * Centralized permission checks for all workspace features.
 * Each function returns true/false based on user role.
 */

export type UserRole = 'super_admin' | 'sub_admin' | 'hr' | 'hod' | 'manager' | 'employee';

export interface User {
    role: UserRole;
    roles?: UserRole[];
    dataScope?: 'all' | 'department' | 'division' | 'own';
    departments?: any[];
    featureControl?: string[];
}

// ==========================================
// ROLE HIERARCHY
// ==========================================

const ROLE_LEVELS: Record<UserRole, number> = {
    super_admin: 100,
    sub_admin: 80,
    hr: 60,
    hod: 50,
    manager: 40,
    employee: 10,
};

/**
 * Check if user has at least the specified role level
 */
export function hasRoleLevel(user: User, minRole: UserRole): boolean {
    const userLevel = ROLE_LEVELS[user.role] || 0;
    const minLevel = ROLE_LEVELS[minRole] || 0;
    return userLevel >= minLevel;
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(user: User, roles: UserRole[]): boolean {
    return roles.includes(user.role);
}

// ==========================================
// PAGE ACCESS PERMISSIONS
// ==========================================

export const PAGE_PERMISSIONS: Record<string, UserRole[]> = {
    '/dashboard': ['sub_admin', 'hr', 'hod', 'manager', 'employee'],
    '/employees': ['sub_admin', 'hr', 'hod', 'manager'],
    '/attendance': ['sub_admin', 'hr', 'hod', 'manager', 'employee'],
    '/leaves': ['sub_admin', 'hr', 'hod', 'manager', 'employee'],
    '/departments': ['sub_admin', 'hr', 'hod'],
    '/shifts': ['sub_admin', 'hr', 'hod'],
    '/shift-roster': ['sub_admin', 'hr', 'hod'],
    '/payroll-transactions': ['sub_admin', 'hr'],
    '/pay-register': ['sub_admin', 'hr'],
    '/payments': ['sub_admin', 'hr'],
    '/payslips': ['sub_admin', 'hr', 'hod', 'manager', 'employee'],
    '/allowances-deductions': ['sub_admin', 'hr'],
    '/loans': ['sub_admin', 'hr', 'employee'],
    '/arrears': ['sub_admin', 'hr'],
    '/ot-permissions': ['sub_admin', 'hr', 'hod', 'manager', 'employee'],
    '/reports': ['sub_admin', 'hr', 'hod', 'manager'],
    '/settings': ['sub_admin', 'hr'],
    '/users': ['sub_admin', 'hr'],
    '/profile': ['sub_admin', 'hr', 'hod', 'manager', 'employee'],
    '/confused-shifts': ['sub_admin', 'hr', 'hod'],
};

export function canAccessPage(user: User, pagePath: string): boolean {
    const allowedRoles = PAGE_PERMISSIONS[pagePath];
    if (!allowedRoles) return true; // Default allow if not specified
    return hasAnyRole(user, allowedRoles);
}

// ==========================================
// EMPLOYEE MANAGEMENT PERMISSIONS
// ==========================================

export function canViewEmployees(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod', 'manager']);
}

export function canCreateEmployee(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canEditEmployee(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod']);
}

export function canDeleteEmployee(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canExportEmployees(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod']);
}

export function canImportEmployees(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

// ==========================================
// ATTENDANCE PERMISSIONS
// ==========================================

export function canViewAttendance(user: User): boolean {
    return true; // All roles can view attendance (scoped by backend)
}

export function canEditAttendance(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod']);
}

export function canApproveAttendance(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod']);
}

export function canExportAttendance(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod', 'manager']);
}

// ==========================================
// LEAVE MANAGEMENT PERMISSIONS
// ==========================================

export function canViewLeaves(user: User): boolean {
    return true; // All roles can view leaves (scoped by backend)
}

export function canApplyLeave(user: User): boolean {
    return true; // All roles can apply for leaves
}

export function canApproveLeaves(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod', 'manager']);
}

export function canRejectLeaves(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod', 'manager']);
}

export function canDeleteLeaves(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

// ==========================================
// PAYROLL PERMISSIONS
// ==========================================

export function canViewPayroll(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canProcessPayroll(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canEditPayroll(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canViewPayslips(user: User): boolean {
    return true; // All roles (employees see their own)
}

export function canGeneratePayslips(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

// ==========================================
// DEPARTMENT MANAGEMENT PERMISSIONS
// ==========================================

export function canViewDepartments(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod']);
}

export function canCreateDepartment(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canEditDepartment(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canDeleteDepartment(user: User): boolean {
    return hasAnyRole(user, ['sub_admin']);
}

// ==========================================
// SHIFT MANAGEMENT PERMISSIONS
// ==========================================

export function canViewShifts(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod']);
}

export function canCreateShift(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canEditShift(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod']);
}

export function canDeleteShift(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canAssignShifts(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod']);
}

// ==========================================
// USER MANAGEMENT PERMISSIONS
// ==========================================

export function canViewUsers(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canCreateUser(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canEditUser(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canDeleteUser(user: User): boolean {
    return hasAnyRole(user, ['sub_admin']);
}

export function canResetPassword(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

// ==========================================
// REPORT PERMISSIONS
// ==========================================

export function canViewReports(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod', 'manager']);
}

export function canExportReports(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr', 'hod', 'manager']);
}

export function canViewFinancialReports(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

// ==========================================
// SETTINGS PERMISSIONS
// ==========================================

export function canViewSettings(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

export function canEditSettings(user: User): boolean {
    return hasAnyRole(user, ['sub_admin', 'hr']);
}

// ==========================================
// FEATURE CONTROL OVERRIDE
// ==========================================

/**
 * Check if user has access to a specific feature
 * Respects user-specific featureControl overrides
 */
export function hasFeatureAccess(user: User, featureCode: string): boolean {
    // If user has featureControl array, check if feature is included
    if (user.featureControl && Array.isArray(user.featureControl)) {
        return user.featureControl.includes(featureCode);
    }
    // Default: allow access (will be controlled by role-based permissions)
    return true;
}

// ==========================================
// DATA SCOPE HELPERS
// ==========================================

export function canViewAllData(user: User): boolean {
    return user.dataScope === 'all' || hasAnyRole(user, ['sub_admin']);
}

export function canViewDepartmentData(user: User): boolean {
    return user.dataScope === 'department' || hasAnyRole(user, ['hr', 'hod']);
}

export function canViewDivisionData(user: User): boolean {
    return user.dataScope === 'division';
}

export function canViewOwnDataOnly(user: User): boolean {
    return user.dataScope === 'own' || user.role === 'employee';
}
