import Swal, { type SweetAlertOptions } from 'sweetalert2';
import { getCachedCompanyAccentColor } from '@/lib/companyProfile';

const CONFIRM_BTN =
  'swal2-confirm rounded-xl px-6 py-2.5 text-white font-semibold shadow-sm transition-all duration-200 focus:ring-2 focus:ring-offset-2';
const CANCEL_BTN =
  'swal2-cancel rounded-xl px-6 py-2.5 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold border border-gray-200 dark:border-slate-600 shadow-sm hover:bg-gray-50 dark:hover:bg-slate-600 transition-all duration-200 focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 ml-3';

export const customSwal = Swal.mixin({
  customClass: {
    confirmButton: CONFIRM_BTN,
    cancelButton: CANCEL_BTN,
    popup: 'rounded-3xl border-0 shadow-2xl p-8 bg-white dark:bg-[#1E293B]',
    title: 'text-2xl font-bold text-gray-900 dark:text-white',
    htmlContainer: 'text-gray-600 dark:text-gray-300 font-medium leading-relaxed',
    icon: 'border-0 scale-110 mb-2',
  },
  buttonsStyling: false,
  showClass: {
    popup: 'animate__animated animate__fadeInDown animate__faster',
  },
  hideClass: {
    popup: 'animate__animated animate__fadeOutUp animate__faster',
  },
});

function applyCompanyAccentToPopup(popup: HTMLElement, accent: string, icon?: SweetAlertOptions['icon']) {
  const confirm = popup.querySelector<HTMLElement>('.swal2-confirm');
  if (confirm) {
    confirm.style.backgroundColor = accent;
    confirm.style.borderColor = accent;
    confirm.style.setProperty('--tw-ring-color', accent);
  }
  const iconEl = popup.querySelector<HTMLElement>('.swal2-icon');
  if (iconEl && icon && icon !== 'error' && icon !== 'warning') {
    iconEl.style.color = accent;
    iconEl.style.borderColor = accent;
  }
}

function fireWithAccent(options: SweetAlertOptions) {
  const accent = getCachedCompanyAccentColor();
  const icon = options.icon;
  const iconColor =
    options.iconColor ??
    (icon === 'error' ? '#ef4444' : icon === 'warning' ? '#f59e0b' : accent);

  return customSwal.fire({
    ...options,
    iconColor,
    didOpen: (popup) => {
      applyCompanyAccentToPopup(popup, accent, icon);
      if (typeof options.didOpen === 'function') {
        options.didOpen(popup);
      }
    },
  });
}

export const alertSuccess = (title: string, text?: string) => {
  return fireWithAccent({
    icon: 'success',
    title,
    text,
    confirmButtonText: 'Got it',
  });
};

export const alertError = (title: string, text?: string) => {
  return fireWithAccent({
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Close',
  });
};

export const alertConfirm = (title: string, text: string, confirmText: string = 'Confirm') => {
  return fireWithAccent({
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
  });
};

export const alertLoading = (title: string, text?: string) => {
  const accent = getCachedCompanyAccentColor();
  return fireWithAccent({
    title,
    text,
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: (popup) => {
      applyCompanyAccentToPopup(popup, accent);
      Swal.showLoading();
    },
  });
};

export const closeAlert = () => {
  customSwal.close();
};
