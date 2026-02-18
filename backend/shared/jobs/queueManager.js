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
        removeOnComplete: {
            count: 100, // Keep last 100 completed jobs
            age: 3600,  // Keep completed jobs for 1 hour
        },
        removeOnFail: {
            count: 500, // Keep last 500 failed jobs
            age: 86400, // Keep failed jobs for 24 hours
        }
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
        removeOnComplete: {
            count: 50,
            age: 3600,
        },
        removeOnFail: {
            count: 200,
            age: 86400,
        }
    }
});

const applicationQueue = new Queue('applicationQueue', {
    connection: redisConfig,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: {
            count: 50,
            age: 3600,
        },
        removeOnFail: {
            count: 200,
            age: 86400,
        }
    }
});

const attendanceUploadQueue = new Queue('attendanceUploadQueue', {
    connection: redisConfig,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: {
            count: 50,
            age: 3600,
        },
        removeOnFail: {
            count: 200,
            age: 86400,
        }
    }
});

const rosterSyncQueue = new Queue('rosterSyncQueue', {
    connection: redisConfig,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: {
            count: 50,
            age: 3600,
        },
        removeOnFail: {
            count: 200,
            age: 86400,
        }
    }
});

module.exports = {
    payrollQueue,
    attendanceSyncQueue,
    applicationQueue,
    attendanceUploadQueue,
    rosterSyncQueue
};
