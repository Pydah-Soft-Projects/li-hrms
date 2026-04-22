/**
 * Per–leave-type scheduled pool on each FY month slot: map + legacy CL/EL/CCL fields stay in sync.
 */

const LEGACY = {
  CL: 'clCredits',
  EL: 'elCredits',
  CCL: 'compensatoryOffs',
};

/**
 * Merged view for API (IST): every active type we care about, with CL/EL/CCL from legacy if missing in map.
 * @param {object} slot
 * @returns {Record<string, number>}
 */
function buildCreditsByTypeForSlot(slot) {
  if (!slot || typeof slot !== 'object') {
    return { CL: 0, EL: 0, CCL: 0 };
  }
  const raw = slot.scheduledCreditsByType;
  const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  for (const [code, key] of Object.entries(LEGACY)) {
    if (map[code] == null || (typeof map[code] === 'number' && !Number.isFinite(map[code]))) {
      map[code] = Math.max(0, Number(slot[key]) || 0);
    } else {
      map[code] = Math.max(0, Number(map[code]) || 0);
    }
  }
  for (const k of Object.keys(map)) {
    if (map[k] != null) map[k] = Math.max(0, Number(map[k]) || 0);
  }
  return map;
}

/**
 * Keep map aligned with the three legacy number fields.
 * @param {object} slot
 */
function syncSlotLegacyToScheduledMap(slot) {
  if (!slot) return;
  if (!slot.scheduledCreditsByType || typeof slot.scheduledCreditsByType !== 'object') {
    slot.scheduledCreditsByType = {};
  }
  const m = slot.scheduledCreditsByType;
  m.CL = Math.max(0, Number(slot.clCredits) || 0);
  m.EL = Math.max(0, Number(slot.elCredits) || 0);
  m.CCL = Math.max(0, Number(slot.compensatoryOffs) || 0);
}

/**
 * Apply a patch object { PL: 1, ... } and sync legacy for CL/EL/CCL.
 * @param {object} slot
 * @param {Record<string, number|undefined|null>} patch
 */
function mergeScheduledCreditsTypePatch(slot, patch) {
  if (!slot || !patch || typeof patch !== 'object') return;
  if (!slot.scheduledCreditsByType || typeof slot.scheduledCreditsByType !== 'object') {
    slot.scheduledCreditsByType = {};
  }
  for (const [code, v] of Object.entries(patch)) {
    const c = String(code).toUpperCase();
    if (v === undefined || v === null) continue;
    const n = Math.max(0, Number(v) || 0);
    slot.scheduledCreditsByType[c] = n;
    if (LEGACY[c]) {
      slot[LEGACY[c]] = n;
    }
  }
  syncSlotLegacyToScheduledMap(slot);
}

module.exports = {
  buildCreditsByTypeForSlot,
  syncSlotLegacyToScheduledMap,
  mergeScheduledCreditsTypePatch,
  LEGACY_FIELD: LEGACY,
};
