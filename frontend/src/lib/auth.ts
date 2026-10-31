import { clearWorkspaceData } from '@/contexts/WorkspaceContext';
import { alertConfirm, ledgerSwalFire } from '@/lib/customSwal';

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
const LAST_ACTIVITY_KEY = 'hrms_last_activity';
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
  'keydown',
  'keyup',
  'wheel',
  'scroll',
  'touchstart',
  'touchmove',
  'touchend',
  'pointerdown',
  'pointermove',
  'pointerup',
  'input',
  'change',
  'focus',
];
const DEVICE_ID_KEY = 'hrms_device_id';

let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let inactivityListenersBound = false;
let inactivityLogoutHandler: (() => void) | null = null;
let activeInactivityListenersCount = 0;
let lastActivityRecordedAt = 0;
let lastStorageWriteAt = 0;

const clearInactivityTimer = () => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
};

const getLatestActivityTimestamp = (): number => {
  let latest = lastActivityRecordedAt;
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (stored) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed) && parsed > latest) {
          latest = parsed;
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }
  return latest;
};

const scheduleInactivityCheck = () => {
  if (typeof window === 'undefined') return;
  clearInactivityTimer();

  const latestActivity = getLatestActivityTimestamp();
  const now = Date.now();
  const elapsed = now - (latestActivity || now);
  const remaining = Math.max(0, INACTIVITY_TIMEOUT_MS - elapsed);

  inactivityTimer = setTimeout(() => {
    if (!auth.getToken() || !auth.getUser()) return;

    // Check if user was active in another tab or recently
    const currentLatest = getLatestActivityTimestamp();
    const actualElapsed = Date.now() - (currentLatest || Date.now());

    if (actualElapsed < INACTIVITY_TIMEOUT_MS) {
      // User was active; reschedule timer for the remaining time
      scheduleInactivityCheck();
      return;
    }

    // Check if employee is currently typing in an input/textarea/select/contentEditable
    if (typeof document !== 'undefined') {
      const activeEl = document.activeElement;
      const isInteractingWithForm =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable);

      if (document.hasFocus() && isInteractingWithForm) {
        // User is actively working in a form field - do not log out
        recordActivity(true);
        return;
      }
    }

    // Truly inactive for full duration and not working -> Logout
    auth.logout().catch(() => {
      auth.clearLocalSession('INACTIVITY_TIMEOUT');
    });
    inactivityLogoutHandler?.();
  }, remaining > 0 ? remaining : INACTIVITY_TIMEOUT_MS);
};

const recordActivity = (force = false) => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  lastActivityRecordedAt = now;

  // Throttle writes to localStorage to avoid spamming on every pixel move (at most once every 3 seconds)
  if (force || now - lastStorageWriteAt > 3000) {
    lastStorageWriteAt = now;
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    } catch {
      // ignore
    }
  }

  scheduleInactivityCheck();
};

const handleUserActivity = () => {
  recordActivity(false);
};

const handleStorageActivity = (event: StorageEvent) => {
  if (event.key === LAST_ACTIVITY_KEY && event.newValue) {
    const timestamp = Number(event.newValue);
    if (!Number.isNaN(timestamp) && timestamp > lastActivityRecordedAt) {
      lastActivityRecordedAt = timestamp;
      scheduleInactivityCheck();
    }
  }
};

const handleVisibilityChange = () => {
  if (typeof document !== 'undefined' && !document.hidden) {
    // When tab becomes visible again, check latest activity across tabs
    const latest = getLatestActivityTimestamp();
    const elapsed = Date.now() - (latest || Date.now());
    if (elapsed >= INACTIVITY_TIMEOUT_MS && auth.getToken() && auth.getUser()) {
      auth.logout().catch(() => {
        auth.clearLocalSession('INACTIVITY_TIMEOUT');
      });
      inactivityLogoutHandler?.();
    } else {
      recordActivity(false);
    }
  }
};

const addActivityListeners = () => {
  if (typeof window === 'undefined') return;

  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, handleUserActivity, { passive: true, capture: true });
  });

  window.addEventListener('storage', handleStorageActivity);
  document.addEventListener('visibilitychange', handleVisibilityChange);
};

