'use client';

import { useCallback, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { api } from '@/lib/api';
import { alertError } from '@/lib/customSwal';

export default function TicketSupportBubble() {
  const [loading, setLoading] = useState(false);

  const openPortal = useCallback(async () => {
    if (loading) return;

    setLoading(true);
    try {
      const response = await api.getTicketSsoUrl();
      if (response.success && response.data?.url) {
        window.location.href = response.data.url;
        return;
      }
      await alertError(
        'Ticket portal unavailable',
        response.message || 'Could not open the ticket management portal. Please try again later.'
      );
    } catch {
      await alertError(
        'Ticket portal unavailable',
        'Could not connect to generate a login link. Please try again later.'
      );
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return (
    <div className="fixed right-3 z-[60] bottom-[max(5.75rem,calc(4.5rem+env(safe-area-inset-bottom,0px)))] sm:bottom-6 sm:right-6">
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        aria-label="Raise a ticket for any queries"
        className="group flex flex-row items-end gap-2.5 sm:flex-col sm:items-end sm:gap-0 disabled:cursor-wait disabled:opacity-80"
      >
        {/* Speech bubble — left of icon on mobile, above on desktop */}
        <div className="relative w-[min(calc(100vw-5.5rem),188px)] shrink rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-left shadow-[0_8px_28px_-6px_rgba(15,23,42,0.18)] transition group-hover:shadow-[0_12px_32px_-6px_rgba(13,148,136,0.28)] dark:border-slate-700 dark:bg-slate-900 sm:mb-1.5 sm:w-[210px] sm:px-3.5">
          {loading ? (
            <p className="text-xs font-medium text-teal-700 dark:text-teal-300">Opening ticket portal…</p>
          ) : (
            <>
              <p className="text-[12px] font-semibold leading-snug text-slate-800 dark:text-slate-100 sm:text-[13px]">
                <span aria-hidden>👋</span> Have any queries?
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400 sm:text-[11px]">
                Click here to{' '}
                <span className="font-semibold text-teal-700 dark:text-teal-300">raise a ticket</span>.
              </p>
            </>
          )}
          {/* Mobile: tail points right toward icon */}
          <div
            className="absolute top-1/2 -right-1.5 h-3 w-3 -translate-y-1/2 rotate-45 border-t border-r border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900 sm:hidden"
            aria-hidden
          />
          {/* Desktop: tail points down toward icon */}
          <div
            className="absolute -bottom-1.5 right-5 hidden h-3 w-3 rotate-45 border-b border-r border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900 sm:block"
            aria-hidden
          />
        </div>

        <div className="hidden flex-col items-end sm:flex">
          <div
            className="mb-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-teal-500 bg-white shadow-sm dark:bg-slate-900"
            aria-hidden
          >
            <div className="h-1.5 w-1.5 rounded-full bg-teal-500" />
          </div>
        </div>

        <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-[3px] border-teal-500 bg-gradient-to-br from-teal-50 to-emerald-50 shadow-[0_10px_28px_-6px_rgba(13,148,136,0.55)] transition group-hover:scale-105 group-hover:border-teal-600 dark:from-teal-950/80 dark:to-emerald-950/60 sm:h-[60px] sm:w-[60px]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-inner sm:h-[46px] sm:w-[46px]">
            <LifeBuoy className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
          </div>
        </div>
      </button>
    </div>
  );
}
