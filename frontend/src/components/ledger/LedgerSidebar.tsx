'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import type { SidebarNavCategory, SidebarNavItem } from '@/config/sidebarNav';
import { PAYSLIP_ACCENT_FALLBACK, payslipAccentCssVars, resolvePayslipAccentHex } from '@/lib/payslipTheme';
import { fetchCompanyProfile } from '@/lib/companyProfile';
import { SidebarRibbonArt } from '@/components/ledger/SidebarRibbonArt';

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
  const base = `group flex w-full items-center rounded-xl transition-all duration-150 ${
    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
  } text-[13px]`;
  if (isActive) return `${base} font-semibold`;
  return `${base} text-zinc-600 hover:bg-emerald-50/70 dark:text-zinc-400 dark:hover:bg-emerald-950/30 hover:text-zinc-900 dark:hover:text-zinc-100`;
}

function ledgerSidebarRowStyle(isActive: boolean): CSSProperties {
  if (!isActive) return {};
  return {
    backgroundColor: 'var(--ps-accent-soft)',
    color: 'var(--ps-accent-ink)',
  };
}

function ledgerSidebarLinkClass(isActive: boolean, collapsed?: boolean): string {
  const base = `group relative flex items-center rounded-xl transition-all duration-150 ${
    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
  } text-[13px]`;
  if (isActive) return `${base} font-semibold`;
  return `${base} text-zinc-600 hover:bg-emerald-50/70 dark:text-zinc-400 dark:hover:bg-emerald-950/30 hover:text-zinc-900 dark:hover:text-zinc-100`;
}

export function ledgerSidebarLinkStyle(isActive: boolean): CSSProperties {
  if (!isActive) return {};
  return {
    backgroundColor: 'var(--ps-accent-soft, #ecfdf5)',
    color: 'var(--ps-accent-ink, #047857)',
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
        className={`fixed left-0 top-0 z-[100] h-screen border-r border-zinc-100 bg-white transition-all duration-300 ease-in-out dark:border-zinc-800 dark:bg-zinc-950 ${
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
            className="relative z-10 flex-1 space-y-1 overflow-y-auto px-3 py-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-200 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700"
            style={{ scrollbarColor: 'rgb(212 212 216) transparent' }}
          >
            {children}
          </nav>

          {!navCollapsed && (
            <div className="relative mt-auto w-full shrink-0 bg-white dark:bg-zinc-950">
              <div className="relative -mb-8 h-28">
                <SidebarRibbonArt />
              </div>
              <div className="relative z-10 px-3 pb-3">
                {footer}
              </div>
            </div>
          )}

          {navCollapsed && (
            <div className="relative z-10 shrink-0 px-2 pb-3">
              {footer}
            </div>
          )}
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
        category.code === 'MAIN' || (category.items.length === 1 && !category.forceDropdown) ? category.items : [],
      ),
    [categories],
  );

  const categoryGroups = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.code !== 'MAIN' && (category.items.length > 1 || category.forceDropdown),
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
        {isActive && !collapsed && (
          <span
            className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full"
            style={{ backgroundColor: 'var(--ps-accent, #10b981)' }}
          />
        )}
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border border-zinc-100 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${
          collapsed ? 'flex-col' : 'flex-row'
        }`}
      >
        <Link
          href={profileHref}
          onClick={onNavigate}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 transition hover:bg-white dark:hover:bg-zinc-800 ${
            collapsed ? 'justify-center p-0 hover:bg-transparent dark:hover:bg-transparent' : ''
          }`}
          title={collapsed ? 'Profile' : undefined}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: 'var(--ps-accent, #10b981)' }}
          >
            {initial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                {name}
              </p>
              <p className="truncate text-[11px] capitalize text-zinc-500 dark:text-zinc-400">
                {subtitle}
              </p>
            </div>
          )}
        </Link>

        {!collapsed && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-zinc-400 transition hover:bg-white hover:text-zinc-600 dark:hover:bg-zinc-800"
            aria-label="User menu"
            aria-expanded={menuOpen}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full shrink-0 items-center justify-center rounded-md p-1.5 text-zinc-400 transition hover:bg-white hover:text-rose-600 dark:hover:bg-zinc-800"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>

      {menuOpen && !collapsed && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <Link
            href={profileHref}
            onClick={() => {
              setMenuOpen(false);
              onNavigate?.();
            }}
            className="block px-4 py-2.5 text-xs font-medium text-zinc-700 hover:bg-emerald-50 dark:text-zinc-300 dark:hover:bg-emerald-950/30"
          >
            My Profile
          </Link>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
