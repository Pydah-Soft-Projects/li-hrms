/** Keys for Complete-table trailing totals (superadmin grid includes absent). */
const COMPLETE_SUMMARY_COLUMN_KEYS = [
  'present',
  'leaves',
  'od',
  'partial',
  'absent',
  'weekOffs',
  'holidays',
  'otHours',
  'extraHours',
  'permissions',
  'lateEarly',
  'attDed',
  'payableShifts',
];

const WORKSPACE_COMPLETE_SUMMARY_KEYS = COMPLETE_SUMMARY_COLUMN_KEYS.filter((k) => k !== 'absent');

/**
 * Merge stored booleans with defaults (all true). Ensures at least one visible column per view.
 * @param {Record<string, boolean>|undefined|null} stored
 * @returns {Record<string, boolean>}
 */
function normalizeCompleteSummaryColumns(stored) {
  const out = {};
  for (const k of COMPLETE_SUMMARY_COLUMN_KEYS) {
    out[k] = stored && typeof stored[k] === 'boolean' ? stored[k] : true;
  }
  if (!WORKSPACE_COMPLETE_SUMMARY_KEYS.some((k) => out[k])) {
    out.present = true;
  }
  if (!COMPLETE_SUMMARY_COLUMN_KEYS.some((k) => out[k])) {
    out.present = true;
  }
  return out;
}

module.exports = {
  COMPLETE_SUMMARY_COLUMN_KEYS,
  WORKSPACE_COMPLETE_SUMMARY_KEYS,
  normalizeCompleteSummaryColumns,
};
