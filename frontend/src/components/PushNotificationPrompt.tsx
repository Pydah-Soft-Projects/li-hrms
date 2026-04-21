'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Sparkles, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  HRMS_PUSH_SUBSCRIPTION_CHANGED,
  isPushEnvironmentSupported,
  requestPermissionAndSubscribe,
  syncPushSubscription,
} from '@/lib/pushNotificationClient';

const STORAGE_SNOOZE = 'hrms_push_prompt_snooze_until';
const STORAGE_SERVER_NOTICE_SNOOZE = 'hrms_push_server_notice_snooze_until';
const STORAGE_FETCH_ERROR_SNOOZE = 'hrms_push_fetch_error_snooze_until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_ERROR_SNOOZE_MS = 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 1800;

function resolveUserId(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null;
  const o = user as Record<string, unknown>;
  const raw = o.id ?? o._id;
  if (raw == null) return null;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (typeof raw === 'object' && raw !== null && '$oid' in raw && typeof (raw as { $oid: unknown }).$oid === 'string') {
    return (raw as { $oid: string }).$oid;
  }
  const s = String(raw);
  return s.length > 0 ? s : null;
}

function readSnoozeUntil(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(STORAGE_SNOOZE);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function snoozePrompt() {
  localStorage.setItem(STORAGE_SNOOZE, String(Date.now() + SNOOZE_MS));
}

function readServerNoticeSnoozeUntil(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(STORAGE_SERVER_NOTICE_SNOOZE);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function snoozeServerNotice() {
  localStorage.setItem(STORAGE_SERVER_NOTICE_SNOOZE, String(Date.now() + SNOOZE_MS));
}

function readFetchErrorSnoozeUntil(): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(STORAGE_FETCH_ERROR_SNOOZE);
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function snoozeFetchError() {
  localStorage.setItem(STORAGE_FETCH_ERROR_SNOOZE, String(Date.now() + FETCH_ERROR_SNOOZE_MS));
}

/** Avoid framer-motion's useReducedMotion (Turbopack/HMR can break that subpath). */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return reduced;
}

/**
 * Post-login, animated opt-in for Web Push. Browser permission dialog runs only after the user
 * taps "Turn on notifications" (required for good UX).
 */
export default function PushNotificationPrompt() {
  const { user, loading } = useAuth();
  const reduceMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<
    'hidden' | 'checking' | 'ready' | 'denied_tip' | 'server_notice' | 'fetch_error'
  >('hidden');
  const [busy, setBusy] = useState(false);
  const [serverPushReady, setServerPushReady] = useState(false);
  /** When `ready`: ask for permission vs only sync (permission already granted, subscription missing). */
  const [readyMode, setReadyMode] = useState<'permission' | 'sync_only'>('permission');

  const uid = useMemo(() => resolveUserId(user), [user]);

  useEffect(() => {
    const onServerSubscribed = () => {
      setPhase((prev) => (prev === 'ready' || prev === 'checking' ? 'hidden' : prev));
    };
    window.addEventListener(HRMS_PUSH_SUBSCRIPTION_CHANGED, onServerSubscribed);
    return () => window.removeEventListener(HRMS_PUSH_SUBSCRIPTION_CHANGED, onServerSubscribed);
  }, []);

  useEffect(() => {
    if (loading || !user || !uid) {
      setPhase('hidden');
      return;
    }
    if (!isPushEnvironmentSupported()) {
      setPhase('hidden');
      return;
    }

    let cancelled = false;
    /** Accommodate DOM (number) vs @types/node (NodeJS.Timeout) for `setTimeout` return type. */
    let showTimer: number | NodeJS.Timeout | undefined;

    const run = async () => {
      setPhase('checking');
      try {
        if (Notification.permission === 'granted') {
          try {
            const st = await api.getPushSubscriptionStatus();
            if (cancelled) return;
            if (st?.success && st.subscribed) {
              setPhase('hidden');
              return;
            }
          } catch {
            // Offer finish-setup below if VAPID is OK
          }
        }

        const cfg = await api.getPushVapidPublic();
        if (cancelled) return;

        if (!cfg?.success) {
          if (Date.now() < readFetchErrorSnoozeUntil()) {
            setPhase('hidden');
            return;
          }
          showTimer = window.setTimeout(() => {
            if (!cancelled) setPhase('fetch_error');
          }, SHOW_DELAY_MS);
          return;
        }

        if (!cfg.configured) {
          if (Date.now() < readServerNoticeSnoozeUntil()) {
            setPhase('hidden');
            return;
          }
          showTimer = window.setTimeout(() => {
            if (!cancelled) setPhase('server_notice');
          }, SHOW_DELAY_MS);
          return;
        }

        setServerPushReady(true);

        if (Date.now() < readSnoozeUntil()) {
          setPhase('hidden');
          return;
        }

        if (Notification.permission === 'denied') {
          setPhase('denied_tip');
          return;
        }

        showTimer = window.setTimeout(() => {
          if (!cancelled) {
            setReadyMode(Notification.permission === 'granted' ? 'sync_only' : 'permission');
            setPhase('ready');
          }
        }, SHOW_DELAY_MS);
      } catch {
        if (!cancelled) {
          if (Date.now() < readFetchErrorSnoozeUntil()) {
            setPhase('hidden');
          } else {
            showTimer = window.setTimeout(() => {
              if (!cancelled) setPhase('fetch_error');
            }, SHOW_DELAY_MS);
          }
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (showTimer) window.clearTimeout(showTimer);
    };
  }, [user, loading, uid]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    try {
      if (readyMode === 'sync_only') {
        const result = await syncPushSubscription();
        if (result.ok) {
          toast.success('This device is registered for push alerts.');
          setPhase('hidden');
        } else {
          toast.error('Could not save push subscription. Try again or check your connection.');
        }
        return;
      }

      const result = await requestPermissionAndSubscribe();
      if (result.ok) {
        toast.success('Notifications enabled — you will get alerts on this device.');
        setPhase('hidden');
      } else if (result.reason === 'denied') {
        setPhase('denied_tip');
        toast.info('Notifications are blocked for this site. You can enable them in browser settings.');
      } else if (result.reason === 'dismissed') {
        setPhase('hidden');
      } else {
        toast.error('Could not enable push. Try again later or check your connection.');
      }
    } finally {
      setBusy(false);
    }
  }, [readyMode]);

  const onLater = useCallback(() => {
    snoozePrompt();
    setPhase('hidden');
  }, []);

  const dismissDeniedTip = useCallback(() => {
    snoozePrompt();
    setPhase('hidden');
  }, []);

  const dismissServerOrFetch = useCallback(() => {
    if (phase === 'server_notice') snoozeServerNotice();
    else if (phase === 'fetch_error') snoozeFetchError();
    setPhase('hidden');
  }, [phase]);

  const showCard = phase === 'ready';
  const syncOnlyCard = showCard && readyMode === 'sync_only';
  const showDenied = phase === 'denied_tip';
  const showServerNotice = phase === 'server_notice';
  const showFetchError = phase === 'fetch_error';
  const isAdminEnvHint =
    user?.role === 'super_admin' || user?.role === 'sub_admin' || user?.roles?.includes('super_admin');

  return (
    <AnimatePresence>
      {(showCard || showDenied || showServerNotice || showFetchError) && (
        <motion.div
          role="dialog"
          aria-labelledby="push-prompt-title"
          aria-describedby="push-prompt-desc"
          initial={{ opacity: 0, y: 48, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 32, scale: 0.96 }}
          transition={
            reduceMotion
              ? { duration: 0.15 }
              : { type: 'spring', stiffness: 380, damping: 28 }
          }
          className="pointer-events-auto fixed inset-x-3 bottom-4 z-[50050] pb-[env(safe-area-inset-bottom)] md:inset-auto md:bottom-6 md:right-6 md:left-auto md:w-[min(100%,420px)]"
        >
          <div
            className={`relative overflow-hidden rounded-2xl border p-5 shadow-[0_25px_50px_-12px_rgba(79,70,229,0.25)] backdrop-blur-xl dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)] ${
              showServerNotice || showFetchError
                ? 'border-amber-200/80 bg-amber-50/95 dark:border-amber-500/30 dark:bg-slate-950/95'
                : 'border-indigo-200/70 bg-white/95 dark:border-indigo-500/25 dark:bg-slate-950/95'
            }`}
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-400/30 to-violet-500/20 blur-2xl dark:from-indigo-500/20 dark:to-violet-600/15" />
            <div className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-gradient-to-tr from-sky-400/20 to-indigo-400/15 blur-2xl dark:from-sky-500/10 dark:to-indigo-500/10" />

            <button
              type="button"
              onClick={
                showDenied
                  ? dismissDeniedTip
                  : showServerNotice || showFetchError
                    ? dismissServerOrFetch
                    : onLater
              }
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative flex gap-4">
              <div
                className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${
                  showServerNotice || showFetchError
                    ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/25'
                    : 'bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/30'
                }`}
              >
                {!reduceMotion && !showServerNotice && !showFetchError && (
                  <motion.span
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                    className="absolute inset-0 rounded-2xl bg-white/10"
                  />
                )}
                <Bell className="relative h-7 w-7" strokeWidth={2} />
              </div>

              <div className="min-w-0 flex-1 pr-6">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h2 id="push-prompt-title" className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                    {showDenied
                      ? 'Notifications are off'
                      : showServerNotice
                        ? 'Browser push is not enabled'
                        : showFetchError
                          ? 'Could not load push settings'
                          : syncOnlyCard
                            ? 'Finish push setup'
                            : 'Stay in the loop'}
                  </h2>
                  {!showDenied && !showServerNotice && !showFetchError && !syncOnlyCard && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-200">
                      <Sparkles className="h-3 w-3" />
                      Recommended
                    </span>
                  )}
                </div>
                <p id="push-prompt-desc" className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {showDenied ? (
                    <>
                      This browser is blocking site notifications. Use the lock or tune icon in the address bar →
                      Site settings → Notifications → <strong className="text-slate-800 dark:text-slate-100">Allow</strong> for
                      this site, then tap <strong className="text-slate-800 dark:text-slate-100">Allow now</strong> below to
                      finish setup.
                    </>
                  ) : showServerNotice ? (
                    <>
                      This server is not configured for Web Push yet (missing VAPID keys on the API). In-app alerts in
                      LI-HRMS still work as usual.
                      {isAdminEnvHint ? (
                        <>
                          {' '}
                          Add <strong className="text-slate-800 dark:text-slate-100">VAPID_PUBLIC_KEY</strong> and{' '}
                          <strong className="text-slate-800 dark:text-slate-100">VAPID_PRIVATE_KEY</strong> to the backend{' '}
                          <code className="rounded bg-white/60 px-1 py-0.5 text-xs dark:bg-slate-800/80">.env</code> (see{' '}
                          <code className="rounded bg-white/60 px-1 py-0.5 text-xs dark:bg-slate-800/80">.env.example</code>
                          ), restart the API, and reload this page.
                        </>
                      ) : null}
                    </>
                  ) : showFetchError ? (
                    <>
                      We could not reach <strong className="text-slate-800 dark:text-slate-100">/notifications/push/vapid-public</strong> on
                      your API. Check <code className="rounded bg-white/60 px-1 py-0.5 text-xs dark:bg-slate-800/80">NEXT_PUBLIC_API_URL</code>,
                      CORS, and that the backend is running.
                    </>
                  ) : syncOnlyCard ? (
                    <>
                      This site can already show notifications. Tap below to{' '}
                      <strong className="text-slate-800 dark:text-slate-100">save this device</strong> to your account so
                      HR alerts work when LI-HRMS is in the background.
                    </>
                  ) : (
                    <>
                      Turn on <strong className="text-slate-800 dark:text-slate-100">browser notifications</strong> so
                      HR updates reach you even when LI-HRMS is closed — leaves, salary changes, transfers, and more.
                    </>
                  )}
                </p>

                {!showDenied && !showServerNotice && !showFetchError && !syncOnlyCard && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    When you tap below, your browser will ask permission — we only prompt once you choose to enable.
                  </p>
                )}
                {syncOnlyCard && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    No extra permission prompt — we only register this browser with the server.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {showDenied && (
                    <button
                      type="button"
                      disabled={busy || !serverPushReady}
                      onClick={onEnable}
                      className="inline-flex min-h-[44px] min-w-[160px] items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? 'Checking…' : 'Allow now'}
                    </button>
                  )}
                  {!showDenied && !showServerNotice && !showFetchError && (
                    <button
                      type="button"
                      disabled={busy || !serverPushReady}
                      onClick={onEnable}
                      className="inline-flex min-h-[44px] min-w-[160px] items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy
                        ? syncOnlyCard
                          ? 'Saving…'
                          : 'Opening browser prompt…'
                        : syncOnlyCard
                          ? 'Save on this device'
                          : 'Turn on notifications'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={
                      showDenied
                        ? dismissDeniedTip
                        : showServerNotice || showFetchError
                          ? dismissServerOrFetch
                          : onLater
                    }
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white/80 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {showDenied ? 'Got it' : showServerNotice || showFetchError ? 'Dismiss' : 'Maybe later'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
