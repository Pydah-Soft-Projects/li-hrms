'use client';

import React, { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { ChevronRight, Menu, Search, Settings, X } from 'lucide-react';
import { ledgerPageHeaderStyle } from '@/lib/ledgerUi';
import { fetchCompanyProfile } from '@/lib/companyProfile';
import { PAYSLIP_ACCENT_FALLBACK, payslipAccentCssVars, resolvePayslipAccentHex } from '@/lib/payslipTheme';
import Spinner from '@/components/Spinner';
import {
  settingsCardBodyClass,
  settingsCardClass,
  settingsCardHeaderClass,
  settingsFieldHelpClass,
  settingsLedgerBorder,
  settingsNavGroupClass,
  settingsNavItemActiveClass,
  settingsNavItemBaseClass,
  settingsNavItemInactiveClass,
  settingsOutlineButtonClass,
  settingsOutlineButtonStyle,
  settingsPanelSubtitleClass,
  settingsPanelTitleClass,
  settingsSaveButtonClass,
  settingsSaveButtonStyle,
  settingsSectionTitleClass,
  settingsThemeSoftStyle,
  settingsToggleThumbClass,
  settingsToggleTrackClass,
} from '@/lib/settingsUi';
import {
  loansFormInputClass,
  loansFormInputStyle,
  LoanFormLabel,
} from '@/components/loans/LoanDetailDialogShell';

/** Loads company accent + page gradient — same as LoansPageShell */
export function SettingsAccentShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const [accentHex, setAccentHex] = useState(PAYSLIP_ACCENT_FALLBACK);

  useEffect(() => {
    fetchCompanyProfile().then((p) => setAccentHex(resolvePayslipAccentHex(p)));
  }, []);

  const themeStyle = payslipAccentCssVars(accentHex) as CSSProperties;

  return (
    <div
      className={className}
      style={{
        ...themeStyle,
        background: `linear-gradient(165deg, rgba(var(--ps-accent-rgb), 0.05) 0%, #f8faf9 50%, #f1f5f4 100%)`,
      }}
    >
      {children}
    </div>
  );
}

export function SettingsContentPanel({ children }: { children: ReactNode }) {
  return (
    <div
      className="w-full min-w-0 overflow-hidden border bg-white dark:bg-stone-950"
      style={{ borderColor: 'var(--ps-accent-border)' }}
    >
      {children}
    </div>
  );
}

export function SettingsHubLayout({
  title,
  subtitle,
  searchQuery,
  onSearchChange,
  navGroups,
  activeId,
  onSelect,
  mobileMenuOpen,
  onMobileMenuToggle,
  children,
  footer,
  sidebarExtra,
}: {
  title: string;
  subtitle: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  navGroups: Record<string, { id: string; label: string; icon: React.ComponentType<{ className?: string }>; color?: string }[]>;
  activeId: string;
  onSelect: (id: string) => void;
  mobileMenuOpen: boolean;
  onMobileMenuToggle: () => void;
  children: ReactNode;
  footer?: ReactNode;
  sidebarExtra?: ReactNode;
}) {
  return (
    <SettingsAccentShell className="flex min-h-screen items-start -m-4 sm:-m-5 lg:-m-6">
      <button
        type="button"
        onClick={onMobileMenuToggle}
        className="fixed bottom-6 right-4 z-50 flex h-12 w-12 items-center justify-center border bg-white shadow-lg transition hover:opacity-90 sm:right-6 sm:h-14 sm:w-14 lg:hidden dark:bg-stone-950"
        style={{ ...settingsLedgerBorder, color: 'var(--ps-accent)' }}
        aria-label={mobileMenuOpen ? 'Close settings menu' : 'Open settings menu'}
      >
        {mobileMenuOpen ? <X className="h-5 w-5 sm:h-6 sm:w-6" /> : <Menu className="h-5 w-5 sm:h-6 sm:w-6" />}
      </button>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-30 bg-stone-900/50 lg:hidden" onClick={onMobileMenuToggle} aria-hidden />
      ) : null}

      <aside
        className={`fixed top-0 z-40 flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r bg-white transition-transform duration-300 ease-in-out dark:bg-stone-950 sm:w-72 lg:sticky lg:top-0 lg:flex lg:h-[min(100dvh,100vh)] lg:max-h-screen lg:translate-x-0 lg:self-start ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={settingsLedgerBorder}
      >
        <div className="border-b p-3 sm:p-4" style={ledgerPageHeaderStyle()}>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.32em]"
            style={{ color: 'var(--ps-accent-ink)' }}
          >
            Configuration
          </p>
          <div className="mt-2 flex items-center gap-2 sm:gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center sm:h-10 sm:w-10"
              style={{ ...settingsLedgerBorder, backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }}
            >
              <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-serif text-lg font-light tracking-tight text-stone-900 dark:text-stone-100 sm:text-xl">
                {title}
              </h1>
              <p
                className="truncate text-[9px] font-semibold uppercase tracking-widest sm:text-[10px]"
                style={{ color: 'var(--ps-accent-ink)' }}
              >
                {subtitle}
              </p>
            </div>
          </div>
          <div className="mt-3 h-0.5 w-12 rounded-full" style={{ backgroundColor: 'var(--ps-accent)' }} />

          {sidebarExtra ? <div className="mt-4">{sidebarExtra}</div> : null}

          <div className="relative mt-4 sm:mt-5">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400 sm:h-4 sm:w-4" />
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`${loansFormInputClass()} py-2 pl-8 text-xs sm:pl-9 sm:text-sm`}
              style={loansFormInputStyle()}
            />
          </div>
        </div>

        <nav className="settings-scrollbar flex-1 space-y-4 overflow-y-auto px-3 pb-4 sm:px-4">
          {Object.entries(navGroups).map(([group, items]) => (
            <div key={group} className="space-y-1">
              <h3
                className="mb-2 truncate px-3 text-[10px] font-semibold uppercase tracking-[0.2em] sm:px-4"
                style={{ color: 'var(--ps-accent-ink)' }}
              >
                {group}
              </h3>
              {items.map((item) => {
                const active = activeId === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={`${settingsNavItemBaseClass} ${active ? settingsNavItemActiveClass : settingsNavItemInactiveClass}`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${
                          active ? 'text-[color:var(--ps-accent)]' : 'text-stone-400 group-hover:text-stone-600'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <ChevronRight
                      className={`h-3 w-3 shrink-0 transition-transform ${active ? 'translate-x-0.5 opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
                      style={active ? { color: 'var(--ps-accent)' } : undefined}
                    />
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {footer ? (
          <div className="border-t p-3 sm:p-4" style={settingsLedgerBorder}>
            {footer}
          </div>
        ) : null}
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden">
        <SettingsContentPanel>{children}</SettingsContentPanel>
      </main>
    </SettingsAccentShell>
  );
}

