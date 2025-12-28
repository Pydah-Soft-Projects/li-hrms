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

        this.task = cron.schedule(cronExpression, async () => {
            logger.info('Scheduled sync started');

            try {
                const result = await this.deviceService.fetchLogsFromAllDevices();
                logger.info('Scheduled sync completed', result);
            } catch (error) {
                logger.error('Scheduled sync failed:', error);
            }
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
