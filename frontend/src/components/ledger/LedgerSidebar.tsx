'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { ledgerPageHeaderStyle } from '@/lib/ledgerUi';
import { PAYSLIP_ACCENT_FALLBACK, payslipAccentCssVars, resolvePayslipAccentHex } from '@/lib/payslipTheme';
import { fetchCompanyProfile } from '@/lib/companyProfile';

function useLedgerSidebarTheme(): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>(
    payslipAccentCssVars(PAYSLIP_ACCENT_FALLBACK) as CSSProperties,
  );

  useEffect(() => {
    fetchCompanyProfile().then((profile) => {
      setStyle(payslipAccentCssVars(resolvePayslipAccentHex(profile)) as CSSProperties);
    });
  }, []);

  return style;
}

export function ledgerSidebarCategoryClass(): string {
  return 'px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]';
}

export function ledgerSidebarLinkClass(isActive: boolean, collapsed?: boolean): string {
  const base = `group relative flex items-center transition-colors ${
    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
  } text-sm`;
  if (isActive) return `${base} font-medium`;
  return `${base} text-stone-600 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-900/40 hover:text-stone-900 dark:hover:text-stone-100`;
}

export function ledgerSidebarLinkStyle(isActive: boolean, collapsed?: boolean): CSSProperties {
  if (!isActive) return {};
  return {
    backgroundColor: 'var(--ps-accent-soft)',
    color: 'var(--ps-accent-ink)',
    borderLeft: collapsed ? undefined : '2px solid var(--ps-accent)',
  };
}

export function ledgerSidebarIconClass(isActive: boolean): string {
  return `h-[18px] w-[18px] shrink-0 transition-colors ${
    isActive ? '' : 'text-stone-400 group-hover:text-stone-600 dark:text-stone-500 dark:group-hover:text-stone-300'
  }`;
}

export function ledgerSidebarIconStyle(isActive: boolean): CSSProperties | undefined {
  return isActive ? { color: 'var(--ps-accent)' } : undefined;
}

export function LedgerSidebarShell({
  children,
  header,
  footer,
  isCollapsed,
  isMobileOpen,
  onToggleCollapse,
  onMobileOpen,
  onMobileClose,
}: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onToggleCollapse: () => void;
  onMobileOpen: () => void;
  onMobileClose: () => void;
}) {
  const themeStyle = useLedgerSidebarTheme();

  return (
    <div style={themeStyle}>
      <button
        type="button"
        onClick={onMobileOpen}
        className="fixed left-3 top-3 z-[100] inline-flex items-center border bg-white p-2 text-stone-600 sm:hidden dark:bg-stone-950 dark:text-stone-400"
        style={{ borderColor: 'var(--ps-accent-border)' }}
      >
        <span className="sr-only">Open sidebar</span>
        <Menu className="h-5 w-5" />
      </button>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[90] bg-stone-900/40 backdrop-blur-sm sm:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[100] h-screen border-r transition-all duration-300 ease-in-out ${
          isMobileOpen ? 'w-64 translate-x-0' : '-translate-x-full sm:translate-x-0'
        } ${isCollapsed ? 'sm:w-[70px]' : 'sm:w-[240px]'}`}
        style={{
          ...themeStyle,
          borderColor: 'var(--ps-accent-border)',
          background:
            'linear-gradient(180deg, var(--ps-accent-soft) 0%, #ffffff 18%, #fafaf9 100%)',
        }}
        aria-label="Sidebar"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="absolute -right-3 top-6 z-50 hidden h-6 w-6 items-center justify-center border bg-white text-stone-500 transition hover:opacity-80 sm:flex dark:bg-stone-950 dark:text-stone-400"
          style={{ borderColor: 'var(--ps-accent-border)' }}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        <div className="flex h-full flex-col overflow-hidden dark:bg-stone-950">
          <div
            className={`flex items-center border-b px-4 py-4 ${
              isCollapsed && !isMobileOpen ? 'justify-center' : 'justify-between'
            }`}
            style={ledgerPageHeaderStyle()}
          >
            {header}
            {isMobileOpen && (
              <button
                type="button"
                onClick={onMobileClose}
                className="text-stone-500 hover:text-stone-800 sm:hidden dark:text-stone-400 dark:hover:text-stone-200"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <nav
            className="flex-1 space-y-6 overflow-y-auto px-2 py-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full"
            style={{ scrollbarColor: 'var(--ps-accent-muted) transparent' }}
          >
            {children}
          </nav>

          <div
            className="border-t bg-white p-3 dark:bg-stone-950"
            style={{ borderColor: 'var(--ps-accent-border)' }}
          >
            {footer}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function LedgerSidebarCategory({
  label,
  hidden,
}: {
  label: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <h3 className={ledgerSidebarCategoryClass()} style={{ color: 'var(--ps-accent-ink)' }}>
      {label}
    </h3>
  );
}

export function LedgerSidebarLink({
  href,
  label,
  icon: Icon,
  isActive,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: CSSProperties }>;
  isActive: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className={ledgerSidebarLinkClass(isActive, collapsed)}
        style={ledgerSidebarLinkStyle(isActive, collapsed)}
        title={collapsed ? label : undefined}
      >
        <Icon
          className={ledgerSidebarIconClass(isActive)}
          style={ledgerSidebarIconStyle(isActive)}
        />
        {!collapsed && <span>{label}</span>}
      </Link>
    </li>
  );
}

export function LedgerSidebarUserCard({
  profileHref,
  name,
  subtitle,
  collapsed,
  onNavigate,
  onLogout,
}: {
  profileHref: string;
  name: string;
  subtitle: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const initial = (name.charAt(0) || 'U').toUpperCase();

  return (
    <div
      className={`flex items-center gap-2 border p-1.5 ${
        collapsed ? 'flex-col' : 'flex-row'
      }`}
      style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)' }}
    >
      <Link
        href={profileHref}
        onClick={onNavigate}
        className={`flex flex-1 items-center gap-3 rounded-sm p-1 transition hover:opacity-90 ${
          collapsed ? 'justify-center p-0' : ''
        }`}
        title={collapsed ? 'Profile' : undefined}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: 'var(--ps-accent)' }}
        >
          {initial}
        </div>
        {!collapsed && (
          <div className="max-w-[100px] shrink-0">
            <p className="truncate text-[13px] font-semibold text-stone-900 dark:text-stone-100">
              {name}
            </p>
            <p className="truncate text-[10px] text-stone-500 dark:text-stone-400">{subtitle}</p>
          </div>
        )}
      </Link>

      <button
        type="button"
        onClick={onLogout}
        className={`flex items-center justify-center border border-transparent p-2 text-stone-500 transition hover:border-rose-200 hover:bg-white hover:text-rose-600 dark:hover:border-rose-900 dark:hover:bg-stone-900 dark:hover:text-rose-400 ${
          collapsed ? 'mt-1 w-full' : ''
        }`}
        title="Logout"
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" />
      </button>
    </div>
  );
}
