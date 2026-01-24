const { redisConnection } = require('../../config/redis');

/**
 * Cache Service
 * Provides helper methods for Redis caching
 */
const cacheService = {
    /**
     * Get value from cache
     * @param {string} key 
     */
    async get(key) {
        try {
            if (redisConnection.status !== 'ready') return null;
            const data = await redisConnection.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            // Silence cache logs as per user request
            // console.error(`[Cache] Error getting key ${key}:`, error.message);
            return null;
        }
    },

    /**
     * Set value in cache
     * @param {string} key 
     * @param {any} value 
     * @param {number} ttlInSeconds - Default 1 hour
     */
    async set(key, value, ttlInSeconds = 3600) {
        try {
            if (redisConnection.status !== 'ready') return false;
            const stringValue = JSON.stringify(value);
            await redisConnection.set(key, stringValue, 'EX', ttlInSeconds);
            return true;
        } catch (error) {
            // Silence cache logs as per user request
            // console.error(`[Cache] Error setting key ${key}:`, error.message);
            return false;
        }
    },

    /**
     * Delete key from cache
     * @param {string} key 
     */
    async del(key) {
        try {
            if (redisConnection.status !== 'ready') return false;
            await redisConnection.del(key);
            return true;
        } catch (error) {
            // Silence cache logs as per user request
            // console.error(`[Cache] Error deleting key ${key}:`, error.message);
            return false;
        }
    },

    /**
     * Delete keys matching a pattern
     * @param {string} pattern - e.g. "shifts:*"
     */
    async delByPattern(pattern) {
        try {
            if (redisConnection.status !== 'ready') return false;
            const keys = await redisConnection.keys(pattern);
            if (keys.length > 0) {
                await redisConnection.del(...keys);
            }
            return true;
        } catch (error) {
            // Silence cache logs as per user request
            // console.error(`[Cache] Error deleting pattern ${pattern}:`, error.message);
            return false;
        }
    }
};

module.exports = cacheService;
