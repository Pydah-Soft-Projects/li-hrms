'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import type { SidebarNavCategory, SidebarNavItem } from '@/config/sidebarNav';

function ledgerSidebarRowClass(isActive: boolean, collapsed?: boolean): string {
  const base = `group flex w-full items-center rounded-xl transition-all duration-150 ${
    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
  } text-[13px] select-none`;
  if (isActive) return `${base} font-semibold`;
  return `${base} hover:bg-white/[0.08]`;
}

function ledgerSidebarRowStyle(isActive: boolean): CSSProperties {
  if (!isActive) return { color: 'var(--sidebar-text)' };
  return {
    backgroundColor: 'var(--primary)',
    color: 'var(--sidebar-text)',
    boxShadow: '0 2px 8px -1px rgba(0, 0, 0, 0.2)',
  };
}

function ledgerSidebarLinkClass(isActive: boolean, collapsed?: boolean): string {
  const base = `group relative flex items-center rounded-xl transition-all duration-150 ${
    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
  } text-[13px]`;
  if (isActive) return `${base} font-semibold`;
  return `${base} hover:bg-white/[0.08]`;
}

export function ledgerSidebarLinkStyle(isActive: boolean): CSSProperties {
  if (!isActive) return { color: 'var(--sidebar-text)' };
  return {
    backgroundColor: 'var(--primary)',
    color: 'var(--sidebar-text)',
    boxShadow: '0 2px 8px -1px rgba(0, 0, 0, 0.2)',
  };
}

export function ledgerSidebarIconClass(_isActive: boolean): string {
  return 'h-4 w-4 shrink-0 transition-colors';
}

export function ledgerSidebarIconStyle(isActive: boolean): CSSProperties | undefined {
  return {
    color: isActive ? 'var(--sidebar-text)' : 'var(--sidebar-muted)',
  };
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
  const navCollapsed = isCollapsed && !isMobileOpen;

  return (
    <div>
      <button
        type="button"
        onClick={onMobileOpen}
        className="fixed left-3 top-3 z-[100] inline-flex items-center rounded-lg border border-border bg-surface p-2 text-text-primary shadow-sm sm:hidden"
        style={{
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        <span className="sr-only">Open sidebar</span>
        <Menu className="h-5 w-5" />
      </button>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[90] bg-stone-900/60 backdrop-blur-sm sm:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-40 border-r transition-all duration-300 ease-in-out ${
          isMobileOpen ? 'w-64 translate-x-0 shadow-2xl' : '-translate-x-full sm:translate-x-0'
        } ${navCollapsed ? 'sm:w-20' : 'sm:w-64'}`}
        style={{
          backgroundColor: 'var(--sidebar)',
          color: 'var(--sidebar-text)',
          borderColor: 'var(--border)',
          fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          boxShadow: '4px 0 24px -2px rgba(10, 20, 35, 0.45)',
        }}
        aria-label="Sidebar"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="absolute -right-3 top-[106px] z-50 hidden sm:flex h-6 w-6 items-center justify-center rounded-full border shadow-md transition hover:scale-110 active:scale-95"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
        </button>

        <div className="flex h-full flex-col overflow-hidden">
          <div
            className={`relative flex shrink-0 flex-col items-center justify-center text-center border-b pt-6 pb-4 ${
              navCollapsed ? 'px-2' : 'px-4'
            }`}
            style={{ borderColor: 'var(--border)' }}
          >
            {header}
            {isMobileOpen && (
              <button
                type="button"
                onClick={onMobileClose}
                className="absolute right-3 top-3 rounded-md p-1 hover:bg-white/10 sm:hidden"
                style={{ color: 'var(--sidebar-muted)' }}
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <nav
            className="relative z-10 flex-1 space-y-1 overflow-y-auto px-3 py-4 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10"
          >
            {children}
          </nav>

          <div className="relative mt-auto w-full shrink-0">
            <div className={`relative z-10 ${navCollapsed ? 'px-2 pb-3' : 'px-3 pb-3'}`}>
              {footer}
            </div>
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
        <div className="space-y-0.5">
          {!collapsed && <LedgerSidebarCategory label="MAIN" />}
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
        </div>
      )}

      {directLinks.length > 0 && categoryGroups.length > 0 && !collapsed && (
        <div
          className="my-2 border-t opacity-20"
          style={{ borderColor: 'var(--border)' }}
        />
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
                    className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    style={{ color: 'var(--sidebar-muted)' }}
                  />
                </>
              )}
            </button>

            {isOpen && (
              <ul
                className={`space-y-0.5 ${
                  collapsed
                    ? 'flex flex-col items-center'
                    : 'ml-3 border-l pl-2'
                }`}
                style={{ borderColor: 'var(--primary)' }}
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
    <h3
      className="mb-1 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider select-none"
      style={{ color: 'var(--sidebar-muted)' }}
    >
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
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-2xl p-2 transition-all shadow-sm ${
          collapsed ? 'flex-col' : 'flex-row'
        }`}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <Link
          href={profileHref}
          onClick={onNavigate}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 transition hover:bg-white/10 ${
            collapsed ? 'justify-center p-0 hover:bg-transparent' : ''
          }`}
          title={collapsed ? 'Profile' : undefined}
        >
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-xs"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--primary)',
            }}
          >
            {initial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-[13px] font-semibold"
                style={{ color: 'var(--sidebar-text)' }}
              >
                {name}
              </p>
              <p
                className="truncate text-[11px] capitalize"
                style={{ color: 'var(--sidebar-muted)' }}
              >
                {subtitle}
              </p>
            </div>
          )}
        </Link>

        <button
          type="button"
          onClick={onLogout}
          className={`flex shrink-0 items-center justify-center rounded-lg p-1.5 transition hover:bg-white/10 ${
            collapsed ? 'w-full' : ''
          }`}
          style={{ color: 'var(--sidebar-text)' }}
          title="Logout"
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

