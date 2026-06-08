'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { fetchCompanyProfile } from '@/lib/companyProfile';
import { ledgerPageHeaderStyle } from '@/lib/ledgerUi';
import { PAYSLIP_ACCENT_FALLBACK, payslipAccentCssVars, resolvePayslipAccentHex } from '@/lib/payslipTheme';

export function LoansPageShell({
  children,
  maxWidth = 'max-w-[1920px]',
}: {
  children: ReactNode;
  /** Default is full workspace width (1920px cap). Pass `max-w-4xl` etc. only when a narrow form is intentional. */
  maxWidth?: string;
}) {
  const [accentHex, setAccentHex] = useState(PAYSLIP_ACCENT_FALLBACK);

  useEffect(() => {
    fetchCompanyProfile().then((p) => setAccentHex(resolvePayslipAccentHex(p)));
  }, []);

  const themeStyle = payslipAccentCssVars(accentHex) as CSSProperties;

  return (
    <div
      className="min-h-[calc(100dvh-5rem)] px-4 py-5 sm:px-6 sm:py-6 lg:px-8"
      style={{
        ...themeStyle,
        background: `linear-gradient(165deg, rgba(var(--ps-accent-rgb), 0.05) 0%, #f8faf9 50%, #f1f5f4 100%)`,
      }}
    >
      <div className={`mx-auto w-full ${maxWidth}`}>{children}</div>
    </div>
  );
}

export function LoansPageHeader({
  title,
  subtitle,
  badge,
  action,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  action?: ReactNode;
}) {
  return (
    <header
      className="mb-5 flex flex-col gap-4 border bg-white px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:bg-stone-950"
      style={ledgerPageHeaderStyle()}
    >
      <div>
        {badge && (
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.32em]"
            style={{ color: 'var(--ps-accent-ink)' }}
          >
            {badge}
          </p>
        )}
        <h1 className="mt-1 font-serif text-2xl font-light tracking-tight text-stone-900 dark:text-stone-50 sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
        )}
        <div className="mt-4 h-0.5 w-16 rounded-full" style={{ backgroundColor: 'var(--ps-accent)' }} />
      </div>
      {action}
    </header>
  );
}

export type LoansStatItem = {
  label: string;
  value: number | string;
  accent?: boolean;
  muted?: boolean;
  highlight?: boolean;
};

export function LoansStatGrid({ stats }: { stats: LoansStatItem[] }) {
  return (
    <section
      className="mb-5 grid grid-cols-1 divide-y border bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 lg:divide-y-0 dark:bg-stone-950"
      style={{ borderColor: 'var(--ps-accent-border)' }}
    >
      {stats.map((stat) => (
        <LoansStat key={stat.label} {...stat} />
      ))}
    </section>
  );
}

function LoansStat({
  label,
  value,
  accent,
  muted,
  highlight,
}: LoansStatItem) {
  if (highlight) {
    return (
      <div className="px-5 py-4 text-white sm:px-6" style={{ backgroundColor: 'var(--ps-accent)' }}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/80">{label}</p>
        <p className="mt-1 font-mono text-xl font-medium tabular-nums">{value}</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 sm:px-6" style={accent ? { backgroundColor: 'var(--ps-accent-soft)' } : undefined}>
      <p
        className="text-[10px] uppercase tracking-[0.2em]"
        style={{ color: accent ? 'var(--ps-accent-ink)' : 'rgb(120 113 108)' }}
      >
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-xl font-medium tabular-nums ${
          muted ? 'text-rose-800/90 dark:text-rose-300' : 'text-stone-900 dark:text-stone-100'
        }`}
        style={accent ? { color: 'var(--ps-accent)' } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export type LoansTabItem = {
  id: string;
  label: string;
  count?: number;
};

export function LoansTabBar({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: LoansTabItem[];
  activeTab: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="mb-5 flex flex-wrap gap-1 border-b bg-white px-3 py-2 dark:bg-stone-950"
      style={{ borderColor: 'var(--ps-accent-border)' }}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition"
            style={
              active
                ? {
                    backgroundColor: 'var(--ps-accent-soft)',
                    color: 'var(--ps-accent)',
                  }
                : { color: 'rgb(120 113 108)' }
            }
          >
            <span>{tab.label}</span>
            {tab.count != null && (
              <span
                className="min-w-[1.25rem] rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                style={
                  active
                    ? { backgroundColor: 'var(--ps-accent)', color: '#fff' }
                    : { backgroundColor: 'rgba(120,113,108,0.12)', color: 'rgb(120 113 108)' }
                }
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function LoansToolbar({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-5 border bg-white px-5 py-4 dark:bg-stone-950 sm:px-6"
      style={{ borderColor: 'var(--ps-accent-border)' }}
    >
      {children}
    </div>
  );
}

export function LoansContentPanel({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden border bg-white dark:bg-stone-950"
      style={{ borderColor: 'var(--ps-accent-border)' }}
    >
      {children}
    </div>
  );
}

export function LoansSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="text-[10px] font-semibold uppercase tracking-[0.28em]"
      style={{ color: 'var(--ps-accent-ink)' }}
    >
      {children}
    </h2>
  );
}

export function loansPrimaryButtonClass() {
  return 'rounded-md px-4 py-2 text-xs font-semibold tracking-wide text-white transition hover:opacity-90 disabled:opacity-40';
}

export function loansPrimaryButtonStyle(): CSSProperties {
  return { backgroundColor: 'var(--ps-accent)' };
}

export function loansTableHeadClass() {
  return 'bg-[var(--ps-accent-soft)] text-left text-[10px] font-semibold uppercase tracking-wider';
}

export function loansTableHeadStyle(): CSSProperties {
  return { color: 'var(--ps-accent-ink)' };
}
