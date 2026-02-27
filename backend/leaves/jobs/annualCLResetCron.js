/**
 * Annual CL Reset Cron – IST-only, server-timezone agnostic.
 * Runs daily at 00:15 IST (cron timezone: Asia/Kolkata). All date comparison uses IST
 * so behaviour is correct on UTC or any server. Stored transaction dates are IST midnight.
 */

const cron = require('node-cron');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const { performAnnualCLReset, getNextResetDate } = require('../services/annualCLResetService');
const { getTodayISTDateString, extractISTComponents } = require('../../shared/utils/dateUtils');

const CRON_DAILY_IST = '15 0 * * *'; // 00:15 IST every day
const TIMEZONE = 'Asia/Kolkata';

let scheduledTask = null;

function startAnnualCLResetCron() {
    if (scheduledTask) return scheduledTask;

    scheduledTask = cron.schedule(
        CRON_DAILY_IST,
        async () => {
            try {
                const settings = await LeavePolicySettings.getSettings();
                if (!settings?.annualCLReset?.enabled) return;

                // All dates in IST – intact on UTC or any server
                const nextReset = await getNextResetDate(settings);
                const nextResetStr = extractISTComponents(nextReset).dateStr;
                const todayIST = getTodayISTDateString();

                if (todayIST !== nextResetStr) return;

                console.log(`[AnnualCLResetCron] Today (IST)=${todayIST} matches reset date. Running annual CL reset...`);
                const result = await performAnnualCLReset();
                console.log(`[AnnualCLResetCron] Done: success=${result.success}, processed=${result.processed}, successCount=${result.successCount}`);
                if (result.errors?.length) console.warn('[AnnualCLResetCron] Errors:', result.errors.slice(0, 5));
            } catch (err) {
                console.error('[AnnualCLResetCron] Failed:', err.message);
            }
        },
        { timezone: TIMEZONE }
    );

    console.log(`[AnnualCLResetCron] Scheduled: ${CRON_DAILY_IST} (${TIMEZONE}) – date comparison in IST, safe on UTC server`);
    return scheduledTask;
}

function stopAnnualCLResetCron() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
        console.log('[AnnualCLResetCron] Stopped');
    }
}

module.exports = {
    startAnnualCLResetCron,
    stopAnnualCLResetCron,
};
