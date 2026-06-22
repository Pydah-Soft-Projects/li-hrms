'use client';

import { useState } from 'react';
import MobileAnalyticsTab from '../../(workspace)/reports/mobile-analytics-tab';
import { Smartphone } from 'lucide-react';

export default function MobileAnalyticsPage() {
  return (
    <div className="w-full min-h-screen bg-slate-50/50 dark:bg-transparent">
      {/* Page Header */}
      <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur px-4 sm:px-6 md:px-8 py-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Smartphone className="h-6 w-6 text-cyan-600" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Mobile App Usage Analytics
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track daily active users, session duration, and login frequency across your mobile app
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 md:px-8 py-5">
        <MobileAnalyticsTab />
      </div>
    </div>
  );
}
