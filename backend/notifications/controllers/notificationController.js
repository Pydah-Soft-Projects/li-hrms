const Notification = require('../model/Notification');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const { isExpoPushToken } = require('../../shared/services/expoPushNotificationService');

const MAX_PUSH_SUBSCRIPTIONS = 12;
const MAX_EXPO_PUSH_TOKENS = 8;

exports.getVapidPublicKey = async (req, res) => {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY || null;
    const configured = Boolean(publicKey && process.env.VAPID_PRIVATE_KEY);
    res.status(200).json({
      success: true,
      configured,
      publicKey: configured ? publicKey : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to read push config', error: error.message });
  }
};

exports.subscribePush = async (req, res) => {
  try {
    const sub = req.body;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return res.status(400).json({ success: false, message: 'Invalid push subscription payload' });
    }

    const entry = {
      endpoint: String(sub.endpoint),
      expirationTime: sub.expirationTime != null ? Number(sub.expirationTime) : null,
      keys: {
        p256dh: String(sub.keys.p256dh),
        auth: String(sub.keys.auth),
      },
      userAgent: (req.headers['user-agent'] || '').slice(0, 512) || null,
      createdAt: new Date(),
    };

    const isEmployeePortal = req.user.type === 'employee';
    const Model = isEmployeePortal ? Employee : User;
    const notFoundMsg = isEmployeePortal ? 'Employee not found' : 'User not found';

    const account = await Model.findById(req.user._id).select('pushSubscriptions');
    if (!account) {
      return res.status(404).json({ success: false, message: notFoundMsg });
    }

    const existing = Array.isArray(account.pushSubscriptions) ? account.pushSubscriptions : [];
    const filtered = existing.filter((s) => s.endpoint !== entry.endpoint);
    filtered.push(entry);
    const trimmed = filtered.slice(-MAX_PUSH_SUBSCRIPTIONS);
    account.pushSubscriptions = trimmed;
    await account.save();

    res.status(200).json({ success: true, message: 'Push subscription saved', count: trimmed.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save push subscription', error: error.message });
  }
};

exports.unsubscribePush = async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ success: false, message: 'endpoint is required' });
    }
    const Model = req.user.type === 'employee' ? Employee : User;
    await Model.updateOne({ _id: req.user._id }, { $pull: { pushSubscriptions: { endpoint: String(endpoint) } } });
    res.status(200).json({ success: true, message: 'Push subscription removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove push subscription', error: error.message });
  }
};

/** Whether the current User or Employee has at least one saved Web Push subscription (for dashboard bell). */
exports.getPushSubscriptionStatus = async (req, res) => {
  try {
    const isEmployeePortal = req.user.type === 'employee';
    const Model = isEmployeePortal ? Employee : User;
    const doc = await Model.findById(req.user._id).select('pushSubscriptions').lean();
    const count = Array.isArray(doc?.pushSubscriptions) ? doc.pushSubscriptions.length : 0;
    res.status(200).json({ success: true, subscribed: count > 0, count });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to read push subscription status',
      error: error.message,
    });
  }
};

exports.subscribeExpoPush = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!isExpoPushToken(token)) {
      return res.status(400).json({ success: false, message: 'Invalid Expo push token' });
    }

    const platformRaw = String(req.body?.platform || 'unknown').toLowerCase();
    const platform = platformRaw === 'ios' || platformRaw === 'android' ? platformRaw : 'unknown';
    const deviceName = String(req.body?.deviceName || '').slice(0, 120) || null;

    const entry = {
      token,
      platform,
      deviceName,
      createdAt: new Date(),
      lastSeenAt: new Date(),
    };

    const isEmployeePortal = req.user.type === 'employee';
    const Model = isEmployeePortal ? Employee : User;
    const notFoundMsg = isEmployeePortal ? 'Employee not found' : 'User not found';

    const account = await Model.findById(req.user._id).select('expoPushTokens');
    if (!account) {
      return res.status(404).json({ success: false, message: notFoundMsg });
    }

    const existing = Array.isArray(account.expoPushTokens) ? account.expoPushTokens : [];
    const filtered = existing.filter((s) => String(s.token) !== token);
    filtered.push(entry);
    const trimmed = filtered.slice(-MAX_EXPO_PUSH_TOKENS);
    account.expoPushTokens = trimmed;
    await account.save();

    res.status(200).json({ success: true, message: 'Expo push token saved', count: trimmed.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save Expo push token', error: error.message });
  }
};

