'use client';

import { useSidebar } from '@/contexts/SidebarContext';
import { ReactNode } from 'react';
import TopHeader from './TopHeader';

interface MainContentProps {
  children: ReactNode;
  className?: string;
}

export default function MainContent({ children, className }: MainContentProps) {
  const { isCollapsed } = useSidebar();

  return (
    <main
      className={`flex-1 min-w-0 transition-all duration-300 ease-in-out bg-slate-50/50 dark:bg-transparent ml-0 ${isCollapsed ? 'sm:ml-[70px]' : 'sm:ml-[240px]'
        } ${className || ''}`}
    >
      <TopHeader />
      <div className="w-full max-w-full p-4 sm:p-5 lg:p-6">
        {children}
      </div>
    </main>
  );
}

