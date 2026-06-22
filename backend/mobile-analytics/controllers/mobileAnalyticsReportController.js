const MobileSession = require('../model/MobileSession');
const LoginAudit = require('../../authentication/model/LoginAudit');
const Employee = require('../../employees/model/Employee');

/**
 * Helper: format seconds into "Xh Ym" string
 */
function formatDuration(seconds) {
  if (seconds == null || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * GET /api/mobile-analytics/report/daily?date=YYYY-MM-DD
 *
 * Returns how many unique users used the mobile app on a given date,
 * along with a per-user breakdown of sessions and time.
 *
 * Query: date (optional, defaults to today)
 * Auth: Admin only
 */
exports.getDailyReport = async (req, res) => {
  try {
    // IST offset for default "today"
    const istOffset = 5.5 * 60 * 60 * 1000;
    const defaultDate = new Date(Date.now() + istOffset).toISOString().slice(0, 10);
    const date = req.query.date || defaultDate;

    // Aggregate sessions for this date
    const sessionAgg = await MobileSession.aggregate([
      { $match: { date } },
      {
        $group: {
          _id: '$userId',
          emp_no: { $first: '$emp_no' },
          userName: { $first: '$userName' },
          totalSessions: { $sum: 1 },
          totalDurationSeconds: { $sum: { $ifNull: ['$durationSeconds', 0] } },
          firstOpen: { $min: '$sessionStart' },
          lastClose: { $max: '$sessionEnd' },
        },
      },
      { $sort: { userName: 1 } },
    ]);

    // Count mobile logins from LoginAudit for this date
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const loginAgg = await LoginAudit.aggregate([
      {
        $match: {
          platform: 'mobile',
          success: true,
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: '$userId',
          loginCount: { $sum: 1 },
        },
      },
    ]);

    // Map login counts by userId
    const loginMap = {};
    loginAgg.forEach((l) => {
      loginMap[l._id?.toString()] = l.loginCount;
    });

    // Merge session data with login counts
    const users = sessionAgg.map((s) => ({
      userId: s._id,
      emp_no: s.emp_no,
      userName: s.userName,
      totalSessions: s.totalSessions,
      totalDurationSeconds: s.totalDurationSeconds,
      totalDurationFormatted: formatDuration(s.totalDurationSeconds),
      mobileLogins: loginMap[s._id?.toString()] || 0,
      firstOpen: s.firstOpen,
      lastClose: s.lastClose,
    }));

    return res.status(200).json({
      success: true,
      data: {
        date,
        totalActiveUsers: users.length,
        users,
      },
    });
  } catch (error) {
    console.error('[MobileAnalyticsReport] getDailyReport error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch daily report' });
  }
};

/**
 * GET /api/mobile-analytics/report/summary?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
 *
 * Returns a complete day-wise, user-wise table for a date range.
 * This is the main report shown in the admin dashboard.
 *
 * Query: fromDate, toDate (both required)
 * Auth: Admin only
 */
exports.getSummaryReport = async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    if (!fromDate || !toDate) {
      return res
        .status(400)
        .json({ success: false, message: 'fromDate and toDate are required (YYYY-MM-DD)' });
    }

    // Aggregate sessions grouped by date + userId
    const sessionAgg = await MobileSession.aggregate([
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      {
        $group: {
          _id: { date: '$date', userId: '$userId' },
          emp_no: { $first: '$emp_no' },
          userName: { $first: '$userName' },
          totalSessions: { $sum: 1 },
          totalDurationSeconds: { $sum: { $ifNull: ['$durationSeconds', 0] } },
          firstOpen: { $min: '$sessionStart' },
          lastClose: { $max: '$sessionEnd' },
        },
      },
      { $sort: { '_id.date': -1, userName: 1 } },
    ]);

    // Get login counts from LoginAudit for the same range
    const startOfRange = new Date(`${fromDate}T00:00:00.000Z`);
    const endOfRange = new Date(`${toDate}T23:59:59.999Z`);

    const loginAgg = await LoginAudit.aggregate([
      {
        $match: {
          platform: 'mobile',
          success: true,
          createdAt: { $gte: startOfRange, $lte: endOfRange },
        },
      },
      {
        $addFields: {
          // Convert createdAt to YYYY-MM-DD in IST
          dateStr: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: '+05:30',
            },
          },
        },
      },
      {
        $group: {
          _id: { date: '$dateStr', userId: '$userId' },
          loginCount: { $sum: 1 },
        },
      },
    ]);

    // Build login map: "date|userId" → loginCount
    const loginMap = {};
    loginAgg.forEach((l) => {
      const key = `${l._id.date}|${l._id.userId?.toString()}`;
      loginMap[key] = l.loginCount;
    });

    // Compute DAU per date
    const dauMap = {};
    sessionAgg.forEach((s) => {
      const d = s._id.date;
      dauMap[d] = (dauMap[d] || 0) + 1;
    });

    // Build rows
    const rows = sessionAgg.map((s) => {
      const date = s._id.date;
      const userId = s._id.userId?.toString();
      const key = `${date}|${userId}`;
      return {
        date,
        userId,
        emp_no: s.emp_no,
        userName: s.userName,
        mobileLogins: loginMap[key] || 0,
        totalSessions: s.totalSessions,
        totalDurationSeconds: s.totalDurationSeconds,
        totalDurationFormatted: formatDuration(s.totalDurationSeconds),
        firstOpen: s.firstOpen,
        lastClose: s.lastClose,
        dailyActiveUsers: dauMap[date],
      };
    });

    // Also compute summary per day for the header cards
    const dailySummary = Object.entries(dauMap)
      .map(([date, activeUsers]) => ({ date, activeUsers }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return res.status(200).json({
      success: true,
      data: {
        fromDate,
        toDate,
        totalRows: rows.length,
        dailySummary,
        rows,
      },
    });
  } catch (error) {
    console.error('[MobileAnalyticsReport] getSummaryReport error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch summary report' });
  }
};