const removeActivityListeners = () => {
  if (typeof window === 'undefined') return;

  ACTIVITY_EVENTS.forEach((eventName) => {
    window.removeEventListener(eventName, handleUserActivity, { capture: true } as EventListenerOptions);
  });

  window.removeEventListener('storage', handleStorageActivity);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
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
    auth.recordActivity(true);
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

  setLoginMethod: (method: 'sso' | 'credentials') => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('loginMethod', method);
      if (method === 'sso') {
        localStorage.setItem('isSSO', 'true');
      } else {
        localStorage.removeItem('isSSO');
      }
      window.dispatchEvent(new Event('auth-change'));
    }
  },

  getLoginMethod: (): string | null => {
    if (typeof window !== 'undefined') {
      const explicit = localStorage.getItem('loginMethod');
      if (explicit) return explicit;
      const isSSOFlag = localStorage.getItem('isSSO');
      if (isSSOFlag === 'true') return 'sso';
      const user = auth.getUser();
      return user?.loginMethod || null;
    }
    return null;
  },

  isSSO: (): boolean => {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem('isSSO') === 'true' ||
      auth.getLoginMethod() === 'sso' ||
      (auth.getUser() as unknown as Record<string, unknown>)?.loginMethod === 'sso' ||
      (auth.getUser() as unknown as Record<string, unknown>)?.isSSO === true
    );
  },

  isSSOUser: (): boolean => {
    return auth.isAuthenticated() && auth.isSSO();
  },

  redirectAfterLogout: (isSSO?: boolean) => {
    if (typeof window === 'undefined') return;
    const shouldRedirectToCrm = isSSO !== undefined ? isSSO : auth.isSSO();
    const crmUrl = process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.pydah.edu.in';
    if (shouldRedirectToCrm && crmUrl) {
      window.location.href = crmUrl;
    } else if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  },

  clearLocalSession: (reason?: string, isSSOOverride?: boolean) => {
    if (typeof window !== 'undefined') {
      const isSSO = isSSOOverride !== undefined ? isSSOOverride : auth.isSSO();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('loginMethod');
      localStorage.removeItem('isSSO');
      clearWorkspaceData();
      window.dispatchEvent(new CustomEvent('auth-logout', { detail: { reason, isSSO } }));
      window.dispatchEvent(new Event('auth-change'));
    }
  },

  logout: async () => {
    if (typeof window === 'undefined') return;

    const isSSO = auth.isSSO();
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

    auth.clearLocalSession(undefined, isSSO);
  },

  confirmLogout: async (
    message?: string,
    title = 'Confirm Logout'
  ): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    const isSSO = auth.isSSO();

    let htmlContent: string;
    if (message) {
      htmlContent = `<div class="text-center"><p class="text-sm text-slate-700 dark:text-slate-200">${message}</p></div>`;
    } else if (isSSO) {
      htmlContent = `
        <div class="text-center">
          <p class="text-sm text-slate-700 dark:text-slate-200 mb-2.5">Are you sure you want to logout?</p>
          <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 font-medium">
            <span>Note: You will be redirected to the CRM portal.</span>
          </div>
        </div>
      `;
    } else {
      htmlContent = `<div class="text-center"><p class="text-sm text-slate-700 dark:text-slate-200">Are you sure you want to logout?</p></div>`;
    }

    const result = await ledgerSwalFire({
      icon: 'question',
      title,
      html: htmlContent,
      showCancelButton: true,
      confirmButtonText: 'Logout',
      cancelButtonText: 'Cancel',
      confirmVariant: 'danger',
      size: 'sm',
    });
    return result.isConfirmed;
  },

  logoutWithConfirmation: async (message?: string): Promise<boolean> => {
    const isSSO = auth.isSSO();
    const confirmed = await auth.confirmLogout(message);
    if (!confirmed) return false;
    await auth.logout();
    auth.redirectAfterLogout(isSSO);
    return true;
  },

  recordActivity: (force = false) => {
    recordActivity(force);
  },

  startInactivityAutoLogout: (onLogout?: () => void) => {
    if (typeof window === 'undefined') return;

    if (onLogout) {
      inactivityLogoutHandler = onLogout;
    }

    activeInactivityListenersCount++;

    if (!inactivityListenersBound) {
      addActivityListeners();
      inactivityListenersBound = true;
    }

    recordActivity(true);
  },

  stopInactivityAutoLogout: () => {
    if (typeof window === 'undefined') return;

    activeInactivityListenersCount = Math.max(0, activeInactivityListenersCount - 1);

    if (activeInactivityListenersCount === 0) {
      clearInactivityTimer();

      if (inactivityListenersBound) {
        removeActivityListeners();
        inactivityListenersBound = false;
      }

      inactivityLogoutHandler = null;
    }
  },

  isAuthenticated: (): boolean => {
    return Boolean(auth.getToken() && auth.getUser());
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
