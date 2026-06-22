const MobileSession = require('../model/MobileSession');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');

/**
 * Helper: resolve user display info (emp_no, name) from userId + userType
 */
async function resolveUserInfo(userId, userType) {
  try {
    if (userType === 'user') {
      const u = await User.findById(userId).select('name employeeId employeeRef').lean();
      if (!u) return { userName: 'Unknown', emp_no: '' };
      // If this user is linked to an employee record, get the emp_no
      if (u.employeeRef) {
        const emp = await Employee.findById(u.employeeRef).select('emp_no employee_name').lean();
        if (emp) return { userName: emp.employee_name || u.name, emp_no: emp.emp_no || u.employeeId || '' };
      }
      return { userName: u.name, emp_no: u.employeeId || '' };
    } else {
      const emp = await Employee.findById(userId).select('emp_no employee_name').lean();
      if (!emp) return { userName: 'Unknown', emp_no: '' };
      return { userName: emp.employee_name, emp_no: emp.emp_no };
    }
  } catch {
    return { userName: 'Unknown', emp_no: '' };
  }
}

/**
 * POST /api/mobile-analytics/session/start
 *
 * Called by the mobile app when it comes to the foreground.
 * Creates a new MobileSession document and returns the sessionId.
 *
 * Body: { appVersion? }
 * Auth: Required (uses req.user from JWT middleware)
 */
exports.startSession = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const userType = req.user?.type || req.user?.userType || 'employee';

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const now = new Date();
    // YYYY-MM-DD in IST (UTC+5:30) — adjust to your server's timezone if needed
    const istOffset = 5.5 * 60 * 60 * 1000;
    const localDate = new Date(now.getTime() + istOffset);
    const date = localDate.toISOString().slice(0, 10);

    const { userName, emp_no } = await resolveUserInfo(userId, userType);

    const session = await MobileSession.create({
      userId,
      userType,
      userName,
      emp_no,
      date,
      sessionStart: now,
      deviceId: req.body?.deviceId || req.headers['x-device-id'] || 'unknown',
      appVersion: req.body?.appVersion || '',
      platform: 'mobile',
    });

    console.log(`[MobileAnalytics] Session started: ${session._id} for user ${userId} (${emp_no})`);

    return res.status(201).json({
      success: true,
      data: { sessionId: session._id.toString() },
    });
  } catch (error) {
    console.error('[MobileAnalytics] startSession error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to start session tracking' });
  }
};

/**
 * POST /api/mobile-analytics/session/end
 *
 * Called by the mobile app when it goes to the background or closes.
 * Marks the session as ended and computes durationSeconds.
 *
 * Body: { sessionId }
 * Auth: Required
 */
exports.endSession = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId is required' });
    }

    const session = await MobileSession.findOne({ _id: sessionId, userId });

    if (!session) {
      // Session not found — silently succeed (mobile may retry after reconnect)
      return res.status(200).json({ success: true, message: 'Session not found or already ended' });
    }

    if (session.sessionEnd) {
      // Already ended — idempotent
      return res.status(200).json({ success: true, message: 'Session already ended' });
    }

    const now = new Date();
    const durationSeconds = Math.round((now - session.sessionStart) / 1000);

    session.sessionEnd = now;
    session.durationSeconds = durationSeconds;
    await session.save();

    console.log(
      `[MobileAnalytics] Session ended: ${session._id} for user ${userId} — duration: ${durationSeconds}s`
    );

    return res.status(200).json({
      success: true,
      data: { durationSeconds },
    });
  } catch (error) {
    console.error('[MobileAnalytics] endSession error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to end session tracking' });
  }
};
