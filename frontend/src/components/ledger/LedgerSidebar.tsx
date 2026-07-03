'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import type { SidebarNavCategory, SidebarNavItem } from '@/config/sidebarNav';
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

function ledgerSidebarRowClass(isActive: boolean, collapsed?: boolean): string {
  const base = `group flex w-full items-center rounded-lg transition-all duration-150 ${
    collapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-2.5 py-2.5'
  } text-[13px]`;
  if (isActive) return `${base} font-medium`;
  return `${base} text-stone-600 hover:bg-stone-100/80 dark:text-stone-400 dark:hover:bg-stone-800/60 hover:text-stone-900 dark:hover:text-stone-100`;
}

function ledgerSidebarRowStyle(isActive: boolean): CSSProperties {
  if (!isActive) return {};
  return {
    backgroundColor: 'var(--ps-accent-soft)',
    color: 'var(--ps-accent-ink)',
  };
}

export function ledgerSidebarLinkClass(isActive: boolean, collapsed?: boolean): string {
  const base = `group relative flex items-center rounded-lg transition-all duration-150 ${
    collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-2.5 py-2'
  } text-[13px]`;
  if (isActive) return `${base} font-medium`;
  return `${base} text-stone-600 hover:bg-stone-100/80 dark:text-stone-400 dark:hover:bg-stone-800/60 hover:text-stone-900 dark:hover:text-stone-100`;
}

export function ledgerSidebarLinkStyle(isActive: boolean): CSSProperties {
  if (!isActive) return {};
  return {
    backgroundColor: 'var(--ps-accent-soft)',
    color: 'var(--ps-accent-ink)',
  };
}

