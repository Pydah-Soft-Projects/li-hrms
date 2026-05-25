const mongoose = require('mongoose');
const Employee = require('../../employees/model/Employee');
const User = require('../../users/model/User');
const Notification = require('../../notifications/model/Notification');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const { createNotifications } = require('../../notifications/services/notificationService');
const { pickHolidayWeekOffGreeting } = require('../../holidays/utils/holidayGreetingMessages');
const {
  fetchMergedHolidaysForEmployee,
  parseHolidayNameFromRosterNotes,
  holidayCoversDateStr,
} = require('../../dashboard/services/employeeDayOffResolver');

const { getTodayISTDateString } = require('../../shared/utils/dateUtils');

function uniqueIds(ids = []) {
  return [...new Set(ids.map((id) => String(id)).filter(Boolean))];
}

async function resolveRecipientIdsForEmployee(employee) {
  const empId = employee._id;
  const empNo = String(employee.emp_no || '').toUpperCase();
  const out = new Set();

  if (empId && mongoose.Types.ObjectId.isValid(String(empId))) {
    out.add(String(empId));
  }

  const users = await User.find({
    isActive: true,
    $or: [
      ...(empId ? [{ employeeRef: empId }] : []),
      ...(empNo ? [{ employeeId: empNo }] : []),
    ],
  })
    .select('_id')
    .lean();

  for (const u of users) {
    out.add(String(u._id));
  }

  return [...out].filter((id) => mongoose.Types.ObjectId.isValid(id));
}

async function resolveEmployeeDayOffToday(employee, todayIst) {
  const empNoUpper = String(employee.emp_no || '').toUpperCase();
  if (!empNoUpper) return null;

  const roster = await PreScheduledShift.findOne({
    employeeNumber: empNoUpper,
    date: todayIst,
  })
    .select('status notes')
    .lean();

  if (roster?.status === 'WO') {
    return { dayType: 'WEEK_OFF', holidayName: null };
  }
  if (roster?.status === 'HOL') {
    return {
      dayType: 'HOLIDAY',
      holidayName: parseHolidayNameFromRosterNotes(roster.notes),
    };
  }

  const istYear = Number(todayIst.slice(0, 4));
  const holidays = await fetchMergedHolidaysForEmployee(employee, istYear);
  for (const h of holidays) {
    if (holidayCoversDateStr(h, todayIst)) {
      return { dayType: 'HOLIDAY', holidayName: h.name || null };
    }
  }

  return null;
}

async function alreadyGreetedToday(recipientUserId, dedupeBase) {
  const key = `${dedupeBase}:${recipientUserId}`;
  const existing = await Notification.findOne({ recipientUserId, dedupeKey: key }).lean();
  return !!existing;
}

/**
 * Send in-app + web push greeting to one employee (deduped per day).
 */
async function sendDayOffGreetingForEmployee(employee, options = {}) {
  const todayIst = options.dateStr || getTodayISTDateString();
  const dayInfo = options.dayInfo || (await resolveEmployeeDayOffToday(employee, todayIst));
  if (!dayInfo) {
    return { sent: false, skipped: true, reason: 'not_day_off' };
  }

  const greeting = pickHolidayWeekOffGreeting(dayInfo.dayType, {
    employeeName: employee.employee_name,
    holidayName: dayInfo.holidayName,
    empNo: employee.emp_no,
    dateStr: todayIst,
  });

  const recipientIds = await resolveRecipientIdsForEmployee(employee);
  if (!recipientIds.length) {
    return { sent: false, skipped: true, reason: 'no_recipient' };
  }

  const eventType = dayInfo.dayType === 'HOLIDAY' ? 'holiday_greeting' : 'week_off_greeting';
  const dedupeBase = `greeting:${dayInfo.dayType}:${todayIst}:${String(employee.emp_no || '').toUpperCase()}`;

  const toNotify = [];
  for (const rid of recipientIds) {
    if (!(await alreadyGreetedToday(rid, dedupeBase))) {
      toNotify.push(rid);
    }
  }

  if (!toNotify.length) {
    return { sent: false, skipped: true, reason: 'already_sent' };
  }

  await createNotifications({
    recipientUserIds: toNotify,
    module: 'system',
    eventType,
    title: greeting.title,
    message: greeting.message,
    priority: 'medium',
    entityType: 'day_off_greeting',
    actionUrl: '/dashboard',
    meta: {
      dayType: dayInfo.dayType,
      holidayName: dayInfo.holidayName,
      tagLine: greeting.tagLine,
      empNo: employee.emp_no,
    },
    dedupeKey: dedupeBase,
  });

  return { sent: true, recipients: toNotify.length, dayType: dayInfo.dayType };
}

async function sendHolidayWeekOffGreetingsForToday() {
  const todayIst = getTodayISTDateString();
  const activeFilter = Employee.getCurrentlyActiveFilter();
  const employees = await Employee.find(activeFilter)
    .select('emp_no employee_name division_id department_id employee_group_id')
    .lean();

  let sentCount = 0;
  let skippedCount = 0;
  let dayOffCount = 0;

  for (const emp of employees) {
    const dayInfo = await resolveEmployeeDayOffToday(emp, todayIst);
    if (!dayInfo) continue;
    dayOffCount += 1;
    const r = await sendDayOffGreetingForEmployee(emp, { dateStr: todayIst, dayInfo });
    if (r.sent) sentCount += 1;
    else skippedCount += 1;
  }

  return {
    date: todayIst,
    totalActiveEmployees: employees.length,
    dayOffEmployees: dayOffCount,
    sentCount,
    skippedCount,
  };
}

module.exports = {
  sendDayOffGreetingForEmployee,
  sendHolidayWeekOffGreetingsForToday,
  resolveEmployeeDayOffToday,
};
