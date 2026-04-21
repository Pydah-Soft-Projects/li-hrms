'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { HRMS_PUSH_SUBSCRIPTION_CHANGED, isPushEnvironmentSupported } from '@/lib/pushNotificationClient';

/**
 * Loads whether the current account has at least one Web Push subscription saved on the server.
 * Refreshes when {@link HRMS_PUSH_SUBSCRIPTION_CHANGED} fires (after subscribe / sync).
 */
export function useDashboardPushBell(enabled: boolean) {
  const [pushSubscribed, setPushSubscribed] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || typeof window === 'undefined') {
      setPushSubscribed(null);
      return;
    }
    if (!isPushEnvironmentSupported()) {
      setPushSubscribed(false);
      return;
    }
    try {
      const res = await api.getPushSubscriptionStatus();
      if (res?.success && typeof res.subscribed === 'boolean') {
        setPushSubscribed(res.subscribed);
      } else {
        setPushSubscribed(false);
      }
    } catch {
      setPushSubscribed(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const handler = () => void refresh();
    window.addEventListener(HRMS_PUSH_SUBSCRIPTION_CHANGED, handler);
    return () => window.removeEventListener(HRMS_PUSH_SUBSCRIPTION_CHANGED, handler);
  }, [enabled, refresh]);

  return { pushSubscribed, refreshPushBell: refresh };
}
