/**
 * Web Push delivery (browser / PWA). Requires VAPID keys in env.
 * @see https://www.npmjs.com/package/web-push
 *
 * Env:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT (optional, default mailto:hrms@localhost)
 *   FRONTEND_URL or APP_BASE_URL (optional, for deep links in notifications)
 */

const mongoose = require('mongoose');
const webpush = require('web-push');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');

let vapidConfigured = false;

function isWebPushConfigured() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  return Boolean(pub && priv && String(pub).length > 10 && String(priv).length > 10);
}

function ensureVapid() {
  if (vapidConfigured) return true;
  if (!isWebPushConfigured()) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:hrms@localhost',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
    return true;
  } catch (e) {
    console.error('[WebPush] VAPID configuration failed:', e.message);
    return false;
  }
}

function resolveOpenUrl(relativeOrAbsolute) {
  const base = (process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  if (!relativeOrAbsolute) return `${base}/`;
  if (String(relativeOrAbsolute).startsWith('http')) return relativeOrAbsolute;
  const path = String(relativeOrAbsolute).startsWith('/') ? relativeOrAbsolute : `/${relativeOrAbsolute}`;
  return `${base}${path}`;
}

/**
 * Send one Web Push payload to every stored subscription for the given users.
 */
async function sendWebPushToRecipientIds(recipientUserIds, payload) {
  if (!ensureVapid()) {
    return { sent: 0, skipped: true };
  }

  const rawIds = Array.isArray(recipientUserIds) ? recipientUserIds : [];
  const objectIds = rawIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
  if (!objectIds.length) return { sent: 0 };

  const title = payload.title || 'HRMS';
  const body = payload.body || payload.message || '';
  const url = payload.url || resolveOpenUrl('/');
  const tag = payload.tag || 'hrms-notification';

  const users = await User.find({ _id: { $in: objectIds } }).select('pushSubscriptions').lean();
  const matchedUserIds = new Set(users.map((u) => String(u._id)));
  const idsMaybeEmployee = objectIds.filter((id) => !matchedUserIds.has(String(id)));
  const employees =
    idsMaybeEmployee.length > 0
      ? await Employee.find({ _id: { $in: idsMaybeEmployee } }).select('pushSubscriptions').lean()
      : [];

  let sent = 0;

  async function sendForDoc(doc, Model) {
    const subs = Array.isArray(doc.pushSubscriptions) ? doc.pushSubscriptions : [];
    for (const sub of subs) {
      if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) continue;
      const subscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        },
      };
      if (sub.expirationTime != null) subscription.expirationTime = sub.expirationTime;

      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({ title, body, url, tag }),
          { TTL: 60 * 60 * 24 }
        );
        sent += 1;
      } catch (err) {
        const code = err.statusCode;
        if (code === 410 || code === 404) {
          await Model.updateOne({ _id: doc._id }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } }).catch(
            () => {}
          );
        } else {
          console.warn('[WebPush] send failed:', code || err.message);
        }
      }
    }
  }

  for (const u of users) {
    await sendForDoc(u, User);
  }
  for (const e of employees) {
    await sendForDoc(e, Employee);
  }

  return { sent, skipped: false };
}

module.exports = {
  isWebPushConfigured,
  ensureVapid,
  resolveOpenUrl,
  sendWebPushToRecipientIds,
};
