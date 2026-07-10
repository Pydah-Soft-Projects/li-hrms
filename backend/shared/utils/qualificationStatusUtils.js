const DEFAULT_OVERALL_OPTIONS = [
  { value: 'verified', label: 'Verified' },
  { value: 'partial_verified', label: 'Partially verified' },
  { value: 'taken', label: 'Taken' },
  { value: 'not_submitted', label: 'Not submitted' },
];

const ROW_STATUS_LABELS = {
  verified: 'Verified',
  partial_verified: 'Partially verified',
  taken: 'Taken',
  not_submitted: 'Not submitted',
};

const LEGACY_TO_CANONICAL = {
  partial: 'partial_verified',
  Partial: 'partial_verified',
  pending: 'partial_verified',
  'partial verified': 'partial_verified',
  'partially verified': 'partial_verified',
  'Partially verified': 'partial_verified',
  verified: 'verified',
  Certified: 'verified',
  certified: 'verified',
  'Not Certified': 'not_submitted',
  'not certified': 'not_submitted',
  'Not Uploaded': 'not_submitted',
  'not uploaded': 'not_submitted',
  'Not submitted': 'not_submitted',
  taken: 'taken',
  Taken: 'taken',
};

function canonicalRowStatus(raw) {
  if (raw == null || String(raw).trim() === '') return 'not_submitted';
  const trimmed = String(raw).trim();
  if (LEGACY_TO_CANONICAL[trimmed]) return LEGACY_TO_CANONICAL[trimmed];
  if (Object.prototype.hasOwnProperty.call(ROW_STATUS_LABELS, trimmed)) return trimmed;
  return 'not_submitted';
}

function parseOverallStatusOptions(raw) {
  const map = new Map();
  DEFAULT_OVERALL_OPTIONS.forEach((o) => map.set(o.value, { ...o }));

  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (typeof entry === 'string') {
        const v = entry.trim();
        if (v) map.set(v, { value: v, label: v });
      } else if (entry && typeof entry === 'object' && entry.value != null) {
        const v = String(entry.value).trim();
        if (v) {
          const label = String(entry.label ?? entry.value).trim() || v;
          map.set(v, { value: v, label });
        }
      }
    });
  }

  return [...map.values()];
}

function overallQualificationStatusLabel(raw, options) {
  const v = raw != null ? String(raw).trim() : '';
  if (!v) return 'Not set';
  const hit = options.find((o) => o.value === v);
  return hit ? hit.label : v;
}

function rowQualificationStatusLabel(raw) {
  const canonical = canonicalRowStatus(raw);
  return ROW_STATUS_LABELS[canonical] || String(raw || 'Not submitted');
}

module.exports = {
  DEFAULT_OVERALL_OPTIONS,
  canonicalRowStatus,
  parseOverallStatusOptions,
  overallQualificationStatusLabel,
  rowQualificationStatusLabel,
};
