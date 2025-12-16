'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useWorkspaceSafe, Workspace } from '@/contexts/WorkspaceContext';

// Icons
const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const WorkspaceIcon = ({ type, className }: { type: string; className?: string }) => {
  switch (type) {
    case 'employee':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'department':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case 'hr':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'subadmin':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      );
  }
};

const getWorkspaceColor = (type: string) => {
  switch (type) {
    case 'employee':
      return 'bg-blue-500';
    case 'department':
      return 'bg-purple-500';
    case 'hr':
      return 'bg-green-500';
    case 'subadmin':
      return 'bg-amber-500';
    default:
      return 'bg-slate-500';
  }
};

const getWorkspaceBgColor = (type: string) => {
  switch (type) {
    case 'employee':
      return 'bg-blue-50 dark:bg-blue-900/20';
    case 'department':
      return 'bg-purple-50 dark:bg-purple-900/20';
    case 'hr':
      return 'bg-green-50 dark:bg-green-900/20';
    case 'subadmin':
      return 'bg-amber-50 dark:bg-amber-900/20';
    default:
      return 'bg-slate-50 dark:bg-slate-900/20';
  }
};

interface WorkspaceDropdownProps {
  className?: string;
}

const WorkspaceDropdown: React.FC<WorkspaceDropdownProps> = ({ className }) => {
  const workspaceContext = useWorkspaceSafe();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  // Don't render if no workspace context or no workspaces
  if (!workspaceContext || workspaceContext.workspaces.length === 0) {
    return null;
  }

  const { workspaces, activeWorkspace, switchWorkspace, isLoading } = workspaceContext;

  const handleSwitch = async (workspace: Workspace) => {
    if (workspace._id === activeWorkspace?._id) {
      setIsOpen(false);
      return;
    }

    setIsSwitching(true);
    try {
      await switchWorkspace(workspace._id);
      setIsOpen(false);
      // Optionally reload the page or navigate to workspace default
      // window.location.reload();
    } catch (error) {
      console.error('Failed to switch workspace:', error);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div ref={dropdownRef} className={`relative ${className || ''}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading || isSwitching}
        className={`
          flex items-center gap-2.5 px-3 py-2 rounded-xl
          bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
          hover:border-slate-300 dark:hover:border-slate-600
          transition-all duration-200
          ${isOpen ? 'ring-2 ring-blue-400/30 border-blue-400' : ''}
          ${isLoading || isSwitching ? 'opacity-75 cursor-wait' : 'cursor-pointer'}
        `}
      >
        {activeWorkspace ? (
          <>
            <div className={`w-8 h-8 rounded-lg ${getWorkspaceColor(activeWorkspace.type)} flex items-center justify-center`}>
              <WorkspaceIcon type={activeWorkspace.type} className="w-4 h-4 text-white" />
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-tight">
                {activeWorkspace.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                {activeWorkspace.type} workspace
              </div>
            </div>
          </>
        ) : (
          <span className="text-sm text-slate-500">Select Workspace</span>
        )}
        <ChevronDownIcon
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Switch Workspace
            </div>
          </div>

          {/* Workspace List */}
          <div className="p-2 max-h-80 overflow-y-auto">
            {workspaces.map((workspace) => {
              const isActive = workspace._id === activeWorkspace?._id;
              
              return (
                <button
                  key={workspace._id}
                  onClick={() => handleSwitch(workspace)}
                  disabled={isSwitching}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left
                    transition-all duration-150
                    ${isActive
                      ? `${getWorkspaceBgColor(workspace.type)} border border-slate-200 dark:border-slate-700`
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                    }
                    ${isSwitching ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                  `}
                >
                  <div className={`w-10 h-10 rounded-xl ${getWorkspaceColor(workspace.type)} flex items-center justify-center flex-shrink-0`}>
                    <WorkspaceIcon type={workspace.type} className="w-5 h-5 text-white" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {workspace.name}
                      </span>
                      {workspace.isPrimary && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {workspace.description || `${workspace.type.charAt(0).toUpperCase() + workspace.type.slice(1)} workspace`}
                    </div>
                    {workspace.modules && (
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {workspace.modules.filter(m => m.isEnabled).length} modules
                      </div>
                    )}
                  </div>

                  {isActive && (
                    <div className="flex-shrink-0">
                      <CheckIcon className="w-5 h-5 text-green-500" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Each workspace has its own modules and permissions
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceDropdown;

