/* eslint-disable no-undef */
/**
 * Service worker: Web Push for HRMS (show system notification + open app on click).
 * Registered from the client as /sw.js
 */
self.addEventListener('push', (event) => {
  let payload = { title: 'HRMS', body: '', url: '/', tag: 'hrms-notification' };
  try {
    const text = event.data && typeof event.data.text === 'function' ? event.data.text() : '';
    if (text) {
      const parsed = JSON.parse(text);
      payload = { ...payload, ...parsed };
    }
  } catch (_) {
    /* ignore */
  }

  const title = payload.title || 'HRMS';
  const body = payload.body || '';
  const url = payload.url || '/';
  const tag = payload.tag || 'hrms-notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag,
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.openWindow ? self.clients.openWindow(url) : Promise.resolve()
  );
});
