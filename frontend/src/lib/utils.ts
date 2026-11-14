
import { useState, useEffect } from 'react';

interface EmployeeMinimal {
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    emp_no?: string;
}

export const getEmployeeName = (emp: EmployeeMinimal | null | undefined) => {
    if (!emp) return '';
    if (emp.employee_name) return emp.employee_name;
    if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
    if (emp.first_name) return emp.first_name;
    return emp.emp_no || '';
};

export const getEmployeeInitials = (emp: EmployeeMinimal | null | undefined) => {
    const name = getEmployeeName(emp);
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
    }
    return (name[0] || 'E').toUpperCase();
};

export function cn(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
}

export interface ThemeTokens {
  primary?: string;
  primaryHover?: string;
  primaryLight?: string;
  primaryRgb?: string;
  secondary?: string;
  secondaryRgb?: string;
  accent?: string;
  accentRgb?: string;
  background?: string;
  surface?: string;
  sidebar?: string;
  sidebarText?: string;
  sidebarMuted?: string;
  navbar?: string;
  textPrimary?: string;
  textSecondary?: string;
  textMuted?: string;
  border?: string;
  borderStrong?: string;
  success?: string;
  warning?: string;
  danger?: string;
  info?: string;
  [key: string]: string | undefined;
}

declare global {
  interface Window {
    ThemeLoader?: {
      getToken: (token: string) => string;
      getTokens: () => ThemeTokens;
      subscribe?: (cb: (tokens: ThemeTokens) => void) => () => void;
    };
  }
}

/**
 * React hook to consume centralized theme tokens dynamically in JavaScript components
 * (such as Recharts, Canvas, SVG, dynamic styles, etc.)
 */
export function useThemeTokens(): ThemeTokens {
  const [tokens, setTokens] = useState<ThemeTokens>(() => {
    if (typeof window !== 'undefined' && window.ThemeLoader) {
      return window.ThemeLoader.getTokens();
    }
    return {};
  });

  useEffect(() => {
    const handleUpdate = () => {
      if (typeof window !== 'undefined' && window.ThemeLoader) {
        setTokens(window.ThemeLoader.getTokens());
      }
    };

    window.addEventListener('theme:updated', handleUpdate);
    return () => window.removeEventListener('theme:updated', handleUpdate);
  }, []);

  return tokens;
}

/**
 * Read a single theme token value from ThemeLoader or DOM
 */
export function getThemeToken(tokenName: string): string {
  if (typeof window !== 'undefined' && window.ThemeLoader) {
    return window.ThemeLoader.getToken(tokenName) || '';
  }
  if (typeof document !== 'undefined') {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${tokenName}`).trim();
  }
  return '';
}

/**
 * Initializes centralized theme runtime loader specifically for after-login sessions
 * (Principals, Superadmin, HR, Managers, and Employees).
 */
export function initAfterLoginTheme() {
  if (typeof window === 'undefined') return;
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const srv = isLocal ? 'http://localhost:7000' : 'https://ui-theme.pydah.edu.in';
  
  if (!document.getElementById('app-theme-preload')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.id = 'app-theme-preload';
    l.href = `${srv}/themes/theme.css`;
    document.head.appendChild(l);
  }
  if (!document.getElementById('app-theme-loader-runtime')) {
    const sc = document.createElement('script');
    sc.id = 'app-theme-loader-runtime';
    sc.src = `${srv}/themes/theme-loader.js`;
    sc.setAttribute('data-theme-server', srv);
    sc.setAttribute('data-poll-interval', isLocal ? '10' : '30');
    document.head.appendChild(sc);
  }
}
