'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Award,
  Banknote,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  Globe,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Percent,
  Receipt,
  ShieldCheck,
  Users,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import ShiftSettings from '@/components/settings/ShiftSettings';
import EmployeeSettings from '@/components/settings/EmployeeSettings';
import LeaveSettings from '@/components/settings/LeaveSettings';
import LeavePolicySettings from '@/components/settings/LeavePolicySettings';
import LoanSettings from '@/components/settings/LoanSettings';
import PayrollSettings from '@/components/settings/PayrollSettings';
import AttendanceSettings from '@/components/settings/AttendanceSettings';
import OTSettings from '@/components/settings/OTSettings';
import PermissionsSettings from '@/components/settings/PermissionsSettings';
import CommunicationSettings from '@/components/settings/CommunicationSettings';
import FeatureControlSettings from '@/components/settings/FeatureControlSettings';
import GeneralSettings from '@/components/settings/GeneralSettings';
import CompanySettings from '@/components/settings/CompanySettings';
import AttendanceDeductionsSettings from '@/components/settings/AttendanceDeductionsSettings';
import ResignationSettings from '@/components/settings/ResignationSettings';
import PromotionTransferSettings from '@/components/settings/PromotionTransferSettings';
import { SettingsHubFooter, SettingsHubLayout } from '@/components/settings/SettingsPageShell';

export type SettingsTabType =
  | 'general'
  | 'company'
  | 'employee'
  | 'leave'
  | 'leave_policy'
  | 'od'
  | 'ccl'
  | 'resignation'
  | 'promotions_transfers'
  | 'shift'
  | 'attendance'
  | 'attendance_deductions'
  | 'payroll'
  | 'loan'
  | 'salary_advance'
  | 'ot'
  | 'permissions'
  | 'communications'
  | 'feature_control';

const VALID_TABS: SettingsTabType[] = [
  'general',
  'company',
  'employee',
  'leave',
  'leave_policy',
  'od',
  'ccl',
  'resignation',
  'promotions_transfers',
  'shift',
  'attendance',
  'attendance_deductions',
  'payroll',
  'loan',
  'salary_advance',
  'ot',
  'permissions',
  'communications',
  'feature_control',
];

const MENU_ITEMS = [
  { id: 'general', label: 'General Settings', icon: Globe, color: 'text-sky-500', group: 'Application' },
  { id: 'company', label: 'Company & Brand', icon: Building2, color: 'text-teal-500', group: 'Application' },
  { id: 'communications', label: 'Communication', icon: MessageSquare, color: 'text-violet-500', group: 'Application' },
  { id: 'feature_control', label: 'Feature Control', icon: LayoutGrid, color: 'text-amber-500', group: 'Application' },
  { id: 'employee', label: 'Employee Setup', icon: Users, color: 'text-indigo-500', group: 'Human Resources' },
  { id: 'leave', label: 'Leave Settings', icon: Calendar, color: 'text-emerald-500', group: 'Human Resources' },
  { id: 'leave_policy', label: 'Leave Policy', icon: Briefcase, color: 'text-teal-500', group: 'Human Resources' },
  { id: 'od', label: 'On-Duty (OD)', icon: Briefcase, color: 'text-teal-500', group: 'Human Resources' },
  { id: 'ccl', label: 'Comp. Casual Leave (CCL)', icon: Zap, color: 'text-amber-500', group: 'Human Resources' },
  { id: 'resignation', label: 'Resignation Policy', icon: LogOut, color: 'text-orange-500', group: 'Human Resources' },
  { id: 'promotions_transfers', label: 'Promotions & Transfers', icon: Award, color: 'text-violet-500', group: 'Human Resources' },
  { id: 'shift', label: 'Shift Schedules', icon: Clock, color: 'text-amber-500', group: 'Operations' },
  { id: 'attendance', label: 'Attendance Sync', icon: Zap, color: 'text-yellow-500', group: 'Operations' },
  { id: 'attendance_deductions', label: 'Deduction Rules', icon: AlertTriangle, color: 'text-rose-500', group: 'Operations' },
  { id: 'ot', label: 'Overtime (OT)', icon: Percent, color: 'text-rose-500', group: 'Operations' },
  { id: 'payroll', label: 'Payroll & Cycle', icon: Receipt, color: 'text-cyan-500', group: 'Finance' },
  { id: 'loan', label: 'Loan Policies', icon: Banknote, color: 'text-green-500', group: 'Finance' },
  { id: 'salary_advance', label: 'Salary Advance', icon: ShieldCheck, color: 'text-lime-500', group: 'Finance' },
  { id: 'permissions', label: 'Permission Config', icon: ArrowRight, color: 'text-stone-500', group: 'Other' },
];

export default function SettingsHubClient() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTabType>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const raw = searchParams.get('tab');
    const t = raw === 'promotions-transfers' ? 'promotions_transfers' : raw;
    if (t && VALID_TABS.includes(t as SettingsTabType)) {
      setActiveTab(t as SettingsTabType);
    }
  }, [searchParams]);

  const selectTab = (id: string) => {
    const tab = id as SettingsTabType;
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
    if (tab === 'general') {
      router.replace(pathname, { scroll: false });
    } else {
      router.replace(`${pathname}?tab=${tab}`, { scroll: false });
    }
  };

  const groupedMenu = useMemo(() => {
    const filtered = searchQuery
      ? MENU_ITEMS.filter((item) => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
      : MENU_ITEMS;
    return filtered.reduce(
      (acc, item) => {
        if (!acc[item.group]) acc[item.group] = [];
        acc[item.group].push(item);
        return acc;
      },
      {} as Record<string, typeof MENU_ITEMS>
    );
  }, [searchQuery]);

  const renderActiveSection = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />;
      case 'company':
        return <CompanySettings />;
      case 'employee':
        return <EmployeeSettings />;
      case 'leave':
        return <LeaveSettings type="leave" />;
      case 'leave_policy':
        return <LeavePolicySettings />;
      case 'od':
        return <LeaveSettings type="od" />;
      case 'ccl':
        return <LeaveSettings type="ccl" />;
      case 'resignation':
        return <ResignationSettings />;
      case 'promotions_transfers':
        return <PromotionTransferSettings />;
      case 'shift':
        return <ShiftSettings />;
      case 'attendance':
        return <AttendanceSettings />;
      case 'attendance_deductions':
        return <AttendanceDeductionsSettings />;
      case 'payroll':
        return <PayrollSettings />;
      case 'loan':
        return <LoanSettings type="loan" />;
      case 'salary_advance':
        return <LoanSettings type="salary_advance" />;
      case 'ot':
        return <OTSettings />;
      case 'permissions':
        return <PermissionsSettings />;
      case 'communications':
        return <CommunicationSettings />;
      case 'feature_control':
        return <FeatureControlSettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <SettingsHubLayout
      title="Admin settings"
      subtitle="Global configuration"
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      navGroups={groupedMenu}
      activeId={activeTab}
      onSelect={selectTab}
      mobileMenuOpen={isMobileMenuOpen}
      onMobileMenuToggle={() => setIsMobileMenuOpen((v) => !v)}
      footer={<SettingsHubFooter />}
    >
      {renderActiveSection()}
    </SettingsHubLayout>
  );
}
