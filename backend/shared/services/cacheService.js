const { redis } = require('../jobs/queueManager'); // Reuse the redis instance from queueManager

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
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error(`[Cache] Error getting key ${key}:`, error.message);
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
            const stringValue = JSON.stringify(value);
            await redis.set(key, stringValue, 'EX', ttlInSeconds);
            return true;
        } catch (error) {
            console.error(`[Cache] Error setting key ${key}:`, error.message);
            return false;
        }
    },

    /**
     * Delete key from cache
     * @param {string} key 
     */
    async del(key) {
        try {
            await redis.del(key);
            return true;
        } catch (error) {
            console.error(`[Cache] Error deleting key ${key}:`, error.message);
            return false;
        }
    },

    /**
     * Delete keys matching a pattern
     * @param {string} pattern - e.g. "shifts:*"
     */
    async delByPattern(pattern) {
        try {
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
            return true;
        } catch (error) {
            console.error(`[Cache] Error deleting pattern ${pattern}:`, error.message);
            return false;
        }
    }
};

module.exports = cacheService;
