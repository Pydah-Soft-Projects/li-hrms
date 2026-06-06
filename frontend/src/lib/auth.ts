import { clearWorkspaceData } from '@/contexts/WorkspaceContext';
import { alertConfirm } from '@/lib/customSwal';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  roles: string[];
  department?: string | { _id: string; name: string };
  scope?: 'global' | 'restricted';
  departments?: { _id: string; name: string; code?: string }[];
  employeeId?: string;
  employeeRef?: string;
  emp_no?: string;
  featureControl?: string[];
  managedHolidayGroupIds?: string[];
  holidayDivisionMapping?: {
    division: string;
    departments: string[];
    employeeGroups: string[];
  }[];
  loginMethod?: string;
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
const DEVICE_ID_KEY = 'hrms_device_id';

let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let inactivityListenersBound = false;
let inactivityLogoutHandler: (() => void) | null = null;

const clearInactivityTimer = () => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
};

const resetInactivityTimer = () => {
  if (typeof window === 'undefined') return;

  clearInactivityTimer();

  inactivityTimer = setTimeout(() => {
    if (!auth.getToken() || !auth.getUser()) return;

    auth.logout().catch(() => {
      auth.clearLocalSession();
    });
    inactivityLogoutHandler?.();
  }, INACTIVITY_TIMEOUT_MS);
};

function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export const auth = {
  getDeviceId: (): string => {
    if (typeof window === 'undefined') return 'server';
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateDeviceId();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  },

  getDeviceName: (): string => {
    if (typeof navigator === 'undefined') return 'unknown';
    return navigator.userAgent || 'unknown';
  },

  setToken: (token: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  },

  getToken: (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  },

  setRefreshToken: (refreshToken: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('refreshToken', refreshToken);
    }
  },

  getRefreshToken: (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('refreshToken');
    }
    return null;
  },

  setAuthSession: (accessToken: string, refreshToken?: string) => {
    auth.setToken(accessToken);
    if (refreshToken) {
      auth.setRefreshToken(refreshToken);
    }
  },

  setUser: (user: User) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
    }
  },

  getUser: (): User | null => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    }
    return null;
  },

  clearLocalSession: (reason?: string) => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      clearWorkspaceData();
      window.dispatchEvent(new CustomEvent('auth-logout', { detail: { reason } }));
    }
  },

  logout: async () => {
    if (typeof window === 'undefined') return;

    const refreshToken = auth.getRefreshToken();
    const accessToken = auth.getToken();

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://hrms.pydah.edu.in/api';
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
    } catch {
      // Best-effort server logout; always clear local session
    }

    auth.clearLocalSession();
  },

  confirmLogout: async (
    message = 'Are you sure you want to logout?',
    title = 'Confirm Logout'
  ): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    const result = await alertConfirm(title, message, 'Logout');
    return result.isConfirmed;
  },

  logoutWithConfirmation: async (message = 'Are you sure you want to logout?'): Promise<boolean> => {
    const confirmed = await auth.confirmLogout(message);
    if (!confirmed) return false;
    await auth.logout();
    return true;
  },

  startInactivityAutoLogout: (onLogout?: () => void) => {
    if (typeof window === 'undefined') return;

    inactivityLogoutHandler = onLogout || null;

    if (!inactivityListenersBound) {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.addEventListener(eventName, resetInactivityTimer, { passive: true });
      });
      inactivityListenersBound = true;
    }

    resetInactivityTimer();
  },

  stopInactivityAutoLogout: () => {
    if (typeof window === 'undefined') return;

    clearInactivityTimer();

    if (inactivityListenersBound) {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetInactivityTimer);
      });
      inactivityListenersBound = false;
    }

    inactivityLogoutHandler = null;
  },

  isAuthenticated: (): boolean => {
    return auth.getToken() !== null;
  },

  getRoleBasedPath: (role: string): string => {
    if (role === 'super_admin') {
      return '/superadmin/dashboard';
    }
    return '/dashboard';
  },

  isSuperAdmin: (): boolean => {
    const user = auth.getUser();
    return user?.role === 'super_admin';
  },

  getAuthHeader: async (): Promise<Record<string, string>> => {
    const token = auth.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};
