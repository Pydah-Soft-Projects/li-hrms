'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import PayrollTransactionsTab from './payroll-transactions-tab';
import AttendanceReportsTab from './attendance-reports-tab';
import ThumbReportsTab from './thumb-reports-tab';
import LeaveReportsTab from './leave-reports-tab';
import ODReportsTab from './od-reports-tab';
import LoanReportsTab from './loan-reports-tab';
import CertificationReportsTab from './certification-reports-tab';
import DeductionsReportsTab from './deductions-reports-tab';
import ResignationReportsTab from './resignation-reports-tab';
import ComplaintsReportsTab from './complaints-reports-tab';
import { auth } from '@/lib/auth';
import { canViewReports, canViewFinancialReports, canViewResignation } from '@/lib/permissions';
import { BarChart2, Fingerprint, CreditCard, Lock, FileText, Briefcase, Wallet, Banknote, TrendingDown, GraduationCap, LogOut, AlertTriangle } from 'lucide-react';

type TabType = 'payroll' | 'attendance' | 'biometric' | 'leaves' | 'od' | 'loans' | 'salary_advance' | 'deductions' | 'certifications' | 'resignations' | 'complaints';

const TAB_CONFIG = {
  payroll: { label: 'Payroll', icon: CreditCard, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-500', activeBg: 'bg-violet-600' },
  deductions: { label: 'Deductions', icon: TrendingDown, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-500', activeBg: 'bg-red-600' },
  attendance: { label: 'Attendance', icon: BarChart2, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-500', activeBg: 'bg-indigo-600' },
  biometric: { label: 'Biometric', icon: Fingerprint, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-500', activeBg: 'bg-emerald-600' },
  leaves: { label: 'Leaves', icon: FileText, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-500', activeBg: 'bg-blue-600' },
  od: { label: 'OD', icon: Briefcase, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-500', activeBg: 'bg-amber-600' },
  loans: { label: 'Loans', icon: Wallet, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-500', activeBg: 'bg-rose-600' },
  salary_advance: { label: 'Salary Advance', icon: Banknote, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-500', activeBg: 'bg-amber-600' },
  certifications: { label: 'Certifications', icon: GraduationCap, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-500', activeBg: 'bg-violet-600' },
  resignations: { label: 'Resignations', icon: LogOut, color: 'text-slate-800 dark:text-slate-200', bg: 'bg-slate-50 dark:bg-slate-800/30', border: 'border-slate-400', activeBg: 'bg-slate-800' },
  complaints: { label: 'Complaints', icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-500', activeBg: 'bg-orange-600' },
};

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get('tab') as TabType) || 'attendance';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Sync URL when tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    router.replace(`?tab=${tab}`, { scroll: false });
  };

  // If URL param changes externally, sync state
  useEffect(() => {
    const t = searchParams.get('tab') as TabType;
    if (t && t !== activeTab) setActiveTab(t);
  }, [searchParams]);

  const user = auth.getUser();
  const hasReportsAccess = user ? canViewReports(user as any) : false;
  const hasFinancialAccess = user ? canViewFinancialReports(user as any) : false;
  const hasResignationAccess = user ? canViewResignation(user as any) : false;

  if (!hasReportsAccess) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-slate-400 mb-3" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access Restricted</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">You do not have permission to view reports.</p>
        </div>
      </div>
    );
  }

  const tabs: TabType[] = [];
  if (hasFinancialAccess) tabs.push('payroll', 'deductions', 'loans', 'salary_advance');
  tabs.push('attendance', 'biometric', 'leaves', 'od', 'certifications');
  if (hasResignationAccess) tabs.push('resignations');
  if (['hr', 'sub_admin', 'super_admin', 'hod'].includes(user?.role || '')) tabs.push('complaints');

  const currentTab: TabType = tabs.includes(activeTab) ? activeTab : tabs[0];

  return (
    <div className="w-full min-h-screen bg-slate-50/50 dark:bg-transparent">
      {/* Page Header */}
      <div className="px-0 py-4 bg-transparent">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Reports & Analytics</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Attendance, payroll, and biometric data consolidated</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-4 w-full select-none bg-slate-100/80 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/40">
          {tabs.map((tabId) => {
            const cfg = TAB_CONFIG[tabId];
            const isActive = currentTab === tabId;
            return (
              <button
                key={tabId}
                onClick={() => handleTabChange(tabId)}
                className={`relative flex-1 flex items-center justify-center px-0.5 py-1.5 rounded-lg text-[8.5px] sm:text-[10px] font-bold transition-all duration-200 whitespace-nowrap ${isActive
                  ? `${cfg.activeBg} text-white shadow-sm scale-[1.01]`
                  : `text-slate-500 hover:${cfg.bg} hover:${cfg.color} dark:text-slate-400`
                  }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-0 py-5">
        {currentTab === 'payroll' && <PayrollTransactionsTab />}
        {currentTab === 'deductions' && <DeductionsReportsTab />}
        {currentTab === 'attendance' && <AttendanceReportsTab />}
        {currentTab === 'biometric' && <ThumbReportsTab />}
        {currentTab === 'leaves' && <LeaveReportsTab />}
        {currentTab === 'od' && <ODReportsTab />}
        {currentTab === 'loans' && <LoanReportsTab defaultRequestType="loan" />}
        {currentTab === 'salary_advance' && <LoanReportsTab defaultRequestType="salary_advance" />}
        {currentTab === 'certifications' && <CertificationReportsTab />}
        {currentTab === 'resignations' && <ResignationReportsTab />}
        {currentTab === 'complaints' && <ComplaintsReportsTab />}
      </div>
    </div>
  );
}

