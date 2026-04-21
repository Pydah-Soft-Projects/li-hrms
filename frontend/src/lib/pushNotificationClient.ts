import { api } from '@/lib/api';

const SW_PATH = '/sw.js';

/** Fired after a successful server push subscribe so UI (e.g. dashboard bell) can refresh. */
export const HRMS_PUSH_SUBSCRIPTION_CHANGED = 'hrms-push-subscription-changed';

export function notifyPushSubscriptionChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HRMS_PUSH_SUBSCRIPTION_CHANGED));
  }
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushEnvironmentSupported() {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Registers SW + syncs push subscription with backend when permission is already granted.
 * Returns { ok, reason } — does not call requestPermission (must be user gesture elsewhere).
 */
export async function syncPushSubscription(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushEnvironmentSupported()) {
    return { ok: false, reason: 'unsupported' };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'not_granted' };
  }

  try {
    const cfg = await api.getPushVapidPublic();
    if (!cfg?.success || !cfg.configured || !cfg.publicKey) {
      return { ok: false, reason: 'server_not_configured' };
    }

    const reg = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
    await reg.update();

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      const res = await api.subscribePush(existing.toJSON() as Record<string, unknown>);
      if (!res?.success) {
        return { ok: false, reason: res?.message || 'subscribe_failed' };
      }
      notifyPushSubscriptionChanged();
      return { ok: true };
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
    });
    const res = await api.subscribePush(sub.toJSON() as Record<string, unknown>);
    if (!res?.success) {
      return { ok: false, reason: res?.message || 'subscribe_failed' };
    }
    notifyPushSubscriptionChanged();
    return { ok: true };
  } catch (e) {
    console.warn('[syncPushSubscription]', e);
    return { ok: false, reason: 'exception' };
  }
}

/** Call only from a click handler — triggers the browser permission dialog when state is "default". */
export async function requestPermissionAndSubscribe(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushEnvironmentSupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed' };
  }

  return syncPushSubscription();
}
