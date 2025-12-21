import { ReactNode } from 'react';
import { useRoleAccess } from '@/hooks/useRoleAccess';

interface RoleGuardProps {
    children: ReactNode;
    allowedRoles?: string[];
    requireAll?: boolean;
    fallback?: ReactNode;
}

/**
 * RoleGuard Component
 * Conditionally renders children based on user role
 * 
 * @example
 * <RoleGuard allowedRoles={['super_admin', 'hr']}>
 *   <button>Create Employee</button>
 * </RoleGuard>
 */
export const RoleGuard: React.FC<RoleGuardProps> = ({
    children,
    allowedRoles = [],
    requireAll = false,
    fallback = null,
}) => {
    const { isEmployee, isHOD, isHR, isSuperAdmin, isSubAdmin } = useRoleAccess();

    const roleMap: Record<string, boolean> = {
        employee: isEmployee,
        hod: isHOD,
        hr: isHR,
        super_admin: isSuperAdmin,
        sub_admin: isSubAdmin,
    };

    const hasAccess = requireAll
        ? allowedRoles.every(role => roleMap[role])
        : allowedRoles.some(role => roleMap[role]);

    return hasAccess ? <>{children}</> : <>{fallback}</>;
};
