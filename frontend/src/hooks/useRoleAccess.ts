import { useAuth } from '@/context/AuthContext';

export interface RoleAccess {
    // View permissions
    canViewAll: boolean;
    canViewDepartment: boolean;
    canViewOwn: boolean;

    // Action permissions
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;

    // Scope
    scope: 'own' | 'department' | 'scoped' | 'all';

    // Role checks
    isEmployee: boolean;
    isHOD: boolean;
    isHR: boolean;
    isSuperAdmin: boolean;
    isSubAdmin: boolean;

    // Department/Scope info
    department?: string;
    departments?: string[];
    scopeType?: 'global' | 'restricted';
}

/**
 * Hook to get role-based access permissions
 * Use this in components to conditionally render UI elements
 */
export const useRoleAccess = (): RoleAccess => {
    const { user } = useAuth();

    if (!user) {
        return {
            canViewAll: false,
            canViewDepartment: false,
            canViewOwn: true,
            canCreate: false,
            canEdit: false,
            canDelete: false,
            canApprove: false,
            scope: 'own',
            isEmployee: false,
            isHOD: false,
            isHR: false,
            isSuperAdmin: false,
            isSubAdmin: false,
        };
    }

    const role = user.role;
    const isEmployee = role === 'employee';
    const isHOD = role === 'hod';
    const isHR = role === 'hr';
    const isSuperAdmin = role === 'super_admin';
    const isSubAdmin = role === 'sub_admin';

    return {
        // View permissions
        canViewAll: isSuperAdmin || (isHR && user.scope === 'global') || isSubAdmin,
        canViewDepartment: isHOD || isHR,
        canViewOwn: true,

        // Action permissions
        canCreate: isSuperAdmin || isHR || isSubAdmin,
        canEdit: isSuperAdmin || isHR || isSubAdmin,
        canDelete: isSuperAdmin,
        canApprove: isSuperAdmin || isHR || isHOD,

        // Scope
        scope: isEmployee ? 'own'
            : isHOD ? 'department'
                : (isHR && user.scope === 'restricted') ? 'scoped'
                    : 'all',

        // Role checks
        isEmployee,
        isHOD,
        isHR,
        isSuperAdmin,
        isSubAdmin,

        // Department/Scope info
        department: user.department?._id || user.department,
        departments: user.departments?.map((d: any) => d._id || d),
        scopeType: user.scope,
    };
};
