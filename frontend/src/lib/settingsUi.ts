import type { CSSProperties } from 'react';
import {
  loansFormInputClass,
  loansFormInputStyle,
  loansFormLabelClass,
  loansFormLabelStyle,
  loansDialogPrimaryButtonClass,
  loansDialogPrimaryButtonStyle,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { loansPrimaryButtonClass, loansPrimaryButtonStyle } from '@/components/loans/LoansPageShell';

/** Ledger border token for settings surfaces */
export const settingsLedgerBorder: CSSProperties = { borderColor: 'var(--ps-accent-border)' };

/** Flat ledger card — no heavy shadows */
export const settingsCardClass =
  'overflow-hidden border bg-white dark:bg-stone-950';

export const settingsCardHeaderClass =
  'border-b px-4 py-4 sm:px-6 sm:py-5';

export const settingsCardBodyClass = 'p-4 sm:p-6 lg:p-8';

export const settingsSectionTitleClass =
  'text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500 dark:text-stone-400';

export const settingsPanelTitleClass =
  'text-lg font-semibold text-stone-900 dark:text-stone-100 sm:text-xl';

export const settingsPanelSubtitleClass =
  'mt-1 text-xs text-stone-500 dark:text-stone-400 sm:text-sm';

export const settingsFieldHelpClass =
  'mt-1.5 text-[10px] leading-relaxed text-stone-500 dark:text-stone-400 sm:text-xs';

export const settingsNavGroupClass =
  'mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400 sm:px-4';

export const settingsNavItemBaseClass =
  'group flex w-full items-center justify-between border px-3 py-2 text-xs font-semibold transition-all sm:px-4 sm:py-2.5 sm:text-sm';

export const settingsNavItemActiveClass =
  'border-[color:var(--ps-accent-border)] bg-[var(--ps-accent-soft)] text-[color:var(--ps-accent-ink)]';

export const settingsNavItemInactiveClass =
  'border-transparent text-stone-500 hover:border-stone-200 hover:bg-stone-50 hover:text-stone-900 dark:text-stone-400 dark:hover:border-stone-800 dark:hover:bg-stone-900 dark:hover:text-stone-100';

export const settingsToggleTrackClass = (on: boolean) =>
  `relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--ps-accent)] focus:ring-offset-2 ${
    on ? 'bg-[var(--ps-accent)]' : 'bg-stone-200 dark:bg-stone-700'
  }`;

export const settingsToggleThumbClass = (on: boolean) =>
  `pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
    on ? 'translate-x-5' : 'translate-x-1'
  }`;

export const settingsInputClass = loansFormInputClass;
export const settingsInputStyle = loansFormInputStyle;
export const settingsLabelClass = loansFormLabelClass;
export const settingsLabelStyle = loansFormLabelStyle;
export const settingsSaveButtonClass = loansPrimaryButtonClass;
export const settingsSaveButtonStyle = loansPrimaryButtonStyle;
export const settingsOutlineButtonClass = loansDialogOutlineButtonClass;
export const settingsOutlineButtonStyle = loansDialogOutlineButtonStyle;
export const settingsPrimaryButtonClass = loansDialogPrimaryButtonClass;
export const settingsPrimaryButtonStyle = loansDialogPrimaryButtonStyle;

/** Legacy departmental constants — map to ledger */
export const DEPT_CARD = settingsCardClass;
export const DEPT_CARD_HEADER = `${settingsCardHeaderClass}`;
export const DEPT_CARD_TITLE = settingsPanelTitleClass.replace('text-lg', 'text-base');
export const DEPT_CARD_DESC = settingsPanelSubtitleClass;
export const DEPT_INPUT = settingsInputClass();
export const DEPT_LABEL = `${settingsLabelClass()} mb-1.5 block`;
export const DEPT_NAV_GROUP = settingsNavGroupClass;
export const DEPT_FIELD_HELP = settingsFieldHelpClass;
