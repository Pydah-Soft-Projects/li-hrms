'use client';

import type { CSSProperties, ReactNode } from 'react';

export function LoanDetailDialog({
  open,
  onClose,
  children,
  maxWidth = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-stone-900/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`relative z-50 flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden border bg-white shadow-2xl dark:bg-stone-950`}
        style={{ borderColor: 'var(--ps-accent-border)' }}
        role="dialog"
        aria-modal
      >
        {children}
      </div>
    </div>
  );
}

export function LoanDetailDialogHeader({
  badge,
  title,
  subtitle,
  actions,
  onClose,
}: {
  badge: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onClose: () => void;
}) {
  return (
    <header
      className="shrink-0 border-b bg-white px-5 py-5 sm:px-6 dark:bg-stone-950"
      style={{ borderColor: 'var(--ps-accent-border)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.32em]"
            style={{ color: 'var(--ps-accent-ink)' }}
          >
            {badge}
          </p>
          <h2 className="mt-1 font-serif text-xl font-light tracking-tight text-stone-900 dark:text-stone-50 sm:text-2xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
          )}
          <div className="mt-3 h-0.5 w-12 rounded-full" style={{ backgroundColor: 'var(--ps-accent)' }} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border p-2 text-stone-500 transition hover:bg-stone-50 hover:text-stone-800 dark:hover:bg-stone-900 dark:hover:text-stone-200"
            style={{ borderColor: 'var(--ps-accent-border)' }}
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export function LoanDetailDialogBody({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6"
      style={{ backgroundColor: 'rgba(var(--ps-accent-rgb), 0.02)' }}
    >
      {children}
    </div>
  );
}

export function LoanDetailSection({
  children,
  className = '',
  soft,
  highlight,
}: {
  children: ReactNode;
  className?: string;
  soft?: boolean;
  highlight?: boolean;
}) {
  const style: CSSProperties = highlight
    ? { borderColor: 'var(--ps-accent-border)', backgroundColor: 'var(--ps-accent-soft)' }
    : soft
      ? { borderColor: 'var(--ps-accent-border)', backgroundColor: 'rgba(var(--ps-accent-rgb), 0.04)' }
      : { borderColor: 'var(--ps-accent-border)' };

  return (
    <section
      className={`border bg-white p-4 dark:bg-stone-950 ${className}`}
      style={style}
    >
      {children}
    </section>
  );
}

export function LoanDetailSectionTitle({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] ${className}`}
      style={{ color: 'var(--ps-accent-ink)' }}
    >
      {children}
    </h3>
  );
}

export function LoanDetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="border bg-white p-3 dark:bg-stone-950"
      style={{ borderColor: 'var(--ps-accent-border)' }}
    >
      <p
        className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
        style={{ color: 'var(--ps-accent-ink)' }}
      >
        {label}
      </p>
      <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{children}</div>
    </div>
  );
}

export function loansDialogOutlineButtonClass() {
  return 'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition hover:opacity-80 disabled:opacity-40';
}

export function loansDialogOutlineButtonStyle(): CSSProperties {
  return { borderColor: 'var(--ps-accent-border)', color: 'var(--ps-accent)' };
}

export function loansDialogPrimaryButtonClass(fullWidth = false) {
  return `${fullWidth ? 'w-full ' : ''}inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-40`;
}

export function loansDialogPrimaryButtonStyle(): CSSProperties {
  return { backgroundColor: 'var(--ps-accent)' };
}

export function loansDialogSecondaryButtonClass() {
  return 'inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition hover:opacity-80 disabled:opacity-40';
}

export function loansDialogSecondaryButtonStyle(): CSSProperties {
  return { borderColor: 'var(--ps-accent-border)', color: 'rgb(87 83 78)' };
}

export function loansDialogDangerButtonClass() {
  return 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white bg-rose-600 transition hover:bg-rose-700 disabled:opacity-40';
}

export function loansDialogSuccessButtonClass() {
  return 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white bg-emerald-600 transition hover:bg-emerald-700 disabled:opacity-40';
}
