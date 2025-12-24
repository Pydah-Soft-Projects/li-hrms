'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';

// Types
export interface ModulePermissions {
  canView?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canApprove?: boolean;
  canForward?: boolean;
  canExport?: boolean;
}

export interface WorkspaceModule {
  moduleId: {
    _id: string;
    name: string;
    code: string;
    icon: string;
    route: string;
  };
  moduleCode: string;
  permissions: ModulePermissions;
  dataScope: 'own' | 'department' | 'assigned' | 'all';
  settings?: {
    editableStatuses?: string[];
    visibleColumns?: string[];
    allowedActions?: string[];
    workflowActions?: Record<string, string[]>;
    custom?: any;
  };
  isEnabled: boolean;
  sortOrder: number;
}

export interface Workspace {
  _id: string;
  name: string;
  code: string;
  type: 'employee' | 'department' | 'hr' | 'subadmin' | 'superadmin' | 'custom';
  description?: string;
  theme?: {
    primaryColor?: string;
    icon?: string;
    layout?: string;
  };
  modules: WorkspaceModule[];
  defaultModuleCode?: string;
  role?: string;
  isPrimary?: boolean;
  scopeConfig?: {
    departments?: string[];
    allDepartments?: boolean;
  };
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  hasPermission: (moduleCode: string, permission: keyof ModulePermissions) => boolean;
  getModuleConfig: (moduleCode: string) => WorkspaceModule | null;
  getAvailableModules: () => WorkspaceModule[];
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

// Safe hook that doesn't throw
export const useWorkspaceSafe = () => {
  return useContext(WorkspaceContext);
};

interface WorkspaceProviderProps {
  children: ReactNode;
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simplified: Load workspace from localStorage or create a default one
  useEffect(() => {
    const storedActiveWorkspace = localStorage.getItem('hrms_active_workspace');

    if (storedActiveWorkspace) {
      try {
        const workspace = JSON.parse(storedActiveWorkspace);
        setActiveWorkspace(workspace);
        setWorkspaces([workspace]); // Single workspace array
      } catch (e) {
        console.error('Failed to parse stored active workspace:', e);
      }
    }

    setIsLoading(false);
  }, []);

  // Save to localStorage when workspaces change
  useEffect(() => {
    if (workspaces.length > 0) {
      localStorage.setItem('hrms_workspaces', JSON.stringify(workspaces));
    }
  }, [workspaces]);

  useEffect(() => {
    if (activeWorkspace) {
      localStorage.setItem('hrms_active_workspace', JSON.stringify(activeWorkspace));
    }
  }, [activeWorkspace]);

  const refreshWorkspaces = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await api.getMyWorkspaces();

      if (response.success) {
        setWorkspaces(response.workspaces || []);
        setActiveWorkspace(response.activeWorkspace || response.workspaces?.[0] || null);
      } else {
        setError(response.error || 'Failed to load workspaces');
      }
    } catch (err: any) {
      console.error('Error loading workspaces:', err);
      setError(err.message || 'Failed to load workspaces');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    // No-op: Single workspace mode, switching is disabled
    console.log('Workspace switching is disabled in single-workspace mode');
    return Promise.resolve();
  }, []);

  const hasPermission = useCallback(
    (moduleCode: string, permission: keyof ModulePermissions): boolean => {
      if (!activeWorkspace) return false;

      const module = activeWorkspace.modules?.find(
        (m) => m.moduleCode === moduleCode && m.isEnabled
      );

      return module?.permissions?.[permission] === true;
    },
    [activeWorkspace]
  );

  const getModuleConfig = useCallback(
    (moduleCode: string): WorkspaceModule | null => {
      if (!activeWorkspace) return null;

      return activeWorkspace.modules?.find(
        (m) => m.moduleCode === moduleCode && m.isEnabled
      ) || null;
    },
    [activeWorkspace]
  );

  const getAvailableModules = useCallback((): WorkspaceModule[] => {
    if (!activeWorkspace) return [];

    return activeWorkspace.modules
      ?.filter((m) => m.isEnabled && m.permissions?.canView)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)) || [];
  }, [activeWorkspace]);

  // Update workspaces from login data
  const updateFromAuthData = useCallback((data: { workspaces?: Workspace[]; activeWorkspace?: Workspace }) => {
    if (data.workspaces) {
      setWorkspaces(data.workspaces);
    }
    if (data.activeWorkspace) {
      setActiveWorkspace(data.activeWorkspace);
    }
  }, []);

  // Listen for auth updates
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'hrms_workspaces' && e.newValue) {
        try {
          setWorkspaces(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Failed to parse workspaces from storage:', err);
        }
      }
      if (e.key === 'hrms_active_workspace' && e.newValue) {
        try {
          setActiveWorkspace(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Failed to parse active workspace from storage:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        isLoading,
        error,
        switchWorkspace,
        refreshWorkspaces,
        hasPermission,
        getModuleConfig,
        getAvailableModules,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

// Helper to set workspace data from login
export const setWorkspaceDataFromLogin = (data: { workspaces?: Workspace[]; activeWorkspace?: Workspace }) => {
  if (data.workspaces) {
    localStorage.setItem('hrms_workspaces', JSON.stringify(data.workspaces));
  }
  if (data.activeWorkspace) {
    localStorage.setItem('hrms_active_workspace', JSON.stringify(data.activeWorkspace));
  }
};

// Helper to clear workspace data on logout
export const clearWorkspaceData = () => {
  localStorage.removeItem('hrms_workspaces');
  localStorage.removeItem('hrms_active_workspace');
};

export default WorkspaceContext;

