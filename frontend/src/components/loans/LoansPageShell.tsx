'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { fetchCompanyProfile } from '@/lib/companyProfile';
import { ledgerPageHeaderStyle } from '@/lib/ledgerUi';
import { PAYSLIP_ACCENT_FALLBACK, payslipAccentCssVars, resolvePayslipAccentHex } from '@/lib/payslipTheme';

export function LoansPageShell({
  children,
  maxWidth = 'w-full min-w-0',
}: {
  children: ReactNode;
  /** Default is full workspace width. Pass a max-width class only when a narrow form is intentional. */
  maxWidth?: string;
}) {
  const [accentHex, setAccentHex] = useState(PAYSLIP_ACCENT_FALLBACK);

  useEffect(() => {
    fetchCompanyProfile().then((p) => setAccentHex(resolvePayslipAccentHex(p)));
  }, []);

  const themeStyle = payslipAccentCssVars(accentHex) as CSSProperties;

  return (
    <div
      className="min-h-[calc(100dvh-5rem)] w-full min-w-0 -m-4 sm:-m-5 lg:-m-6 p-2 sm:p-3"
      style={{
        ...themeStyle,
        background: `linear-gradient(165deg, rgba(var(--ps-accent-rgb), 0.05) 0%, #f8faf9 50%, #f1f5f4 100%)`,
      }}
    >
      <div className={maxWidth}>{children}</div>
    </div>
  );
}

export function LoansPageHeader({
  title,
  subtitle,
  badge,
  action,
  footer,
  dense,
  layout = 'split',
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  action?: ReactNode;
  /** Filters / search row rendered below title and actions inside the header card */
  footer?: ReactNode;
  /** Tighter vertical padding (e.g. pay register with inline filters) */
  dense?: boolean;
  /** split: title left, action right; stacked: title then action row; toolbar: title, filters, actions on one line */
  layout?: 'split' | 'stacked' | 'toolbar';
}) {
  const titleBlock = (
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
  );

  const titleBlockCompact = (
    <div className="shrink-0">
      {badge && (
        <p
          className="text-[9px] font-semibold uppercase tracking-[0.28em] leading-none"
          style={{ color: 'var(--ps-accent-ink)' }}
        >
          {badge}
        </p>
      )}
      <h1 className="mt-0.5 whitespace-nowrap font-serif text-xl font-light tracking-tight text-stone-900 dark:text-stone-50 sm:text-2xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-0.5 max-w-[min(100%,14rem)] truncate text-[11px] text-stone-500 dark:text-stone-400 sm:max-w-[18rem]">
          {subtitle}
        </p>
      )}
    </div>
  );

  return (
    <header
      className={`mb-5 border bg-white px-5 sm:px-8 dark:bg-stone-950 ${dense ? 'py-3' : 'py-6'}`}
      style={ledgerPageHeaderStyle()}
    >
      {layout === 'toolbar' ? (
        <div className="flex min-w-0 items-center gap-3 overflow-x-auto [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden">
          {titleBlockCompact}
          {action ? <div className="min-w-0 flex-1">{action}</div> : null}
        </div>
      ) : layout === 'stacked' ? (
        <div className="flex flex-col gap-3">
          {titleBlock}
          {action}
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {titleBlock}
          {action}
        </div>
      )}
      {footer ? (
        <div
          className={`border-t ${dense ? 'mt-3 pt-3' : 'mt-5 pt-5'}`}
          style={{ borderColor: 'var(--ps-accent-border)' }}
        >
          {footer}
        </div>
      ) : null}
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

export function LoansStatGrid({
  stats,
  columns = 4,
}: {
  stats: LoansStatItem[];
  /** 4 = responsive 1/2/4 cols; 3 = single row of three KPIs; 5 = single row of five KPIs */
  columns?: 3 | 4 | 5;
}) {
  const gridClass =
    columns === 5
      ? 'mb-5 grid grid-cols-5 divide-x border bg-white dark:divide-stone-800 dark:bg-stone-950'
      : columns === 3
        ? 'mb-5 grid grid-cols-3 divide-x border bg-white dark:divide-stone-800 dark:bg-stone-950'
        : 'mb-5 grid grid-cols-1 divide-y border bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 lg:divide-y-0 dark:bg-stone-950';

  return (
    <section className={gridClass} style={{ borderColor: 'var(--ps-accent-border)' }}>
      {stats.map((stat) => (
        <LoansStat key={stat.label} {...stat} compact={columns === 5 || columns === 3} />
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
  compact,
}: LoansStatItem & { compact?: boolean }) {
  const padClass = compact ? 'px-3 py-3 sm:px-4' : 'px-5 py-4 sm:px-6';
  const valueSize = compact ? 'text-lg' : 'text-xl';

  if (highlight) {
    return (
      <div className={`${padClass} text-white`} style={{ backgroundColor: 'var(--ps-accent)' }}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/80">{label}</p>
        <p className={`mt-1 font-mono ${valueSize} font-medium tabular-nums`}>{value}</p>
      </div>
    );
  }

  return (
    <div className={padClass} style={accent ? { backgroundColor: 'var(--ps-accent-soft)' } : undefined}>
      <p
        className="text-[10px] uppercase tracking-[0.2em]"
        style={{ color: accent ? 'var(--ps-accent-ink)' : 'rgb(120 113 108)' }}
      >
        {label}
      </p>
      <p
        className={`mt-1 font-mono ${valueSize} font-medium tabular-nums ${
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
