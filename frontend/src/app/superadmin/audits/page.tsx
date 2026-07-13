'use client';

import { useState } from 'react';
import { ShieldCheck, ClipboardList } from 'lucide-react';
import AttendanceAuditPage from '@/components/attendance/AttendanceAuditPage';
import dynamic from 'next/dynamic';

const ODAuditTab = dynamic(() => import('@/components/audits/ODAuditTab'), { ssr: false });

const TABS = [
  { id: 'attendance', label: 'Attendance Audit', icon: ShieldCheck, activeBg: 'bg-emerald-600' },
  { id: 'od', label: 'OD Audit', icon: ClipboardList, activeBg: 'bg-emerald-600' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function AuditsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('attendance');

  return (
    <div className="w-full min-h-screen bg-[#f4f6f9] dark:bg-[#09090b]">
      {/* Page header + tabs — same shell as Reports, transparent background */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">Audits</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Attendance vs pay register and on-duty records — approval chain, workflow history &amp; status breakdown
            </p>
          </div>

          {/* Slider-style tab switcher */}
          <div className="relative flex items-center p-1 rounded-xl bg-zinc-200/60 dark:bg-zinc-800/40 w-[360px] sm:w-[400px] h-[48px] shrink-0">
            {/* Sliding Pill */}
            <div className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-emerald-600 shadow-md transition-transform duration-300 ease-out ${activeTab === 'od' ? 'translate-x-full' : 'translate-x-0'}`} />
            
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative z-10 w-1/2 h-full flex items-center justify-center gap-2.5 text-sm font-bold transition-colors duration-300 whitespace-nowrap focus:outline-none ${
                    isActive
                      ? 'text-white'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Filters render target in its own row below tabs to prevent overlapping */}
        <div id="audit-header-filters" className="w-full max-w-full overflow-x-auto no-scrollbar mt-4" />
      </div>

      {/* Tab content — Keep both tabs mounted and toggle display to cache data & states */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-5 pb-24">
        <div className={activeTab === 'attendance' ? '' : 'hidden'}>
          <AttendanceAuditPage hideTitle embedded active={activeTab === 'attendance'} />
        </div>
        <div className={activeTab === 'od' ? '' : 'hidden'}>
          <ODAuditTab active={activeTab === 'od'} />
        </div>
      </div>
    </div>
  );
}
