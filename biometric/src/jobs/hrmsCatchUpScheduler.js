const logger = require('../utils/logger');
const hrmsAttendanceSync = require('../services/hrmsAttendanceSyncService');

class HrmsCatchUpScheduler {
    constructor() {
        this.timer = null;
        this.running = false;
        this.startedAt = null;
        this.lastTickAt = null;
        this.lastSuccessAt = null;
        this.lastError = null;
        this.hrmsReachable = null;
        this.lastDrain = null;
        this.lastPendingAlertAt = 0;
        this.lastUnreachableLogAt = 0;
    }

    start() {
        const cfg = hrmsAttendanceSync.getCatchUpConfig();
        if (!cfg.enabled) {
            logger.info('HRMS catch-up worker disabled (HRMS_CATCHUP_ENABLED=false)');
            return;
        }
        if (this.timer) return;

        this.startedAt = new Date();
        logger.info(
            `Starting HRMS catch-up worker: every ${cfg.intervalMs}ms, batch=${cfg.batchSize}, lookback=${cfg.lookbackHours}h`
        );
        this.timer = setInterval(() => {
            this.tick().catch((err) => {
                this.lastError = err.message;
                logger.error('HRMS catch-up tick failed:', err);
            });
        }, cfg.intervalMs);

        setTimeout(() => {
            this.tick().catch((err) => logger.error('HRMS catch-up initial tick failed:', err));
        }, 3000);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        logger.info('HRMS catch-up worker stopped');
    }

    getSnapshot() {
        const cfg = hrmsAttendanceSync.getCatchUpConfig();
        return {
            enabled: cfg.enabled,
            running: Boolean(this.timer),
            draining: this.running,
            intervalMs: cfg.intervalMs,
            batchSize: cfg.batchSize,
            lookbackHours: cfg.lookbackHours,
            startedAt: this.startedAt,
            lastTickAt: this.lastTickAt,
            lastSuccessAt: this.lastSuccessAt,
            lastError: this.lastError,
            hrmsReachable: this.hrmsReachable,
            lastDrain: this.lastDrain,
        };
    }

    async tick() {
        if (this.running) return;
        this.running = true;
        this.lastTickAt = new Date();
        const cfg = hrmsAttendanceSync.getCatchUpConfig();

        try {
            const reclaimed = await hrmsAttendanceSync.reclaimStaleSyncing(cfg);
            if (reclaimed > 0) {
                logger.warn(`HRMS catch-up: reclaimed ${reclaimed} stale syncing row(s)`);
            }

            const expired = await hrmsAttendanceSync.expirePendingOutsideLookback(cfg);
            if (expired > 0) {
                logger.warn(
                    `HRMS catch-up: marked ${expired} pending row(s) failed (older than ${cfg.lookbackHours}h lookback)`
                );
            }

            const counts = await hrmsAttendanceSync.getOutboxCounts();
            this._maybeAlertPending(counts, cfg);

            if (counts.pendingInWindow === 0 && counts.syncing === 0) {
                this.lastError = null;
                return;
            }

            const reachable = await hrmsAttendanceSync.isHrmsReachable();
            this.hrmsReachable = reachable;
            if (!reachable) {
                this._logUnreachable(counts.pendingInWindow);
                return;
            }

            let sent = 0;
            let batches = 0;
            let failed = 0;

            for (let i = 0; i < cfg.maxBatchesPerTick; i += 1) {
                const claimed = await hrmsAttendanceSync.claimPendingBatch(cfg);
                if (!claimed.length) break;

                const result = await hrmsAttendanceSync.drainClaimedBatch(claimed, cfg);
                batches += 1;
                sent += result.sent || 0;
                failed += result.failed || 0;

                if (result.ok) {
                    this.lastSuccessAt = new Date();
                    this.lastError = null;
                } else {
                    this.lastError = result.error || 'catch-up batch failed';
                    logger.error(`HRMS catch-up batch failed (${result.kind}): ${result.error}`);
                }

                if (result.stop) {
                    this.hrmsReachable = false;
                    break;
                }

                if (i + 1 < cfg.maxBatchesPerTick && cfg.batchGapMs > 0) {
                    await new Promise((r) => setTimeout(r, cfg.batchGapMs));
                }
            }

            if (batches > 0) {
                this.lastDrain = {
                    at: new Date().toISOString(),
                    batches,
                    sent,
                    failed,
                };
                logger.info(
                    `HRMS catch-up drain: sent=${sent}, failed=${failed}, batches=${batches}, pendingInWindow before=${counts.pendingInWindow}`
                );
            }
        } finally {
            this.running = false;
        }
    }

    _maybeAlertPending(counts, cfg) {
        if (counts.pendingInWindow < cfg.pendingAlertThreshold) return;
        const now = Date.now();
        if (now - this.lastPendingAlertAt < 5 * 60 * 1000) return;
        this.lastPendingAlertAt = now;
        logger.warn(
            `HRMS catch-up: ${counts.pendingInWindow} pending punch(es) in ${cfg.lookbackHours}h window (threshold ${cfg.pendingAlertThreshold})`
        );
    }

    _logUnreachable(pendingInWindow) {
        const now = Date.now();
        if (now - this.lastUnreachableLogAt < 60 * 1000) return;
        this.lastUnreachableLogAt = now;
        logger.warn(
            `HRMS catch-up: backend unreachable; holding ${pendingInWindow} pending punch(es) until connection returns`
        );
    }
}

module.exports = HrmsCatchUpScheduler;
