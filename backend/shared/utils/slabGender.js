/**
 * Shared gender matching for OT / auto-edge permission slabs.
 * Values: All | Male | Female | Other (default All = everyone).
 * Prefer exact gender match, then fall back to All.
 */

const SLAB_GENDERS = ['All', 'Male', 'Female', 'Other'];

function normalizeSlabGender(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return 'All';
  const hit = SLAB_GENDERS.find((g) => g.toLowerCase() === raw.toLowerCase());
  return hit || 'All';
}

function sanitizeSlabGender(value) {
  return normalizeSlabGender(value);
}

/**
 * Among duration-matched candidates, pick exact gender first, else All.
 * @param {Array} candidates - already filtered by duration / minutes
 * @param {string|null} employeeGender
 */
function pickByGender(candidates, employeeGender) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const emp = normalizeSlabGender(employeeGender);

  const exact = candidates.filter((r) => {
    const g = normalizeSlabGender(r?.gender);
    return g !== 'All' && g.toLowerCase() === emp.toLowerCase();
  });
  if (exact.length) return exact[0];

  const all = candidates.filter((r) => normalizeSlabGender(r?.gender) === 'All');
  if (all.length) return all[0];

  // No All and no exact: do not use another gender's slab
  return null;
}

/**
 * True if a slab may apply to this employee (exact gender or All).
 */
function slabAppliesToGender(range, employeeGender) {
  const g = normalizeSlabGender(range?.gender);
  if (g === 'All') return true;
  const emp = normalizeSlabGender(employeeGender);
  if (!employeeGender || emp === 'All') return false;
  return g.toLowerCase() === emp.toLowerCase();
}

module.exports = {
  SLAB_GENDERS,
  normalizeSlabGender,
  sanitizeSlabGender,
  pickByGender,
  slabAppliesToGender,
};