exports.unsubscribeExpoPush = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }
    const Model = req.user.type === 'employee' ? Employee : User;
    await Model.updateOne({ _id: req.user._id }, { $pull: { expoPushTokens: { token } } });
    res.status(200).json({ success: true, message: 'Expo push token removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove Expo push token', error: error.message });
  }
};

exports.getExpoPushStatus = async (req, res) => {
  try {
    const isEmployeePortal = req.user.type === 'employee';
    const Model = isEmployeePortal ? Employee : User;
    const doc = await Model.findById(req.user._id).select('expoPushTokens').lean();
    const count = Array.isArray(doc?.expoPushTokens) ? doc.expoPushTokens.length : 0;
    res.status(200).json({ success: true, subscribed: count > 0, count });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to read Expo push status',
      error: error.message,
    });
  }
};

async function resolveAllUserRecipientIds(reqUser) {
  const ids = new Set();
  if (reqUser?._id) ids.add(String(reqUser._id));
  if (reqUser?.userId) ids.add(String(reqUser.userId));
  if (reqUser?.employeeRef) ids.add(String(reqUser.employeeRef));

  try {
    if (reqUser?._id || reqUser?.employeeRef || reqUser?.employeeId) {
      const userDocs = await User.find({
        $or: [
          ...(reqUser._id ? [{ _id: reqUser._id }] : []),
          ...(reqUser.employeeRef ? [{ employeeRef: reqUser.employeeRef }, { _id: reqUser.employeeRef }] : []),
          ...(reqUser._id ? [{ employeeRef: reqUser._id }] : []),
          ...(reqUser.employeeId ? [{ employeeId: reqUser.employeeId }] : []),
        ],
      }).select('_id employeeRef').lean();

      userDocs.forEach((u) => {
        if (u._id) ids.add(String(u._id));
        if (u.employeeRef) ids.add(String(u.employeeRef));
      });
    }
  } catch (e) {
    console.error('[notificationController] Error resolving recipient IDs:', e);
  }

  return Array.from(ids);
}

exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, isRead, module } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const recipientIds = await resolveAllUserRecipientIds(req.user);
    const filter = { recipientUserId: { $in: recipientIds } };
    if (typeof isRead !== 'undefined') filter.isRead = String(isRead) === 'true';
    if (module) filter.module = module;

    const rawDocs = await Notification.find(filter).sort({ createdAt: -1 }).lean();

    // Deduplicate by content key: title|message
    const deduplicatedMap = new Map();
    for (const doc of rawDocs) {
      const key = `${(doc.title || '').trim().toLowerCase()}|${(doc.message || '').trim().toLowerCase()}`;
      if (!deduplicatedMap.has(key)) {
        deduplicatedMap.set(key, doc);
      } else {
        // If existing is read but doc is unread, prefer unread item
        const existing = deduplicatedMap.get(key);
        if (existing.isRead && !doc.isRead) {
          deduplicatedMap.set(key, doc);
        }
      }
    }

    const deduplicatedList = Array.from(deduplicatedMap.values());
    const total = deduplicatedList.length;
    const data = deduplicatedList.slice(skip, skip + limitNum);

    res.status(200).json({
      success: true,
      data,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load notifications', error: error.message });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const recipientIds = await resolveAllUserRecipientIds(req.user);
    const unreadDocs = await Notification.find({
      recipientUserId: { $in: recipientIds },
      isRead: false,
    }).lean();

    const unreadKeys = new Set();
    for (const doc of unreadDocs) {
      const key = `${(doc.title || '').trim().toLowerCase()}|${(doc.message || '').trim().toLowerCase()}`;
      unreadKeys.add(key);
    }

    res.status(200).json({ success: true, unreadCount: unreadKeys.size });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load unread count', error: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const recipientIds = await resolveAllUserRecipientIds(req.user);
    const target = await Notification.findOne({ _id: req.params.id, recipientUserId: { $in: recipientIds } });
    if (!target) return res.status(404).json({ success: false, message: 'Notification not found' });

    // Mark target and any duplicate notifications with same title & message as read
    await Notification.updateMany(
      {
        recipientUserId: { $in: recipientIds },
        title: target.title,
        message: target.message,
      },
      { $set: { isRead: true, readAt: new Date() } }
    );

    target.isRead = true;
    target.readAt = new Date();
    res.status(200).json({ success: true, data: target });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark notification read', error: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const recipientIds = await resolveAllUserRecipientIds(req.user);
    const result = await Notification.updateMany(
      { recipientUserId: { $in: recipientIds }, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.status(200).json({ success: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark all read', error: error.message });
  }
};
