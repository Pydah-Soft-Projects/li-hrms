'use client';

import { useState } from 'react';
import { ShieldCheck, ClipboardList } from 'lucide-react';
import AttendanceAuditPage from '@/components/attendance/AttendanceAuditPage';
import dynamic from 'next/dynamic';

const ODAuditTab = dynamic(() => import('@/components/audits/ODAuditTab'), { ssr: false });

const TABS = [
  { id: 'attendance', label: 'Attendance Audit', icon: ShieldCheck, activeBg: 'bg-indigo-600' },
  { id: 'od', label: 'OD Audit', icon: ClipboardList, activeBg: 'bg-amber-600' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AuditsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('attendance');

  return (
    <div className="w-full min-h-screen bg-slate-50/50 dark:bg-transparent">
      {/* Page header + tabs — same shell as Reports */}
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur px-4 sm:px-6 md:px-8 py-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Audits</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Attendance vs pay register and on-duty records — approval chain, workflow history &amp; status breakdown
          </p>
        </div>

        <div className="flex items-center gap-1 mt-4 overflow-x-auto pb-1 no-scrollbar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? `${tab.activeBg} text-white shadow-md scale-[1.02]`
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 sm:px-6 md:px-8 py-5 pb-24">
        {activeTab === 'attendance' && <AttendanceAuditPage hideTitle embedded />}
        {activeTab === 'od' && <ODAuditTab />}
      </div>
    </div>
  );
}
