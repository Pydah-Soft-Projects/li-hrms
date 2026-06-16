'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarRange, RefreshCw, Users, Wallet } from 'lucide-react';

export type PayRegisterSyncProgressEvent = {
  phase: 'prepare' | 'sync' | 'done' | 'error';
  completed?: number;
  total?: number;
  synced?: number;
  skippedLocked?: number;
  skippedPayrollCompleted?: number;
  failedCount?: number;
  success?: boolean;
  message?: string;
  data?: {
    month: string;
    total: number;
    synced: number;
    skippedLocked: number;
    skippedPayrollCompleted: number;
    failed: Array<{ employeeId: string; error: string }>;
    durationMs: number;
    avgMsPerEmployee: number;
  };
};

type Props = {
  visible: boolean;
  phase: PayRegisterSyncProgressEvent['phase'] | null;
  completed: number;
  total: number;
  monthLabel?: string;
};

function phaseLabel(phase: Props['phase']) {
  if (phase === 'prepare') return 'Finding employees in scope…';
  if (phase === 'sync') return 'Syncing pay register for each employee…';
  return 'Processing…';
}

function FloatingIcon({
  className,
  delay = 0,
  children,
}: {
  className?: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -6, 0], opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      {children}
    </motion.div>
  );
}

export default function PayRegisterSyncProgressOverlay({
  visible,
  phase,
  completed,
  total,
  monthLabel,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isSyncPhase = phase === 'sync';
  const pct =
    phase === 'prepare'
      ? 4
      : total > 0
        ? Math.min(100, Math.round((completed / total) * 100))
        : 0;

  const barLabel =
    isSyncPhase && total > 0
      ? `${completed} / ${total} employees`
      : phase === 'prepare'
        ? 'Preparing…'
        : phase === 'done' || phase === 'error'
          ? 'Finishing…'
          : 'Starting…';

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="relative h-36 overflow-hidden bg-gradient-to-b from-indigo-50 via-emerald-50/80 to-white dark:from-slate-800 dark:via-slate-800/90 dark:to-slate-900">
              <motion.div
                className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-emerald-200/50 blur-2xl dark:bg-emerald-500/15"
                animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.75, 0.5] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute -left-4 top-8 h-20 w-20 rounded-full bg-indigo-200/60 blur-2xl dark:bg-indigo-500/10"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
              />

              <FloatingIcon className="absolute left-6 top-7 text-indigo-500" delay={0}>
                <Wallet className="h-5 w-5" />
              </FloatingIcon>
              <FloatingIcon className="absolute right-8 top-10 text-emerald-500" delay={0.8}>
                <Users className="h-5 w-5" />
              </FloatingIcon>
              <FloatingIcon className="absolute left-[42%] top-5 text-violet-400" delay={1.4}>
                <RefreshCw className="h-4 w-4" />
              </FloatingIcon>

              <div className="absolute bottom-3 left-6 right-6">
                <div className="relative h-8">
                  <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-slate-300/80 dark:border-slate-600" />
                  <motion.div
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                    animate={{ left: `${Math.max(4, Math.min(96, pct))}%` }}
                    transition={{ type: 'spring', stiffness: 90, damping: 18 }}
                  >
                    <motion.div
                      animate={{ rotate: [-4, 4, -4], y: [0, -3, 0] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-200 bg-white shadow-md ring-2 ring-indigo-100 dark:border-indigo-800 dark:bg-slate-800 dark:ring-indigo-900/40"
                    >
                      <CalendarRange className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </motion.div>
                    <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-600/80 dark:text-indigo-400/80">
                      {pct}%
                    </span>
                  </motion.div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 pt-4">
              <div className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                Sync All · Pay Register{monthLabel ? ` · ${monthLabel}` : ''}
              </div>
              <p className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                {phaseLabel(phase)}
              </p>

              <div className="relative mt-5 h-11 w-full">
                <div className="absolute inset-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-emerald-500"
                    animate={{ width: `${pct}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                  />
                </div>

                <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-indigo-700 px-3 py-1 text-[11px] font-bold text-white shadow-lg ring-2 ring-white dark:ring-slate-900">
                    {barLabel}
                    {(isSyncPhase && total > 0) || pct > 0 ? (
                      <>
                        <span className="text-indigo-200">·</span>
                        <span>{pct}%</span>
                      </>
                    ) : null}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>0%</span>
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {isSyncPhase && total > 0
                    ? 'Building daily grid & monthly totals…'
                    : 'Please wait…'}
                </span>
                <span>100%</span>
              </div>

              <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
                Please wait — do not close this window.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
