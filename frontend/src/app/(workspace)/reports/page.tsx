'use client';

import { useState } from 'react';
import PayrollTransactionsTab from './payroll-transactions-tab';
import AttendanceReportsTab from './attendance-reports-tab';
import ThumbReportsTab from './thumb-reports-tab';
import LeaveReportsTab from './leave-reports-tab';
import ODReportsTab from './od-reports-tab';
import LoanReportsTab from './loan-reports-tab';
import { auth } from '@/lib/auth';
import { canViewReports, canViewFinancialReports } from '@/lib/permissions';
import { BarChart2, Fingerprint, CreditCard, Lock, FileText, Briefcase, Wallet, Banknote } from 'lucide-react';

type TabType = 'payroll' | 'attendance' | 'biometric' | 'leaves' | 'od' | 'loans' | 'salary_advance';

const TAB_CONFIG = {
  payroll: { label: 'Payroll', icon: CreditCard, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-500', activeBg: 'bg-violet-600' },
  attendance: { label: 'Attendance', icon: BarChart2, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-500', activeBg: 'bg-indigo-600' },
  biometric: { label: 'Biometric', icon: Fingerprint, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-500', activeBg: 'bg-emerald-600' },
  leaves: { label: 'Leaves', icon: FileText, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-500', activeBg: 'bg-blue-600' },
  od: { label: 'OD', icon: Briefcase, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-500', activeBg: 'bg-amber-600' },
  loans: { label: 'Loans', icon: Wallet, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-500', activeBg: 'bg-rose-600' },
  salary_advance: { label: 'Salary Advance', icon: Banknote, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-500', activeBg: 'bg-amber-600' },
};

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('attendance');

  const user = auth.getUser();
  const hasReportsAccess = user ? canViewReports(user as any) : false;
  const hasFinancialAccess = user ? canViewFinancialReports(user as any) : false;

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
  if (hasFinancialAccess) tabs.push('payroll', 'loans', 'salary_advance');
  tabs.push('attendance', 'biometric', 'leaves', 'od');

  const currentTab: TabType = tabs.includes(activeTab) ? activeTab : tabs[0];

  return (
    <div className="w-full min-h-screen bg-slate-50/50 dark:bg-transparent">
      {/* Page Header */}
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur px-4 sm:px-6 md:px-8 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Reports & Analytics</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Attendance, payroll, and biometric data consolidated</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto pb-1 no-scrollbar">
          {tabs.map((tabId) => {
            const cfg = TAB_CONFIG[tabId];
            const Icon = cfg.icon;
            const isActive = currentTab === tabId;
            return (
              <button
                key={tabId}
                onClick={() => setActiveTab(tabId)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap ${isActive
                    ? `${cfg.activeBg} text-white shadow-md scale-[1.02]`
                    : `text-slate-500 hover:${cfg.bg} hover:${cfg.color} dark:text-slate-400`
                  }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : ''}`} />
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 sm:px-6 md:px-8 py-5">
        {currentTab === 'payroll' && <PayrollTransactionsTab />}
        {currentTab === 'attendance' && <AttendanceReportsTab />}
        {currentTab === 'biometric' && <ThumbReportsTab />}
        {currentTab === 'leaves' && <LeaveReportsTab />}
        {currentTab === 'od' && <ODReportsTab />}
        {currentTab === 'loans' && <LoanReportsTab defaultRequestType="loan" />}
        {currentTab === 'salary_advance' && <LoanReportsTab defaultRequestType="salary_advance" />}
      </div>
    </div>
  );
}

