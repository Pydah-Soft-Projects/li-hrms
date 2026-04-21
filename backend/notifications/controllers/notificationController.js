const Notification = require('../model/Notification');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');

const MAX_PUSH_SUBSCRIPTIONS = 12;

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

exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, isRead, module } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter = { recipientUserId: req.user._id };
    if (typeof isRead !== 'undefined') filter.isRead = String(isRead) === 'true';
    if (module) filter.module = module;

    const [data, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Notification.countDocuments(filter),
    ]);

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
    const unreadCount = await Notification.countDocuments({
      recipientUserId: req.user._id,
      isRead: false,
    });
    res.status(200).json({ success: true, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load unread count', error: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientUserId: req.user._id },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark notification read', error: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipientUserId: req.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.status(200).json({ success: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark all read', error: error.message });
  }
};
