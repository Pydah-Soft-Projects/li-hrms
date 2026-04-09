const cron = require('node-cron');
const { sendBirthdayWishesForToday } = require('../services/birthdayNotificationService');

/**
 * Birthday wish cron.
 * Runs daily at 09:00 IST and sends SMS + email birthday greetings.
 */
const startBirthdayWishCron = () => {
  cron.schedule(
    '0 9 * * *',
    async () => {
      console.log('[BirthdayWishCron] Running daily birthday wishes job...');
      try {
        const summary = await sendBirthdayWishesForToday();
        console.log('[BirthdayWishCron] Completed:', summary);
      } catch (error) {
        console.error('[BirthdayWishCron] Failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    }
  );
};

module.exports = { startBirthdayWishCron };

