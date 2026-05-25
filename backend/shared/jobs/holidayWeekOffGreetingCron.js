const cron = require('node-cron');
const { sendHolidayWeekOffGreetingsForToday } = require('../services/holidayWeekOffNotificationService');

/**
 * Morning holiday / week-off greetings (in-app + web push).
 * 07:30 IST daily — friendly chill messages, deduped per employee per day.
 */
const startHolidayWeekOffGreetingCron = () => {
  cron.schedule(
    '30 7 * * *',
    async () => {
      console.log('[HolidayWeekOffGreetingCron] Running daily greetings...');
      try {
        const summary = await sendHolidayWeekOffGreetingsForToday();
        console.log('[HolidayWeekOffGreetingCron] Completed:', summary);
      } catch (error) {
        console.error('[HolidayWeekOffGreetingCron] Failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    }
  );
};

module.exports = { startHolidayWeekOffGreetingCron };
