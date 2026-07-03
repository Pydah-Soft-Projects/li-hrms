'use client';

import { useMemo, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSidebar } from '@/contexts/SidebarContext';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { MODULE_CATEGORIES, isModuleEnabled } from '@/config/moduleCategories';
import {
  WORKSPACE_NAV_CATEGORIES,
  getSidebarPermissionCode,
  isWorkspacePathActive,
  type SidebarNavCategory,
} from '@/config/sidebarNav';
import { CompanyBrandMark } from '@/components/CompanyBrandMark';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import {
  LedgerSidebarShell,
  LedgerSidebarMenu,
  LedgerSidebarUserCard,
} from '@/components/ledger/LedgerSidebar';

export default function WorkspaceSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [user, setUser] = useState<{
    name: string;
    email: string;
    role: string;
    emp_no?: string;
    featureControl?: string[] | null;
  } | null>(null);
  const { profile: companyProfile } = useCompanyProfile();
  const [featureControl, setFeatureControl] = useState<string[] | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const userData = auth.getUser();
    if (userData) {
      setUser({
        name: userData.name,
        email: userData.email,
        role: userData.role,
        emp_no: userData.emp_no,
        featureControl: userData.featureControl || null,
      });
    }
  }, []);

  useEffect(() => {
    const fetchFeatureControl = async () => {
      if (!user?.role) return;

      if (user.featureControl && Array.isArray(user.featureControl) && user.featureControl.length > 0) {
        setFeatureControl(user.featureControl);
        return;
      }

      try {
        const response = await api.getSetting(`feature_control_${user.role}`);
        if (response.success && response.data?.value && Array.isArray(response.data.value.activeModules)) {
          setFeatureControl(response.data.value.activeModules);
          return;
        }
      } catch (error) {
        console.error('Error fetching RBAC settings:', error);
      }

      const managementRoles = ['manager', 'hr', 'hod'];
      if (managementRoles.includes(user.role)) {
        setFeatureControl(MODULE_CATEGORIES.flatMap((c) => c.modules.map((m) => m.code)));
      } else {
        setFeatureControl(['DASHBOARD', 'LEAVE_OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS']);
      }
    };
    fetchFeatureControl();
  }, [user?.role, user?.featureControl]);

  const navCategories = useMemo((): SidebarNavCategory[] => {
    return WORKSPACE_NAV_CATEGORIES.map((category) => ({
      ...category,
      items: category.items.filter((item) =>
        isModuleEnabled(getSidebarPermissionCode(item.code), featureControl),
      ),
    })).filter((category) => category.items.length > 0);
  }, [featureControl]);

  const handleLogout = async () => {
    if (!(await auth.logoutWithConfirmation())) return;
    router.push('/login');
  };

  if (!mounted) return null;

  const navCollapsed = isCollapsed && !isMobileOpen;

  return (
    <LedgerSidebarShell
      isCollapsed={isCollapsed}
      isMobileOpen={isMobileOpen}
      onToggleCollapse={toggleSidebar}
      onMobileOpen={() => setIsMobileOpen(true)}
      onMobileClose={() => setIsMobileOpen(false)}
      header={
        <CompanyBrandMark
          profile={companyProfile}
          collapsed={navCollapsed}
        />
      }
      footer={
        <LedgerSidebarUserCard
          profileHref="/profile"
          name={user?.name || 'User'}
          subtitle={user?.role?.replace(/_/g, ' ') || '...'}
          collapsed={navCollapsed}
          onNavigate={() => setIsMobileOpen(false)}
          onLogout={handleLogout}
        />
      }
    >
      <LedgerSidebarMenu
        categories={navCategories}
        pathname={pathname}
        collapsed={navCollapsed}
        onNavigate={() => setIsMobileOpen(false)}
        isItemActive={(item) => isWorkspacePathActive(item.code, item.href, pathname)}
      />
    </LedgerSidebarShell>
  );
}
