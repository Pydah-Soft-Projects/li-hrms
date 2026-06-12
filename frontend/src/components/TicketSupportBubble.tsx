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
    <div className="fixed bottom-20 right-4 z-[60] sm:bottom-6 sm:right-6 pb-[env(safe-area-inset-bottom)]">
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        aria-label="Raise a ticket for any queries"
        className="group flex flex-col items-center disabled:cursor-wait disabled:opacity-80"
      >
        {/* Speech bubble */}
        <div className="relative mb-1 w-[max(168px,52vw)] max-w-[210px] rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-left shadow-[0_8px_28px_-6px_rgba(15,23,42,0.18)] transition group-hover:shadow-[0_12px_32px_-6px_rgba(13,148,136,0.28)] dark:border-slate-700 dark:bg-slate-900">
          {loading ? (
            <p className="text-xs font-medium text-teal-700 dark:text-teal-300">Opening ticket portal…</p>
          ) : (
            <>
              <p className="text-[13px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
                <span aria-hidden>👋</span> Have any queries?
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Click here to{' '}
                <span className="font-semibold text-teal-700 dark:text-teal-300">raise a ticket</span>.
              </p>
            </>
          )}
          {/* Bubble tail */}
          <div
            className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900"
            aria-hidden
          />
        </div>

        {/* Connector dot */}
        <div
          className="mb-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-teal-500 bg-white shadow-sm dark:bg-slate-900"
          aria-hidden
        >
          <div className="h-1.5 w-1.5 rounded-full bg-teal-500" />
        </div>

        {/* Circular FAB */}
        <div className="relative flex h-[60px] w-[60px] items-center justify-center rounded-full border-[3px] border-teal-500 bg-gradient-to-br from-teal-50 to-emerald-50 shadow-[0_10px_28px_-6px_rgba(13,148,136,0.55)] transition group-hover:scale-105 group-hover:border-teal-600 dark:from-teal-950/80 dark:to-emerald-950/60 sm:h-[68px] sm:w-[68px]">
          <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-inner sm:h-[52px] sm:w-[52px]">
            <LifeBuoy className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} />
          </div>
        </div>
      </button>
    </div>
  );
}
