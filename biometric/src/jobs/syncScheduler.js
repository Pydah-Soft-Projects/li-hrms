const cron = require('node-cron');
const logger = require('../utils/logger');

class SyncScheduler {
    constructor(deviceService, intervalMinutes = 15) {
        this.deviceService = deviceService;
        this.intervalMinutes = intervalMinutes;
        this.task = null;
    }

    /**
     * Start the automated sync scheduler
     */
    start() {
        // Create cron expression for the interval
        const cronExpression = `*/${this.intervalMinutes} * * * *`;

        logger.info(`Starting sync scheduler: every ${this.intervalMinutes} minutes`);

        // Task 1: Fetch Logs (Interval based)
        this.task = cron.schedule(cronExpression, async () => {
            logger.info('Scheduled sync started');

            try {
                const result = await this.deviceService.fetchLogsFromAllDevices();
                logger.info('Scheduled sync completed', result);
            } catch (error) {
                logger.error('Scheduled sync failed:', error);
            }
        });

        // Task 2: User Template Sync (Daily at 12:00 AM IST)
        // Cron: 0 0 * * * (At 00:00)
        // Timezone: Asia/Kolkata
        this.userSyncTask = cron.schedule('0 0 * * *', async () => {
            logger.info('Running Daily Midnight Template Sync (IST)...');
            try {
                const report = await this.deviceService.syncAllDevices();
                logger.info('Midnight Template Sync Completed', report);
            } catch (error) {
                logger.error('Midnight Template Sync Failed:', error);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Kolkata"
        });

        logger.info('Sync scheduler started successfully');
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.task) {
            this.task.stop();
            logger.info('Sync scheduler stopped');
        }
    }

    /**
     * Run sync immediately (for testing or manual trigger)
     */
    async runNow() {
        logger.info('Running immediate sync');
        return await this.deviceService.fetchLogsFromAllDevices();
    }
}

module.exports = SyncScheduler;
