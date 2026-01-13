const Redis = require('ioredis');
const dotenv = require('dotenv');
dotenv.config();

const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
};

const redisConnection = new Redis(redisConfig);

redisConnection.on('connect', () => {
    console.log('Successfully connected to Redis');
});

redisConnection.on('error', (err) => {
    console.error('Redis connection error:', err);
});

module.exports = {
    redisConnection,
    redisConfig
};
