const Redis = require('ioredis');
require('dotenv').config();

const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
};

const redis = new Redis(redisConfig);

redis.ping()
    .then((res) => {
        console.log('Redis Ping Response:', res);
        process.exit(0);
    })
    .catch((err) => {
        console.error('Redis Connection Test Failed:', err.message);
        process.exit(1);
    });
