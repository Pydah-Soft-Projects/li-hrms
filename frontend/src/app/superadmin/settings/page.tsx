'use client';

import React, { useState } from 'react';
import {
  Settings,
  Users,
  Calendar,
  Briefcase,
  Banknote,
  Receipt,
  Clock,
  ShieldCheck,
  MessageSquare,
  LayoutGrid,
  ArrowRight,
  ChevronRight,
  Search,
  Zap,
  Percent,
  AlertTriangle,
  Globe
} from 'lucide-react';

import ShiftSettings from '@/components/settings/ShiftSettings';
import EmployeeSettings from '@/components/settings/EmployeeSettings';
import LeaveSettings from '@/components/settings/LeaveSettings';
import LoanSettings from '@/components/settings/LoanSettings';
import PayrollSettings from '@/components/settings/PayrollSettings';
import AttendanceSettings from '@/components/settings/AttendanceSettings';
import OTSettings from '@/components/settings/OTSettings';
import PermissionsSettings from '@/components/settings/PermissionsSettings';
import CommunicationSettings from '@/components/settings/CommunicationSettings';
import FeatureControlSettings from '@/components/settings/FeatureControlSettings';
import GeneralSettings from '@/components/settings/GeneralSettings';
import AttendanceDeductionsSettings from '@/components/settings/AttendanceDeductionsSettings';

type TabType =
  | 'general'
  | 'employee'
  | 'leave'
  | 'od'
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

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [searchQuery, setSearchQuery] = useState('');

  const menuItems = [
    { id: 'general', label: 'General Settings', icon: Globe, color: 'text-blue-500', group: 'Application' },
    { id: 'communications', label: 'Communication', icon: MessageSquare, color: 'text-purple-500', group: 'Application' },
    { id: 'feature_control', label: 'Feature Control', icon: LayoutGrid, color: 'text-orange-500', group: 'Application' },

    { id: 'employee', label: 'Employee Setup', icon: Users, color: 'text-indigo-500', group: 'Human Resources' },
    { id: 'leave', label: 'Leave Policy', icon: Calendar, color: 'text-emerald-500', group: 'Human Resources' },
    { id: 'od', label: 'On-Duty (OD)', icon: Briefcase, color: 'text-teal-500', group: 'Human Resources' },

    { id: 'shift', label: 'Shift Schedules', icon: Clock, color: 'text-amber-500', group: 'Operations' },
    { id: 'attendance', label: 'Attendance Sync', icon: Zap, color: 'text-yellow-500', group: 'Operations' },
    { id: 'attendance_deductions', label: 'Deduction Rules', icon: AlertTriangle, color: 'text-red-500', group: 'Operations' },
    { id: 'ot', label: 'Overtime (OT)', icon: Percent, color: 'text-rose-500', group: 'Operations' },

    { id: 'payroll', label: 'Payroll & Cycle', icon: Receipt, color: 'text-cyan-500', group: 'Finance' },
    { id: 'loan', label: 'Loan Policies', icon: Banknote, color: 'text-green-500', group: 'Finance' },
    { id: 'salary_advance', label: 'Salary Advance', icon: ShieldCheck, color: 'text-lime-500', group: 'Finance' },

    { id: 'permissions', label: 'Out-Pass Config', icon: ArrowRight, color: 'text-slate-500', group: 'Other' },
  ];

  const filteredMenu = searchQuery
    ? menuItems.filter(item => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : menuItems;

  const groupedMenu = filteredMenu.reduce((acc: any, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const renderActiveSection = () => {
    switch (activeTab) {
      case 'general': return <GeneralSettings />;
      case 'employee': return <EmployeeSettings />;
      case 'leave': return <LeaveSettings type="leave" />;
      case 'od': return <LeaveSettings type="od" />;
      case 'shift': return <ShiftSettings />;
      case 'attendance': return <AttendanceSettings />;
      case 'attendance_deductions': return <AttendanceDeductionsSettings />;
      case 'payroll': return <PayrollSettings />;
      case 'loan': return <LoanSettings type="loan" />;
      case 'salary_advance': return <LoanSettings type="salary_advance" />;
      case 'ot': return <OTSettings />;
      case 'permissions': return <PermissionsSettings />;
      case 'communications': return <CommunicationSettings />;
      case 'feature_control': return <FeatureControlSettings />;
      default: return <GeneralSettings />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      {/* Sidebar Navigation */}
      <aside className="fixed left-0 top-0 hidden h-full w-80 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-[#1E293B] lg:flex">
        <div className="p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/20">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Settings</h1>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Global Configuration</p>
            </div>
          </div>

          <div className="mt-8 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border-none bg-gray-50 px-10 py-2.5 text-xs font-medium placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 dark:bg-[#0F172A] dark:text-white"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-8 space-y-8 custom-scrollbar">
          {Object.entries(groupedMenu).map(([group, items]: [string, any]) => (
            <div key={group} className="space-y-1">
              <h3 className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">{group}</h3>
              {items.map((item: any) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`group flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-all ${activeTab === item.id
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-[#0F172A] dark:hover:text-white'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={`h-4 w-4 ${activeTab === item.id ? item.color : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight className={`h-3 w-3 transition-transform ${activeTab === item.id ? 'translate-x-1 outline-none' : 'opacity-0 group-hover:opacity-100'}`} />
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-xl">
            <p className="text-xs font-bold opacity-80 mb-1">PRO FEATURES</p>
            <p className="text-[10px] leading-tight opacity-60">Modular configuration system v2.0</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 lg:ml-80">
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0F172A]/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm font-medium text-gray-500">
              <span className="dark:text-gray-400">Settings</span>
              <ChevronRight className="h-4 w-4 opacity-50" />
              <span className="text-gray-900 dark:text-white capitalize">{activeTab.replace('_', ' ')}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30 text-[10px] font-bold uppercase tracking-tighter">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live System
              </div>
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {renderActiveSection()}
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E2E8F0;
          border-radius: 10px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
        }
      `}</style>
    </div>
  );
};

export default SettingsPage;
