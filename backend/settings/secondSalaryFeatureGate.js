const Settings = require('./model/Settings');

const CACHE_TTL_MS = 5000;
let cache = { value: true, expiresAt: 0 };

/**
 * When the Settings document is missing, default to true (existing deployments keep 2nd salary on).
 * When value is explicitly false, second salary is off everywhere.
 */
async function isSecondSalaryGloballyEnabled() {
  const now = Date.now();
  if (now < cache.expiresAt) {
    return cache.value;
  }
  try {
    const doc = await Settings.findOne({ key: 'enable_second_salary' }).select('value').lean();
    const enabled = doc == null ? true : doc.value === true;
    cache = { value: enabled, expiresAt: now + CACHE_TTL_MS };
    return enabled;
  } catch (e) {
    console.error('[secondSalaryFeatureGate] read failed:', e.message);
    return true;
  }
}

function invalidateSecondSalaryFeatureCache() {
  cache = { value: true, expiresAt: 0 };
}

module.exports = {
  isSecondSalaryGloballyEnabled,
  invalidateSecondSalaryFeatureCache,
};
