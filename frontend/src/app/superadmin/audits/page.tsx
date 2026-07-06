'use client';

import { useState } from 'react';
import { ShieldCheck, ClipboardList } from 'lucide-react';
import AttendanceAuditPage from '@/components/attendance/AttendanceAuditPage';
import dynamic from 'next/dynamic';

const ODAuditTab = dynamic(() => import('@/components/audits/ODAuditTab'), { ssr: false });

const TABS = [
  { id: 'attendance', label: 'Attendance Audit', icon: ShieldCheck },
  { id: 'od',         label: 'OD Audit',         icon: ClipboardList },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AuditsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('attendance');

  return (
    <div className="w-full max-w-full space-y-6 pb-24">
      {/* Page header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <ShieldCheck className="h-7 w-7 text-indigo-600" />
          Audits
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Attendance &amp; On-Duty records — full approval chain, workflow history &amp; status breakdown
        </p>
      </div>

      {/* Tab bar — indigo underline style */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'attendance' && <AttendanceAuditPage hideTitle />}
        {activeTab === 'od' && <ODAuditTab />}
      </div>
    </div>
  );
}
