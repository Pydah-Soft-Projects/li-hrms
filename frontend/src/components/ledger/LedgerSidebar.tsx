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
  if (!isActive) return { color: 'var(--sidebar-text, #FFFFFF)' };
  return {
    backgroundColor: 'var(--primary)',
    color: 'var(--sidebar-text, #FFFFFF)',
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
  if (!isActive) return { color: 'var(--sidebar-text, #FFFFFF)' };
  return {
    backgroundColor: 'var(--primary)',
    color: 'var(--sidebar-text, #FFFFFF)',
    boxShadow: '0 2px 8px -1px rgba(0, 0, 0, 0.2)',
  };
}

export function ledgerSidebarIconClass(_isActive: boolean): string {
  return 'h-4 w-4 shrink-0 transition-colors';
}

export function ledgerSidebarIconStyle(isActive: boolean): CSSProperties | undefined {
  return {
    color: isActive ? 'var(--sidebar-text, #FFFFFF)' : 'var(--sidebar-muted, rgba(255, 255, 255, 0.7))',
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
        className={`fixed left-0 top-0 z-[100] h-screen border-r transition-all duration-300 ease-in-out ${
          isMobileOpen ? 'w-[260px] translate-x-0 shadow-2xl' : '-translate-x-full sm:translate-x-0'
        } ${navCollapsed ? 'sm:w-[68px]' : 'sm:w-[260px]'}`}
        style={{
          backgroundColor: 'var(--sidebar, #1E3150)',
          color: 'var(--sidebar-text, #FFFFFF)',
          borderColor: 'var(--border)',
          boxShadow: '4px 0 24px -2px rgba(10, 20, 35, 0.45)',
        }}
        aria-label="Sidebar"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="absolute -right-3 top-7 z-50 hidden h-6 w-6 items-center justify-center rounded-full border shadow-md transition hover:scale-110 active:scale-95 sm:flex"
          style={{
            backgroundColor: 'var(--surface, #FFFFFF)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary, #0F172A)',
          }}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        <div className="flex h-full flex-col overflow-hidden">
          <div
            className={`flex shrink-0 items-center border-b px-4 py-4 ${
              navCollapsed ? 'justify-center' : 'justify-between'
            }`}
            style={{ borderColor: 'var(--border)' }}
          >
            {header}
            {isMobileOpen && (
              <button
                type="button"
                onClick={onMobileClose}
                className="rounded-md p-1 hover:bg-white/10 sm:hidden"
                style={{ color: 'var(--sidebar-muted, rgba(255, 255, 255, 0.7))' }}
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
                    style={{ color: 'var(--sidebar-muted, rgba(255, 255, 255, 0.7))' }}
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
      style={{ color: 'var(--sidebar-muted, rgba(255, 255, 255, 0.7))' }}
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
  const [menuOpen, setMenuOpen] = useState(false);

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
              backgroundColor: 'var(--surface, #FFFFFF)',
              color: 'var(--primary)',
            }}
          >
            {initial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-[13px] font-semibold"
                style={{ color: 'var(--sidebar-text, #FFFFFF)' }}
              >
                {name}
              </p>
              <p
                className="truncate text-[11px] capitalize"
                style={{ color: 'var(--sidebar-muted, rgba(255, 255, 255, 0.7))' }}
              >
                {subtitle}
              </p>
            </div>
          )}
        </Link>

        {!collapsed && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex shrink-0 items-center justify-center rounded-lg p-1.5 transition hover:bg-white/10"
            style={{ color: 'var(--sidebar-text, #FFFFFF)' }}
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
            className="flex w-full shrink-0 items-center justify-center rounded-md p-1.5 transition hover:bg-white/10"
            style={{ color: 'var(--sidebar-text, #FFFFFF)' }}
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>

      {menuOpen && !collapsed && (
        <div
          className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-xl border shadow-lg"
          style={{
            backgroundColor: 'var(--surface, #FFFFFF)',
            borderColor: 'var(--border)',
          }}
        >
          <Link
            href={profileHref}
            onClick={() => {
              setMenuOpen(false);
              onNavigate?.();
            }}
            className="block px-4 py-2.5 text-xs font-medium hover:bg-primary-light transition-colors"
            style={{ color: 'var(--text-primary)' }}
          >
            My Profile
          </Link>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