export function SettingsPanel({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`settings-ledger-scope w-full min-w-0 space-y-4 p-3 sm:space-y-5 sm:p-4 ${className}`} style={style}>
      {children}
    </div>
  );
}

export function SettingsPanelHeader({
  section,
  title,
  subtitle,
  badge,
}: {
  section?: string;
  title: string;
  subtitle?: string;
  /** Alias for section — matches LoansPageHeader `badge` */
  badge?: string;
}) {
  const crumb = badge || section;
  return (
    <header
      className="-mx-3 -mt-3 mb-3 border-x-0 border-t-0 bg-white px-3 py-3 dark:bg-stone-950 sm:-mx-4 sm:-mt-4 sm:mb-4 sm:px-4 sm:py-3.5"
      style={ledgerPageHeaderStyle()}
    >
      {crumb ? (
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.32em]"
          style={{ color: 'var(--ps-accent-ink)' }}
        >
          {crumb}
        </p>
      ) : null}
      <h2 className="mt-0.5 font-serif text-xl font-light tracking-tight text-stone-900 dark:text-stone-50 sm:text-2xl">
        {title}
      </h2>
      {subtitle ? <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p> : null}
      <div className="mt-3 h-0.5 w-12 rounded-full" style={{ backgroundColor: 'var(--ps-accent)' }} />
    </header>
  );
}

export function SettingsSectionCard({
  title,
  description,
  children,
  accent,
  className = '',
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <section className={`${settingsCardClass} ${className}`} style={settingsLedgerBorder}>
      {title ? (
        <div
          className={settingsCardHeaderClass}
          style={{
            ...settingsLedgerBorder,
            ...settingsThemeSoftStyle,
            borderLeftWidth: 3,
            borderLeftColor: 'var(--settings-theme-accent, var(--ps-accent))',
          }}
        >
          <h3 className={settingsSectionTitleClass}>{title}</h3>
          {description ? (
            <p className="mt-1 text-sm normal-case tracking-normal text-stone-500 dark:text-stone-400">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className={settingsCardBodyClass}>{children}</div>
    </section>
  );
}

export function SettingsField({
  label,
  htmlFor,
  help,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <LoanFormLabel>
        {htmlFor ? (
          <label htmlFor={htmlFor}>
            {label}
            {required ? <span className="text-rose-500"> *</span> : null}
          </label>
        ) : (
          <>
            {label}
            {required ? <span className="text-rose-500"> *</span> : null}
          </>
        )}
      </LoanFormLabel>
      {children}
      {help ? <p className={settingsFieldHelpClass}>{help}</p> : null}
    </div>
  );
}

export function SettingsToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 border p-3 sm:p-3.5"
      style={settingsLedgerBorder}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-stone-900 dark:text-stone-100">
          {label}
        </label>
        {description ? <p className={settingsFieldHelpClass}>{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={settingsToggleTrackClass(checked)}
      >
        <span className={settingsToggleThumbClass(checked)} />
      </button>
    </div>
  );
}

export function SettingsSaveBar({
  onSave,
  saving,
  label = 'Save changes',
  disabled,
}: {
  onSave: () => void;
  saving?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 -mx-3 border-t bg-white/95 px-3 py-3 backdrop-blur-sm sm:-mx-4 sm:px-4 dark:bg-stone-950/95"
      style={settingsLedgerBorder}
    >
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || saving}
        className={`inline-flex w-full items-center justify-center gap-2 sm:w-auto ${settingsSaveButtonClass()}`}
        style={settingsSaveButtonStyle()}
      >
        {saving ? <Spinner className="h-4 w-4" /> : null}
        {label}
      </button>
    </div>
  );
}

export function SettingsOutlineButton({
  children,
  onClick,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 ${settingsOutlineButtonClass()} ${className}`}
      style={settingsOutlineButtonStyle()}
    >
      {children}
    </button>
  );
}

export function SettingsHubFooter() {
  return (
    <div className="border p-3 sm:p-4" style={settingsLedgerBorder}>
      <p
        className="truncate text-[10px] font-semibold uppercase tracking-widest sm:text-xs"
        style={{ color: 'var(--ps-accent-ink)' }}
      >
        Modular configuration
      </p>
      <p className="truncate text-[9px] leading-tight text-stone-500 sm:text-[10px]">
        Company accent from brand settings
      </p>
    </div>
  );
}
