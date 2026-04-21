'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isPushEnvironmentSupported, syncPushSubscription } from '@/lib/pushNotificationClient';

/**
 * If the user already granted notification permission (e.g. earlier session), re-register the
 * service worker and sync the push subscription — no permission dialog (the browser will not show
 * it again). Dashboard notification bell uses server push status (green / amber) instead of a toast.
 * First-time / default users see {@link PushNotificationPrompt} instead.
 */
export default function PushNotificationRegistrar() {
  const { user, loading } = useAuth();
  const lastUserId = useRef<string | null>(null);
  const synced = useRef(false);

  useEffect(() => {
    if (loading || !user) return;
    const uid = user.id || (user as { _id?: string })._id || null;
    if (!uid) return;
    if (typeof window === 'undefined') return;
    if (!isPushEnvironmentSupported()) return;

    if (lastUserId.current !== String(uid)) {
      lastUserId.current = String(uid);
      synced.current = false;
    }
    if (synced.current) return;
    if (Notification.permission !== 'granted') return;

    synced.current = true;
    void (async () => {
      try {
        const result = await syncPushSubscription();
        if (!result.ok) {
          synced.current = false;
          return;
        }
      } catch {
        synced.current = false;
      }
    })();
  }, [user, loading]);

  return null;
}
