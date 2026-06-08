/**
 * Ledger UI — shared visual language for Payslip, Loans, and future HR surfaces.
 *
 * Use this name when asking to style a page/section/dialog: "apply Ledger UI".
 *
 * Traits:
 * - White panels on soft accent-tinted page background
 * - Company accent via CSS vars (--ps-accent, --ps-accent-border, --ps-accent-soft, --ps-accent-ink)
 * - Page headers: ledgerPageHeaderStyle() — payslip-style accent gradient band
 * - Page width: LoansPageShell defaults to max-w-[1920px] (full workspace width)
 * - Serif titles, uppercase micro-labels (10px tracking)
 * - Flat borders (no heavy shadows / gradient cards)
 * - Monospace tabular nums for money
 *
 * Shell components: LoansPageShell, LoanDetailDialogShell, ModernPayslipView
 * Form helpers: LoanFormLabel, LoanDialogFooter, LoanDialogTypeToggle (LoanDetailDialogShell)
 * Ledger sections: LedgerApprovalTimeline, LedgerApprovalPanel, LedgerTransactionHistory,
 *   LedgerReleaseFundsPanel, LedgerRecordPaymentPanel (import from @/components/ledger)
 *
 * Pay component badges: ledgerPayComponentBadgeClass, ledgerPayComponentStripClass, ledgerPayComponentCardClass
 *
 * Applied on: payslip, loans, allowances-deductions, statutory-deductions, manual-deductions, arrears,
 *   DeductionForm, DeductionsPayrollSection (pay register embed), Sidebar, WorkspaceSidebar (LedgerSidebar)
 *
 * Future work: say "apply Ledger UI" to restyle any page, dialog, or section.
 */
import type { CSSProperties } from 'react';

export const LEDGER_UI_NAME = 'Ledger UI';

/** Payslip-style header band — accent wash fading into the panel. */
export function ledgerPageHeaderStyle(): CSSProperties {
  return {
    borderColor: 'var(--ps-accent-border)',
    backgroundImage: 'linear-gradient(180deg, var(--ps-accent-soft) 0%, transparent 100%)',
  };
}

export {
  PAYSLIP_ACCENT_FALLBACK,
  payslipAccentCssVars,
  resolvePayslipAccentHex,
  resolvePayslipAccentRgb,
  resolvePayslipAccentDarkRgb,
} from '@/lib/payslipTheme';

export type LedgerUiStatus = 'approved' | 'rejected' | 'current' | 'pending' | 'neutral';

export type LedgerPayComponentCategory = 'allowance' | 'deduction';

const ledgerMicroBadgeBase =
  'inline-flex items-center rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest border';

/** Allowance = emerald (credit). Deduction = rose (debit). */
export function ledgerPayComponentBadgeClass(category: LedgerPayComponentCategory): string {
  if (category === 'allowance') {
    return `${ledgerMicroBadgeBase} border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300`;
  }
  return `${ledgerMicroBadgeBase} border-rose-200/80 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300`;
}

/** Left accent strip on allowance/deduction cards. */
export function ledgerPayComponentStripClass(category: LedgerPayComponentCategory): string {
  return category === 'allowance'
    ? 'bg-emerald-600 dark:bg-emerald-500'
    : 'bg-rose-600 dark:bg-rose-500';
}

/** Card surface tint so allowance vs deduction rows are scannable at a glance. */
export function ledgerPayComponentCardClass(category: LedgerPayComponentCategory): string {
  if (category === 'allowance') {
    return 'border-emerald-200/90 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/30';
  }
  return 'border-rose-200/90 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/30';
}

export function ledgerStatusBadgeClass(status: LedgerUiStatus): string {
  const base =
    'inline-flex items-center rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest border';
  switch (status) {
    case 'approved':
      return `${base} border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300`;
    case 'rejected':
      return `${base} border-rose-200/80 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300`;
    case 'current':
      return `${base} border-[color:var(--ps-accent-border)] bg-[var(--ps-accent-soft)] text-[color:var(--ps-accent-ink)]`;
    default:
      return `${base} border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400`;
  }
}

export function ledgerStatusBadgeLabel(status: LedgerUiStatus): string {
  switch (status) {
    case 'approved':
      return 'Processed';
    case 'rejected':
      return 'Rejected';
    case 'current':
      return 'Your turn';
    case 'pending':
      return 'Pending';
    default:
      return '—';
  }
}

export function ledgerMoneyClass(debit = false): string {
  return debit
    ? 'font-mono text-base font-semibold tabular-nums text-rose-700 dark:text-rose-400'
    : 'font-mono text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400';
}
