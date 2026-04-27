/**
 * Canonical qualification / certificate verification values (employee-level and per-row qual.status).
 */
export const QUALIFICATION_VERIFICATION_VALUES = [
  'verified',
  'partial_verified',
  'taken',
  'not_submitted',
] as const;

export type QualificationVerificationValue = (typeof QUALIFICATION_VERIFICATION_VALUES)[number];

export const DEFAULT_QUALIFICATION_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'verified', label: 'Verified' },
  { value: 'partial_verified', label: 'Partially verified' },
  { value: 'taken', label: 'Taken' },
  { value: 'not_submitted', label: 'Not submitted' },
];

const LEGACY_TO_CANONICAL: Record<string, QualificationVerificationValue> = {
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

/** Map stored / legacy strings to one of the four canonical values. */
export function canonicalQualificationStatus(
  raw: string | undefined | null
): QualificationVerificationValue {
  if (raw == null || String(raw).trim() === '') return 'not_submitted';
  const trimmed = String(raw).trim();
  const mapped = LEGACY_TO_CANONICAL[trimmed];
  if (mapped) return mapped;
  if ((QUALIFICATION_VERIFICATION_VALUES as readonly string[]).includes(trimmed)) {
    return trimmed as QualificationVerificationValue;
  }
  return 'not_submitted';
}

/** Options for selects: always the four stages, with optional overrides from settings (by value). */
export function getQualificationStatusSelectOptions(formSettings?: {
  qualification_statuses?: Array<string | { value: string; label: string }>;
}): { value: string; label: string }[] {
  const byValue = new Map<string, { value: string; label: string }>();
  DEFAULT_QUALIFICATION_STATUS_OPTIONS.forEach((o) => byValue.set(o.value, { ...o }));

  const raw = formSettings?.qualification_statuses;
  if (Array.isArray(raw) && raw.length > 0) {
    raw.forEach((entry) => {
      if (typeof entry === 'string') {
        const v = canonicalQualificationStatus(entry);
        const label =
          DEFAULT_QUALIFICATION_STATUS_OPTIONS.find((d) => d.value === v)?.label ?? entry;
        byValue.set(v, { value: v, label });
      } else if (entry && typeof entry === 'object' && entry.value != null) {
        const v = canonicalQualificationStatus(entry.value);
        const label = entry.label || DEFAULT_QUALIFICATION_STATUS_OPTIONS.find((d) => d.value === v)?.label || v;
        byValue.set(v, { value: v, label });
      }
    });
  }

  return QUALIFICATION_VERIFICATION_VALUES.map((v) => byValue.get(v)!);
}

export function qualificationStatusLabel(
  raw: string | undefined | null,
  formSettings?: { qualification_statuses?: Array<string | { value: string; label: string }> }
): string {
  const c = canonicalQualificationStatus(raw);
  const opts = getQualificationStatusSelectOptions(formSettings);
  return opts.find((o) => o.value === c)?.label ?? c;
}

/** Tailwind classes for compact badges (list / table). */
export function qualificationStatusBadgeClass(raw: string | undefined | null): string {
  const c = canonicalQualificationStatus(raw);
  switch (c) {
    case 'verified':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
    case 'partial_verified':
      return 'bg-amber-500/10 text-amber-800 dark:text-amber-300';
    case 'taken':
      return 'bg-sky-500/10 text-sky-800 dark:text-sky-300';
    case 'not_submitted':
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400';
  }
}
