/**
 * Attendance Sync Job
 * Periodic sync job that runs based on configured interval
 */

const AttendanceSettings = require('../model/AttendanceSettings');
const { syncAttendanceFromMSSQL } = require('./attendanceSyncService');

let syncInterval = null;
let isRunning = false;

/**
 * Start the periodic sync job
 */
const startSyncJob = async () => {
  try {
    const settings = await AttendanceSettings.getSettings();

    if (!settings.syncSettings.autoSyncEnabled) {
      console.log('📅 Attendance auto-sync is disabled');
      return;
    }

    const intervalHours = settings.syncSettings.syncIntervalHours || 1;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    console.log(`📅 Starting attendance auto-sync job (interval: ${intervalHours} hours)`);

    // Run initial sync
    await runSync();

    // Set up periodic sync
    syncInterval = setInterval(async () => {
      await runSync();
    }, intervalMs);

  } catch (error) {
    console.error('❌ Error starting attendance sync job:', error);
  }
};

/**
 * Stop the periodic sync job
 */
const stopSyncJob = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('📅 Attendance auto-sync job stopped');
  }
};

/**
 * Run sync (internal function)
 */
const runSync = async () => {
  try {
    console.log('🔄 Queueing attendance sync job in BullMQ...');

    const { attendanceSyncQueue } = require('../../shared/jobs/queueManager');
    await attendanceSyncQueue.add('periodic_sync', {
      action: 'sync_all',
      triggeredAt: new Date().toISOString()
    });

    console.log('✅ Attendance sync job queued');
  } catch (error) {
    console.error('❌ Error queueing attendance sync job:', error);
  }
};

/**
 * Restart the sync job (call when settings change)
 */
const restartSyncJob = async () => {
  stopSyncJob();
  await startSyncJob();
};

module.exports = {
  startSyncJob,
  stopSyncJob,
  restartSyncJob,
  runSync,
};

