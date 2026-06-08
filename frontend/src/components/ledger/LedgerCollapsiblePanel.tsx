'use client';

import type { ReactNode } from 'react';
import { LoanDetailSectionTitle } from '@/components/loans/LoanDetailDialogShell';
import { ledgerPageHeaderStyle } from '@/lib/ledgerUi';

type LedgerCollapsiblePanelProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** Ledger UI collapsible block (e.g. bulk create on manual deductions). */
export function LedgerCollapsiblePanel({
  title,
  subtitle,
  icon,
  open,
  onToggle,
  children,
}: LedgerCollapsiblePanelProps) {
  return (
    <div className="border bg-white dark:bg-stone-950" style={{ borderColor: 'var(--ps-accent-border)' }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 bg-white px-5 py-5 text-left transition hover:opacity-95 dark:bg-stone-950 sm:px-6"
        style={ledgerPageHeaderStyle()}
      >
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center"
              style={{ backgroundColor: 'var(--ps-accent-soft)', color: 'var(--ps-accent)' }}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <LoanDetailSectionTitle className="mb-0">{title}</LoanDetailSectionTitle>
            {subtitle && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>}
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--ps-accent-ink)' }}>
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t px-5 py-5 sm:px-6" style={{ borderColor: 'var(--ps-accent-border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
