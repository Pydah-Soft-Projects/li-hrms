import Swal from 'sweetalert2';

export const customSwal = Swal.mixin({
    customClass: {
        confirmButton: 'rounded-xl px-6 py-2.5 bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700 transition-all duration-200 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
        cancelButton: 'rounded-xl px-6 py-2.5 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200 font-semibold border border-gray-200 dark:border-slate-600 shadow-sm hover:bg-gray-50 dark:hover:bg-slate-600 transition-all duration-200 focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 ml-3',
        popup: 'rounded-3xl border-0 shadow-2xl p-8 bg-white dark:bg-[#1E293B]',
        title: 'text-2xl font-bold text-gray-900 dark:text-white',
        htmlContainer: 'text-gray-600 dark:text-gray-300 font-medium leading-relaxed',
        icon: 'border-0 scale-110 mb-2'
    },
    buttonsStyling: false,
    showClass: {
        popup: 'animate__animated animate__fadeInDown animate__faster'
    },
    hideClass: {
        popup: 'animate__animated animate__fadeOutUp animate__faster'
    }
});

export const alertSuccess = (title: string, text?: string) => {
    return customSwal.fire({
        icon: 'success',
        title,
        text,
        iconColor: '#4f46e5', // indigo-600
        confirmButtonText: 'Got it',
    });
};

export const alertError = (title: string, text?: string) => {
    return customSwal.fire({
        icon: 'error',
        title,
        text,
        iconColor: '#ef4444', // red-500
        confirmButtonText: 'Close',
    });
};

export const alertConfirm = (title: string, text: string, confirmText: string = 'Confirm') => {
    return customSwal.fire({
        icon: 'question',
        title,
        text,
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: 'Cancel',
        iconColor: '#4f46e5',
    });
};

export const alertLoading = (title: string, text?: string) => {
    return customSwal.fire({
        title,
        text,
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
            customSwal.showLoading();
        }
    });
};
