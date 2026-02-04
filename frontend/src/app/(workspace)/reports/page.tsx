'use client';

import { useState } from 'react';
import PayrollTransactionsTab from './payroll-transactions-tab';
import { auth } from '@/lib/auth';
import { canViewReports, canViewFinancialReports } from '@/lib/permissions';

type TabType = 'payroll';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('payroll');

  const user = auth.getUser();
  const hasReportsAccess = user ? canViewReports(user as any) : false;
  const hasFinancialAccess = user ? canViewFinancialReports(user as any) : false;

  if (!hasReportsAccess) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Access Denied</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-400">You do not have permission to view reports.</p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [];
  if (hasFinancialAccess) {
    tabs.push({ id: 'payroll', label: 'Payroll Transactions' });
  }

  // If user has access but no tabs are available (e.g. manager with no specific reports yet)
  if (tabs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">No Reports Available</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-400">No reports are currently available for your role.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reports</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          View and analyze various reports and analytics
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'payroll' && <PayrollTransactionsTab />}
      </div>
    </div>
  );
}