export function ledgerSidebarIconClass(isActive: boolean): string {
  return `h-4 w-4 shrink-0 transition-colors ${
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
  const navCollapsed = isCollapsed && !isMobileOpen;

  return (
    <div style={themeStyle}>
      <button
        type="button"
        onClick={onMobileOpen}
        className="fixed left-3 top-3 z-[100] inline-flex items-center rounded-lg border border-stone-200 bg-white p-2 text-stone-600 shadow-sm sm:hidden dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400"
      >
        <span className="sr-only">Open sidebar</span>
        <Menu className="h-5 w-5" />
      </button>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[90] bg-stone-900/40 backdrop-blur-[2px] sm:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[100] h-screen border-r border-stone-200/80 bg-white transition-all duration-300 ease-in-out dark:border-stone-800 dark:bg-stone-950 ${
          isMobileOpen ? 'w-[260px] translate-x-0' : '-translate-x-full sm:translate-x-0'
        } ${navCollapsed ? 'sm:w-[68px]' : 'sm:w-[260px]'}`}
        style={themeStyle}
        aria-label="Sidebar"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="absolute -right-3 top-7 z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm transition hover:text-stone-700 sm:flex dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500 dark:hover:text-stone-300"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        <div className="flex h-full flex-col overflow-hidden">
          <div
            className={`flex shrink-0 items-center border-b border-stone-100 px-4 py-4 dark:border-stone-800 ${
              navCollapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            {header}
            {isMobileOpen && (
              <button
                type="button"
                onClick={onMobileClose}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 sm:hidden dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <nav
            className="relative flex-1 space-y-1 overflow-y-auto px-2 py-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-200 dark:[&::-webkit-scrollbar-thumb]:bg-stone-700"
            style={{ scrollbarColor: 'rgb(214 211 209) transparent' }}
          >
            {children}
          </nav>

          <div className="shrink-0 border-t border-stone-100 p-2.5 dark:border-stone-800">
            {footer}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function LedgerSidebarMenu({
  categories,
  pathname,
  collapsed,
  onNavigate,
  isItemActive,
}: {
  categories: SidebarNavCategory[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  isItemActive: (item: SidebarNavItem) => boolean;
}) {
  const directLinks = useMemo(
    () =>
      categories.flatMap((category) =>
        category.code === 'MAIN' || category.items.length === 1 ? category.items : [],
      ),
    [categories],
  );

  const categoryGroups = useMemo(
    () =>
      categories.filter(
        (category) => category.code !== 'MAIN' && category.items.length > 1,
      ),
    [categories],
  );

  const activeCategoryCode = useMemo(() => {
    for (const category of categoryGroups) {
      if (category.items.some((item) => isItemActive(item))) return category.code;
    }
    return null;
  }, [categoryGroups, isItemActive]);

  const [openCategory, setOpenCategory] = useState<string | null>(null);

  useEffect(() => {
    if (activeCategoryCode) setOpenCategory(activeCategoryCode);
  }, [pathname, activeCategoryCode]);

  const categoryHasActiveChild = (category: SidebarNavCategory) =>
    category.items.some((item) => isItemActive(item));

  const toggleCategory = (code: string) => {
    setOpenCategory((prev) => (prev === code ? null : code));
  };

  return (
    <div className="space-y-0.5">
      {directLinks.length > 0 && (
        <ul className="space-y-0.5">
          {directLinks.map((item) => (
            <LedgerSidebarLink
              key={item.code}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={isItemActive(item)}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}

      {directLinks.length > 0 && categoryGroups.length > 0 && !collapsed && (
        <div className="my-2 border-t border-stone-100 dark:border-stone-800" />
      )}

      {categoryGroups.map((category) => {
        const Icon = category.icon;
        const isOpen = openCategory === category.code;
        const hasActiveChild = categoryHasActiveChild(category);
        const highlighted = hasActiveChild || isOpen;

        return (
          <div key={category.code} className="space-y-0.5">
            <button
              type="button"
              onClick={() => toggleCategory(category.code)}
              className={ledgerSidebarRowClass(highlighted, collapsed)}
              style={ledgerSidebarRowStyle(highlighted)}
              title={collapsed ? category.label : undefined}
              aria-expanded={isOpen}
            >
              <Icon
                className={ledgerSidebarIconClass(highlighted)}
                style={ledgerSidebarIconStyle(highlighted)}
              />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-left">{category.label}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </>
              )}
            </button>

            {isOpen && (
              <ul
                className={`space-y-0.5 ${
                  collapsed
                    ? 'flex flex-col items-center'
                    : 'ml-3 border-l border-stone-200 pl-2 dark:border-stone-700'
                }`}
              >
                {category.items.map((item) => (
                  <LedgerSidebarLink
                    key={item.code}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={isItemActive(item)}
                    collapsed={collapsed}
                    nested={!collapsed}
                    onNavigate={onNavigate}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
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
    <h3 className="mb-1 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
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
  nested,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: CSSProperties }>;
  isActive: boolean;
  collapsed?: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li className={nested ? 'w-full' : undefined}>
      <Link
        href={href}
        onClick={onNavigate}
        className={`${ledgerSidebarLinkClass(isActive, collapsed)} ${nested ? 'text-[12px]' : ''}`}
        style={ledgerSidebarLinkStyle(isActive)}
        title={collapsed ? label : undefined}
      >
        <Icon
          className={ledgerSidebarIconClass(isActive)}
          style={ledgerSidebarIconStyle(isActive)}
        />
        {!collapsed && <span className="truncate">{label}</span>}
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
      className={`flex items-center gap-1.5 rounded-lg bg-stone-50 p-1.5 dark:bg-stone-900/50 ${
        collapsed ? 'flex-col' : 'flex-row'
      }`}
    >
      <Link
        href={profileHref}
        onClick={onNavigate}
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 transition hover:bg-white dark:hover:bg-stone-800 ${
          collapsed ? 'justify-center p-0 hover:bg-transparent dark:hover:bg-transparent' : ''
        }`}
        title={collapsed ? 'Profile' : undefined}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: 'var(--ps-accent)' }}
        >
          {initial}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-stone-900 dark:text-stone-100">
              {name}
            </p>
            <p className="truncate text-[11px] capitalize text-stone-500 dark:text-stone-400">
              {subtitle}
            </p>
          </div>
        )}
      </Link>

      <button
        type="button"
        onClick={onLogout}
        className={`flex shrink-0 items-center justify-center rounded-md p-1.5 text-stone-400 transition hover:bg-white hover:text-rose-600 dark:hover:bg-stone-800 dark:hover:text-rose-400 ${
          collapsed ? 'w-full' : ''
        }`}
        title="Logout"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