/**
 * GET /api/mobile-analytics/report/user-detail?userId=xxx&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
 *
 * Returns day-by-day breakdown for a single user.
 *
 * Query: userId, fromDate, toDate
 * Auth: Admin only
 */
exports.getUserDetailReport = async (req, res) => {
  try {
    const { userId, fromDate, toDate } = req.query;
    if (!userId || !fromDate || !toDate) {
      return res
        .status(400)
        .json({ success: false, message: 'userId, fromDate and toDate are required' });
    }

    const mongoose = require('mongoose');
    let userObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }

    // Get all sessions for this user in range
    const sessions = await MobileSession.find({
      userId: userObjectId,
      date: { $gte: fromDate, $lte: toDate },
    })
      .sort({ sessionStart: 1 })
      .lean();

    // Group by date
    const byDate = {};
    sessions.forEach((s) => {
      if (!byDate[s.date]) {
        byDate[s.date] = {
          date: s.date,
          emp_no: s.emp_no,
          userName: s.userName,
          sessions: [],
          totalDurationSeconds: 0,
        };
      }
      byDate[s.date].sessions.push({
        sessionId: s._id,
        start: s.sessionStart,
        end: s.sessionEnd,
        durationSeconds: s.durationSeconds,
        durationFormatted: formatDuration(s.durationSeconds),
      });
      byDate[s.date].totalDurationSeconds += s.durationSeconds || 0;
    });

    // Get login counts per day
    const startOfRange = new Date(`${fromDate}T00:00:00.000Z`);
    const endOfRange = new Date(`${toDate}T23:59:59.999Z`);

    const loginAgg = await LoginAudit.aggregate([
      {
        $match: {
          userId: userObjectId,
          platform: 'mobile',
          success: true,
          createdAt: { $gte: startOfRange, $lte: endOfRange },
        },
      },
      {
        $addFields: {
          dateStr: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: '+05:30',
            },
          },
        },
      },
      {
        $group: {
          _id: '$dateStr',
          loginCount: { $sum: 1 },
        },
      },
    ]);

    const loginMap = {};
    loginAgg.forEach((l) => {
      loginMap[l._id] = l.loginCount;
    });

    // Build final rows
    const rows = Object.values(byDate)
      .map((d) => ({
        date: d.date,
        emp_no: d.emp_no,
        userName: d.userName,
        mobileLogins: loginMap[d.date] || 0,
        totalSessions: d.sessions.length,
        totalDurationSeconds: d.totalDurationSeconds,
        totalDurationFormatted: formatDuration(d.totalDurationSeconds),
        sessions: d.sessions,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return res.status(200).json({
      success: true,
      data: {
        userId,
        fromDate,
        toDate,
        rows,
      },
    });
  } catch (error) {
    console.error('[MobileAnalyticsReport] getUserDetailReport error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch user detail report' });
  }
};
