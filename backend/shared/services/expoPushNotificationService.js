/**
 * Expo Push Notifications (React Native mobile app).
 * @see https://docs.expo.dev/push-notifications/sending-notifications/
 */

const mongoose = require('mongoose');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_MESSAGES_PER_REQUEST = 100;

function isExpoPushToken(token) {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[/i.test(token.trim());
}

function resolveMobileDeepLink(actionUrl) {
  const base = String(actionUrl || '').trim();
  if (!base) return '/notifications';
  if (base.startsWith('http')) {
    try {
      const u = new URL(base);
      return u.pathname || '/notifications';
    } catch {
      return '/notifications';
    }
  }
  return base.startsWith('/') ? base : `/${base}`;
}

async function collectExpoTokensForRecipientIds(recipientUserIds) {
  const rawIds = Array.isArray(recipientUserIds) ? recipientUserIds : [];
  const objectIds = rawIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
  if (!objectIds.length) return [];

  const users = await User.find({ _id: { $in: objectIds } }).select('expoPushTokens').lean();
  const matched = new Set(users.map((u) => String(u._id)));
  const maybeEmployee = objectIds.filter((id) => !matched.has(String(id)));
  const employees =
    maybeEmployee.length > 0
      ? await Employee.find({ _id: { $in: maybeEmployee } }).select('expoPushTokens').lean()
      : [];

  const tokens = new Set();
  for (const doc of [...users, ...employees]) {
    const list = Array.isArray(doc.expoPushTokens) ? doc.expoPushTokens : [];
    for (const entry of list) {
      const t = String(entry?.token || '').trim();
      if (isExpoPushToken(t)) tokens.add(t);
    }
  }
  return [...tokens];
}

async function sendExpoPushBatch(messages) {
  if (!messages.length) return { sent: 0, failed: 0 };
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expo push HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const data = Array.isArray(json?.data) ? json.data : [];
  let sent = 0;
  let failed = 0;
  for (const item of data) {
    if (item?.status === 'ok') sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

/**
 * Send Expo push to all registered mobile tokens for the given recipient ids.
 */
async function sendExpoPushToRecipientIds(recipientUserIds, payload = {}) {
  const tokens = await collectExpoTokensForRecipientIds(recipientUserIds);
  if (!tokens.length) return { sent: 0, skipped: true };

  const title = payload.title || 'HRMS';
  const body = payload.body || payload.message || '';
  const data = {
    ...(payload.data || {}),
    url: resolveMobileDeepLink(payload.url || payload.actionUrl),
    module: payload.module || null,
    entityId: payload.entityId ? String(payload.entityId) : null,
  };

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < tokens.length; i += MAX_MESSAGES_PER_REQUEST) {
    const slice = tokens.slice(i, i + MAX_MESSAGES_PER_REQUEST);
    const messages = slice.map((to) => ({
      to,
      title,
      body,
      data,
      sound: payload.silent ? null : 'default',
      priority: payload.priority === 'high' ? 'high' : 'default',
      channelId: payload.channelId || 'hrms-default',
    }));
    const result = await sendExpoPushBatch(messages);
    sent += result.sent;
    failed += result.failed;
  }

  return { sent, failed, skipped: false };
}

module.exports = {
  isExpoPushToken,
  resolveMobileDeepLink,
  sendExpoPushToRecipientIds,
};
