'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useSidebar } from '@/contexts/SidebarContext';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import { isModuleEnabled } from '@/config/moduleCategories';
import { User } from '@/lib/auth';
import { CompanyBrandMark } from '@/components/CompanyBrandMark';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import {
  LedgerSidebarShell,
  LedgerSidebarMenu,
  LedgerSidebarUserCard,
} from '@/components/ledger/LedgerSidebar';
import {
  SUPERADMIN_NAV_CATEGORIES,
  getSidebarPermissionCode,
  isSidebarPathActive,
  type SidebarNavCategory,
} from '@/config/sidebarNav';

export default function Sidebar() {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const { profile: companyProfile } = useCompanyProfile();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [secondSalaryNavEnabled, setSecondSalaryNavEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const userData = auth.getUser();
    if (userData) setUser(userData);
  }, []);

  useEffect(() => {
    if (user?.role !== 'super_admin' && user?.role !== 'sub_admin') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getSetting('enable_second_salary');
        if (cancelled) return;
        setSecondSalaryNavEnabled(res?.success && res?.data ? res.data.value !== false : true);
      } catch {
        if (!cancelled) setSecondSalaryNavEnabled(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.role]);

  const isAdmin = user?.role === 'super_admin' || user?.role === 'sub_admin';
  const featureControl = user?.featureControl || null;

  const navCategories = useMemo((): SidebarNavCategory[] => {
    return SUPERADMIN_NAV_CATEGORIES.map((category) => ({
      ...category,
      items: category.items.filter((item) => {
        if (item.feature === 'second_salary' && isAdmin && !secondSalaryNavEnabled) return false;
        if (isAdmin) return true;
        return isModuleEnabled(getSidebarPermissionCode(item.code), featureControl);
      }),
    })).filter((category) => category.items.length > 0);
  }, [isAdmin, secondSalaryNavEnabled, featureControl]);

  if (!mounted) return null;

  const handleLogout = async () => {
    if (!(await auth.logoutWithConfirmation())) return;
    router.push('/login');
  };

  const getRoleLabel = (role: string) => {
    const roleLabels: Record<string, string> = {
      super_admin: 'Super Admin',
      sub_admin: 'Sub Admin',
      hr: 'HR',
      manager: 'Manager',
      hod: 'HOD',
      employee: 'Employee',
    };
    return roleLabels[role] || role;
  };

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
          profileHref="/superadmin/profile"
          name={user?.name || 'User'}
          subtitle={user ? getRoleLabel(user.role) : '...'}
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
        isItemActive={(item) => isSidebarPathActive(item.href, pathname)}
      />
    </LedgerSidebarShell>
  );
}
