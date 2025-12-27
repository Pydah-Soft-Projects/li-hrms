'use client';

import { useSidebar } from '@/contexts/SidebarContext';
import { ReactNode } from 'react';

interface MainContentProps {
  children: ReactNode;
}

export default function MainContent({ children }: MainContentProps) {
  const { isCollapsed } = useSidebar();

  return (
    <main
      className={`flex-1 min-w-0 transition-all duration-300 ease-in-out bg-slate-50/50 dark:bg-transparent ml-0 ${isCollapsed ? 'sm:ml-[60px]' : 'sm:ml-[220px]'
        }`}
    >
      <div className="p-4 sm:p-5 lg:p-6">
        {children}
      </div>
    </main>
  );
}

