const { Queue } = require('bullmq');
const { redisConfig } = require('../../config/redis');

// Initialize Queues
const payrollQueue = new Queue('payrollQueue', {
    connection: redisConfig,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
    }
});

const attendanceSyncQueue = new Queue('attendanceSyncQueue', {
    connection: redisConfig,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'fixed',
            delay: 10000,
        },
        removeOnComplete: true,
    }
});

module.exports = {
    payrollQueue,
    attendanceSyncQueue
};
