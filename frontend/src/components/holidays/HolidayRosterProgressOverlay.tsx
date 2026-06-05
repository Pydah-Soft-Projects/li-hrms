'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Palmtree, Sparkles, Sun } from 'lucide-react';

export type HolidaySaveProgressEvent = {
  phase: 'saved' | 'cleanup' | 'apply' | 'done' | 'error';
  completed?: number;
  total?: number;
  success?: boolean;
  message?: string;
  affectedEmployees?: number;
};

type Props = {
  visible: boolean;
  phase: HolidaySaveProgressEvent['phase'] | null;
  completed: number;
  total: number;
  isUpdate?: boolean;
};

function phaseLabel(phase: Props['phase'], isUpdate: boolean) {
  if (phase === 'cleanup') return 'Removing previous holiday roster';
  if (phase === 'apply') return isUpdate ? 'Applying updated holiday' : 'Applying holiday';
  if (phase === 'saved') return 'Holiday saved — preparing roster';
  return 'Processing';
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

export default function HolidayRosterProgressOverlay({
  visible,
  phase,
  completed,
  total,
  isUpdate = false,
}: Props) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const showCount = phase === 'apply' || phase === 'cleanup';
  const barLabel =
    showCount && total > 0
      ? `${completed} / ${total} employees`
      : phase === 'saved'
        ? 'Preparing…'
        : 'Starting…';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            {/* Animatic header scene */}
            <div className="relative h-36 overflow-hidden bg-gradient-to-b from-sky-50 via-amber-50/80 to-white dark:from-slate-800 dark:via-slate-800/90 dark:to-slate-900">
              <motion.div
                className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-amber-200/50 blur-2xl dark:bg-amber-500/15"
                animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.75, 0.5] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute -left-4 top-8 h-20 w-20 rounded-full bg-sky-200/60 blur-2xl dark:bg-sky-500/10"
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
              />

              <FloatingIcon className="absolute left-6 top-7 text-amber-500" delay={0}>
                <Sun className="h-5 w-5" />
              </FloatingIcon>
              <FloatingIcon className="absolute right-8 top-10 text-emerald-500" delay={0.8}>
                <Palmtree className="h-5 w-5" />
              </FloatingIcon>
              <FloatingIcon className="absolute left-[42%] top-5 text-blue-400" delay={1.4}>
                <Sparkles className="h-4 w-4" />
              </FloatingIcon>

              {/* Calendar object — travels along dotted runway tied to progress */}
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
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200 bg-white shadow-md ring-2 ring-blue-100 dark:border-blue-800 dark:bg-slate-800 dark:ring-blue-900/40"
                    >
                      <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </motion.div>
                    <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-600/80 dark:text-blue-400/80">
                      {pct}%
                    </span>
                  </motion.div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 pt-4">
              <div className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                {isUpdate ? 'Updating holiday' : 'Creating holiday'}
              </div>
              <p className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
                {phaseLabel(phase, isUpdate)}
              </p>

              <div className="relative mt-5 h-11 w-full">
                <div className="absolute inset-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-500"
                    animate={{ width: `${pct}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                  />
                </div>

                <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-blue-700 px-3 py-1 text-[11px] font-bold text-white shadow-lg ring-2 ring-white dark:ring-slate-900">
                    {barLabel}
                    {(showCount && total > 0) || pct > 0 ? (
                      <>
                        <span className="text-blue-200">·</span>
                        <span>{pct}%</span>
                      </>
                    ) : null}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>0%</span>
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {showCount && total > 0
                    ? 'Applying holiday for each employee…'
                    : 'Starting…'}
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
    </AnimatePresence>
  );
}
