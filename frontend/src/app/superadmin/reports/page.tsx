'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import PayrollTransactionsTab from './payroll-transactions-tab';
import AttendanceReportsTab from '../../(workspace)/reports/attendance-reports-tab';
import ThumbReportsTab from '../../(workspace)/reports/thumb-reports-tab';
import LeaveReportsTab from '../../(workspace)/reports/leave-reports-tab';
import ODReportsTab from '../../(workspace)/reports/od-reports-tab';
import LoanReportsTab from '../../(workspace)/reports/loan-reports-tab';
import CertificationReportsTab from '../../(workspace)/reports/certification-reports-tab';
import DeductionsReportsTab from '../../(workspace)/reports/deductions-reports-tab';
import MobileAnalyticsTab from '../../(workspace)/reports/mobile-analytics-tab';
import ResignationReportsTab from '../../(workspace)/reports/resignation-reports-tab';
import ComplaintsReportsTab from '../../(workspace)/reports/complaints-reports-tab';
import { BarChart2, Fingerprint, CreditCard, FileText, Briefcase, Wallet, Banknote, Smartphone, TrendingDown, GraduationCap, LogOut, AlertTriangle } from 'lucide-react';

type TabType = 'payroll' | 'deductions' | 'attendance' | 'biometric' | 'leaves' | 'od' | 'loans' | 'salary_advance' | 'mobile_app' | 'certifications' | 'resignations' | 'complaints';

const TAB_CONFIG = {
  payroll: { label: 'Payroll', icon: CreditCard, activeBg: 'bg-violet-600' },
  deductions: { label: 'Deductions', icon: TrendingDown, activeBg: 'bg-red-600' },
  attendance: { label: 'Attendance', icon: BarChart2, activeBg: 'bg-indigo-600' },
  biometric: { label: 'Biometric', icon: Fingerprint, activeBg: 'bg-emerald-600' },
  leaves: { label: 'Leaves', icon: FileText, activeBg: 'bg-blue-600' },
  od: { label: 'OD', icon: Briefcase, activeBg: 'bg-amber-600' },
  loans: { label: 'Loans', icon: Wallet, activeBg: 'bg-rose-600' },
  salary_advance: { label: 'Salary Advance', icon: Banknote, activeBg: 'bg-amber-600' },
  mobile_app: { label: 'Mobile App', icon: Smartphone, activeBg: 'bg-cyan-600' },
  certifications: { label: 'Certifications', icon: GraduationCap, activeBg: 'bg-violet-600' },
  resignations: { label: 'Resignations', icon: LogOut, activeBg: 'bg-slate-800' },
  complaints: { label: 'Complaints', icon: AlertTriangle, activeBg: 'bg-orange-600' },
};

const ALL_TABS: TabType[] = ['payroll', 'deductions', 'attendance', 'biometric', 'leaves', 'od', 'loans', 'salary_advance', 'certifications', 'resignations', 'mobile_app', 'complaints'];

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get('tab') as TabType) || 'attendance';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    router.replace(`?tab=${tab}`, { scroll: false });
  };

  useEffect(() => {
    const t = searchParams.get('tab') as TabType;
    if (t && t !== activeTab) setActiveTab(t);
  }, [searchParams]);

  return (
    <div className="w-full min-h-screen bg-slate-50/50 dark:bg-transparent">
      {/* Page Header */}
      <div className="px-0 py-4 bg-transparent">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Reports & Analytics</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Attendance, payroll, and biometric data consolidated</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-4 w-full select-none bg-slate-200/50 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/40">
          {ALL_TABS.map((tabId) => {
            const cfg = TAB_CONFIG[tabId];
            const isActive = activeTab === tabId;
            return (
              <button
                key={tabId}
                onClick={() => handleTabChange(tabId)}
                className={`relative flex-1 flex items-center justify-center px-0.5 py-1.5 rounded-lg text-[8.5px] sm:text-[10px] font-bold transition-all duration-200 whitespace-nowrap ${isActive
                  ? `${cfg.activeBg} text-white shadow-sm scale-[1.01]`
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-805'
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
        {activeTab === 'payroll' && <PayrollTransactionsTab />}
        {activeTab === 'deductions' && <DeductionsReportsTab />}
        {activeTab === 'attendance' && <AttendanceReportsTab />}
        {activeTab === 'biometric' && <ThumbReportsTab />}
        {activeTab === 'leaves' && <LeaveReportsTab />}
        {activeTab === 'od' && <ODReportsTab />}
        {activeTab === 'loans' && <LoanReportsTab defaultRequestType="loan" />}
        {activeTab === 'salary_advance' && <LoanReportsTab defaultRequestType="salary_advance" />}
        {activeTab === 'certifications' && <CertificationReportsTab />}
        {activeTab === 'resignations' && <ResignationReportsTab />}
        {activeTab === 'mobile_app' && <MobileAnalyticsTab />}
        {activeTab === 'complaints' && <ComplaintsReportsTab />}
      </div>
    </div>
  );
}

