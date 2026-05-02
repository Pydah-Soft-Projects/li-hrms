/**
 * Mongoose optimistic concurrency: failed saves often throw VersionError or
 * "No matching document found … version …" when another writer updates the same document.
 */

function isOptimisticLockConflict(err) {
  if (!err) return false;
  if (err.name === 'VersionError') return true;
  const msg = String(err.message || '');
  return msg.includes('No matching document found') && msg.includes('version');
}

function optimisticRetryDelayMs(attempt) {
  return Math.min(4000, 100 * Math.pow(2, Math.min(attempt - 1, 8)));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number }} [opts]
 * @returns {Promise<T>}
 */
async function withOptimisticRetry(fn, opts = {}) {
  const max = opts.maxAttempts ?? 12;
  let last;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isOptimisticLockConflict(e) || attempt === max) throw e;
      await sleep(optimisticRetryDelayMs(attempt));
    }
  }
  throw last;
}

module.exports = {
  isOptimisticLockConflict,
  withOptimisticRetry,
  optimisticRetryDelayMs,
  sleep,
};
