import Swal, { type SweetAlertOptions } from 'sweetalert2';
import { getCachedCompanyAccentColor } from '@/lib/companyProfile';
import { PAYSLIP_ACCENT_FALLBACK, payslipAccentCssVars } from '@/lib/payslipTheme';

export type LedgerSwalConfirmVariant = 'primary' | 'danger' | 'success';

export type LedgerSwalSize = 'sm' | 'md' | 'lg';

export type LedgerSwalOptions = SweetAlertOptions & {
  /** Primary (accent), danger (rose delete), or success (emerald) */
  confirmVariant?: LedgerSwalConfirmVariant;
  /** sm = confirm toasts · md = default · lg = tables / wide content */
  size?: LedgerSwalSize;
};

const LEDGER_CONFIRM_BASE =
  'swal2-confirm ledger-swal-btn inline-flex items-center justify-center gap-1.5 uppercase tracking-wider';
const LEDGER_CANCEL_BASE =
  'swal2-cancel ledger-swal-btn ledger-swal-btn-outline inline-flex items-center justify-center gap-1.5 uppercase tracking-wider ml-2';

export const customSwal = Swal.mixin({
  customClass: {
    container: 'ledger-swal-container',
    popup: 'ledger-swal-popup',
    header: 'ledger-swal-header',
    title: 'ledger-swal-title',
    htmlContainer: 'ledger-swal-html',
    actions: 'ledger-swal-actions',
    confirmButton: LEDGER_CONFIRM_BASE,
    cancelButton: LEDGER_CANCEL_BASE,
    icon: 'ledger-swal-icon',
  },
  buttonsStyling: false,
  backdrop: 'ledger-swal-backdrop',
  showClass: {
    popup: 'ledger-swal-show',
  },
  hideClass: {
    popup: 'ledger-swal-hide',
  },
});

function resolveConfirmVariant(
  options: LedgerSwalOptions,
): LedgerSwalConfirmVariant {
  if (options.confirmVariant) return options.confirmVariant;
  if (options.icon === 'error') return 'danger';
  if (options.icon === 'success') return 'success';
  return 'primary';
}

function applyLedgerPopupStyles(popup: HTMLElement, options: LedgerSwalOptions) {
  const accentHex = getCachedCompanyAccentColor() || PAYSLIP_ACCENT_FALLBACK;
  const vars = payslipAccentCssVars(accentHex);
  for (const [key, value] of Object.entries(vars)) {
    popup.style.setProperty(key, value);
  }

  const header = popup.querySelector<HTMLElement>('.swal2-header');
  if (header) {
    header.style.borderBottom = '1px solid var(--ps-accent-border)';
    header.style.backgroundImage =
      'linear-gradient(180deg, var(--ps-accent-soft) 0%, transparent 100%)';
  }

  const actions = popup.querySelector<HTMLElement>('.swal2-actions');
  if (actions) {
    actions.style.borderTop = '1px solid var(--ps-accent-border)';
  }

  const confirm = popup.querySelector<HTMLElement>('.swal2-confirm');
  if (confirm) {
    confirm.classList.remove(
      'ledger-swal-btn-primary',
      'ledger-swal-btn-danger',
      'ledger-swal-btn-success',
    );
    const variant = resolveConfirmVariant(options);
    confirm.classList.add(
      variant === 'danger'
        ? 'ledger-swal-btn-danger'
        : variant === 'success'
          ? 'ledger-swal-btn-success'
          : 'ledger-swal-btn-primary',
    );
  }

  popup.classList.remove('ledger-swal-popup-sm', 'ledger-swal-popup-md', 'ledger-swal-popup-lg');
  const size = options.size ?? (options.html ? 'lg' : 'sm');
  popup.classList.add(
    size === 'lg' ? 'ledger-swal-popup-lg' : size === 'md' ? 'ledger-swal-popup-md' : 'ledger-swal-popup-sm',
  );

  const iconEl = popup.querySelector<HTMLElement>('.swal2-icon');
  if (iconEl && options.icon) {
    if (size === 'lg') {
      iconEl.style.transform = 'scale(0.72)';
      iconEl.style.margin = '0.25rem auto 0 !important';
    }
    if (options.icon === 'warning') {
      iconEl.style.color = '#d97706';
      iconEl.style.borderColor = 'rgba(217, 119, 6, 0.35)';
    } else if (options.icon === 'error') {
      iconEl.style.color = '#e11d48';
      iconEl.style.borderColor = 'rgba(225, 29, 72, 0.35)';
    } else if (options.icon === 'success') {
      iconEl.style.color = '#059669';
      iconEl.style.borderColor = 'rgba(5, 150, 105, 0.35)';
    } else {
      iconEl.style.color = 'var(--ps-accent)';
      iconEl.style.borderColor = 'var(--ps-accent-border)';
    }
  }
}

function resolveIconColor(options: LedgerSwalOptions): string | undefined {
  if (options.iconColor) return options.iconColor as string;
  if (options.icon === 'error') return '#e11d48';
  if (options.icon === 'warning') return '#d97706';
  if (options.icon === 'success') return '#059669';
  return getCachedCompanyAccentColor() || PAYSLIP_ACCENT_FALLBACK;
}

/** Ledger-styled SweetAlert — use instead of raw `Swal.fire` for app-wide consistency. */
export function ledgerSwalFire(options: LedgerSwalOptions) {
  return customSwal.fire({
    ...options,
    iconColor: resolveIconColor(options),
    didOpen: (popup) => {
      applyLedgerPopupStyles(popup, options);
      if (typeof options.didOpen === 'function') {
        options.didOpen(popup);
      }
    },
  });
}

export const alertSuccess = (title: string, text?: string) => {
  return ledgerSwalFire({
    icon: 'success',
    title,
    text,
    confirmButtonText: 'Done',
    confirmVariant: 'success',
    size: 'sm',
  });
};

export const alertError = (title: string, text?: string) => {
  return ledgerSwalFire({
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Close',
    confirmVariant: 'danger',
    size: 'sm',
  });
};

export const alertConfirm = (title: string, text: string, confirmText: string = 'Confirm') => {
  return ledgerSwalFire({
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
    confirmVariant: 'primary',
    size: 'sm',
  });
};

export const alertLoading = (title: string, text?: string) => {
  return ledgerSwalFire({
    title,
    text,
    allowOutsideClick: false,
    showConfirmButton: false,
    size: 'sm',
    didOpen: (popup) => {
      applyLedgerPopupStyles(popup, { size: 'sm' });
      Swal.showLoading();
    },
  });
};

export const closeAlert = () => {
  customSwal.close();
};
