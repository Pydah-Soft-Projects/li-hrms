/**
 * Row-level qualification card status: fixed stages + legacy mapping.
 * Overall employee `qualificationStatus` is free-form (see mergeOverallQualificationStatusOptions).
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

/**
 * Last `<option value>` on overall-certificate `<select>`s. Never stored on employees;
 * choosing it opens add/manage UI and the visible value stays on the prior selection.
 */
export const OVERALL_CERTIFICATE_STATUS_SELECT_ADD_SENTINEL =
  '__li_hrms_overall_cert_status_add__';

const PRESET_OVERALL_VALUES = new Set(DEFAULT_QUALIFICATION_STATUS_OPTIONS.map((o) => o.value));

/** True when overall status value is one of the four built-in certificate stages. */
export function isPresetOverallCertificateStatusValue(value: string | undefined | null): boolean {
  if (value == null) return false;
  return PRESET_OVERALL_VALUES.has(String(value).trim());
}

/**
 * Label for the "stage" column in manage UI: built-in rows map to the standard stage name;
 * any other stored value is treated as an organization custom status.
 */
export function overallCertificateStatusStageLabel(value: string | undefined | null): string {
  if (value == null || String(value).trim() === '') return '—';
  const v = String(value).trim();
  if (PRESET_OVERALL_VALUES.has(v)) {
    return DEFAULT_QUALIFICATION_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
  }
  return 'Custom';
}

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

/** Map stored / legacy strings to one of the four canonical values (per-row `qual.status` only). */
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

/** Options for per-row qualification selects. */
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

/** @deprecated for overall status — use overallQualificationStatusLabel + mergeOverallQualificationStatusOptions */
export function qualificationStatusLabel(
  raw: string | undefined | null,
  formSettings?: { qualification_statuses?: Array<string | { value: string; label: string }> }
): string {
  const c = canonicalQualificationStatus(raw);
  const opts = getQualificationStatusSelectOptions(formSettings);
  return opts.find((o) => o.value === c)?.label ?? c;
}

function entryToOverallOption(e: string | { value: string; label?: string }): { value: string; label: string } | null {
  if (typeof e === 'string') {
    const v = e.trim();
    if (!v) return null;
    return { value: v, label: v };
  }
  if (e && typeof e === 'object' && e.value != null) {
    const v = String(e.value).trim();
    if (!v) return null;
    const label = String(e.label ?? e.value).trim() || v;
    return { value: v, label };
  }
  return null;
}

/** Parse stored `qualification_statuses` setting value into option rows. */
export function rawSettingToOverallOptionArray(raw: unknown): { value: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  const map = new Map<string, { value: string; label: string }>();
  raw.forEach((e) => {
    const o = entryToOverallOption(e as any);
    if (o && o.value !== OVERALL_CERTIFICATE_STATUS_SELECT_ADD_SENTINEL) map.set(o.value, o);
  });
  return [...map.values()];
}

export function overallCertificateStatusInRawSetting(raw: unknown, value: string): boolean {
  const v = String(value).trim();
  if (!v) return false;
  return rawSettingToOverallOptionArray(raw).some((o) => o.value === v);
}

/**
 * Suggestions for overall employee certificate status: presets, saved settings entries,
 * and any value already used on employees (so custom values propagate across the org).
 */
export function mergeOverallQualificationStatusOptions(args: {
  settingList?: unknown;
  employeeValues?: (string | null | undefined)[];
  current?: string | null;
  includePresetDefaults?: boolean;
}): { value: string; label: string }[] {
  const map = new Map<string, { value: string; label: string }>();

  if (args.includePresetDefaults !== false) {
    DEFAULT_QUALIFICATION_STATUS_OPTIONS.forEach((o) => map.set(o.value, { ...o }));
  }

  const raw = args.settingList;
  if (Array.isArray(raw)) {
    raw.forEach((e) => {
      const o = entryToOverallOption(e as any);
      if (o && o.value !== OVERALL_CERTIFICATE_STATUS_SELECT_ADD_SENTINEL) map.set(o.value, o);
    });
  }

  (args.employeeValues || []).forEach((s) => {
    const v = s != null ? String(s).trim() : '';
    if (!v || v === OVERALL_CERTIFICATE_STATUS_SELECT_ADD_SENTINEL) return;
    if (!map.has(v)) map.set(v, { value: v, label: v });
  });

  const cur = args.current != null ? String(args.current).trim() : '';
  if (cur && cur !== OVERALL_CERTIFICATE_STATUS_SELECT_ADD_SENTINEL && !map.has(cur)) {
    map.set(cur, { value: cur, label: cur });
  }

  const presetOrder = DEFAULT_QUALIFICATION_STATUS_OPTIONS.map((x) => x.value);
  const preset = presetOrder.filter((v) => map.has(v)).map((v) => map.get(v)!);
  const rest = [...map.values()]
    .filter((o) => !presetOrder.includes(o.value))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

  return [...preset, ...rest];
}

export function overallQualificationStatusLabel(
  raw: string | undefined | null,
  options: { value: string; label: string }[]
): string {
  const v = raw != null ? String(raw).trim() : '';
  if (!v) return 'Not set';
  const hit = options.find((o) => o.value === v);
  if (hit) return hit.label;
  return v;
}

export function sanitizeOverallQualificationStatusStore(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  return t === '' ? null : t;
}

/** Heuristic badge for list/table (supports custom text). */
export function qualificationStatusBadgeClass(raw: string | undefined | null): string {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'verified' || v === 'certified') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  }
  if (v.includes('partial') || v === 'pending') {
    return 'bg-amber-500/10 text-amber-800 dark:text-amber-300';
  }
  if (v === 'taken') {
    return 'bg-sky-500/10 text-sky-800 dark:text-sky-300';
  }
  if (v === 'not_submitted' || v === 'not certified' || v === 'not uploaded' || v === '') {
    return 'bg-slate-500/10 text-slate-600 dark:text-slate-400';
  }
  return 'bg-violet-500/10 text-violet-800 dark:text-violet-300';
}

export function isVerifiedOverallStatusForIcon(raw?: string | null): boolean {
  const s = (raw || '').trim().toLowerCase();
  return s === 'verified' || s === 'certified';
}

type SettingsApi = {
  getSetting: (key: string) => Promise<{ success?: boolean; data?: { value?: unknown } }>;
  upsertSetting: (body: {
    key: string;
    value: unknown;
    category?: string;
    description?: string;
  }) => Promise<{ success?: boolean; data?: { value?: unknown } }>;
};

/** Append a new overall status to `qualification_statuses` (deduped). Used from the + add dialog. */
export async function appendOverallCertificateStatusToSetting(
  api: SettingsApi,
  rawInput: string
): Promise<{ ok: boolean; merged: { value: string; label: string }[] }> {
  const stored = sanitizeOverallQualificationStatusStore(rawInput);
  if (!stored || stored === OVERALL_CERTIFICATE_STATUS_SELECT_ADD_SENTINEL) {
    return { ok: false, merged: [] };
  }

  let list: { value: string; label: string }[] = [];
  try {
    const res = await api.getSetting('qualification_statuses');
    list = rawSettingToOverallOptionArray(res.success && res.data ? res.data.value : null);
  } catch {
    list = [];
  }

  if (list.some((o) => o.value === stored)) {
    return { ok: true, merged: list };
  }

  const nextList = [...list, { value: stored, label: stored }];
  try {
    const upsert = await api.upsertSetting({
      key: 'qualification_statuses',
      value: nextList,
      category: 'employee',
      description: 'Overall certificate status options for employees (shared suggestions)',
    });
    const merged = rawSettingToOverallOptionArray(upsert.success && upsert.data ? upsert.data.value : nextList);
    return { ok: !!upsert.success, merged: merged.length ? merged : nextList };
  } catch {
    return { ok: false, merged: list };
  }
}

/** Replace `qualification_statuses` with this ordered list (deduped by value, last label wins). */
export async function syncOverallCertificateStatusesToSetting(
  api: SettingsApi,
  entries: { value: string; label: string }[]
): Promise<{ ok: boolean; merged: { value: string; label: string }[] }> {
  const map = new Map<string, { value: string; label: string }>();
  for (const e of entries) {
    const v = String(e.value).trim();
    if (!v || v === OVERALL_CERTIFICATE_STATUS_SELECT_ADD_SENTINEL) continue;
    const label = String(e.label ?? v).trim() || v;
    map.set(v, { value: v, label });
  }
  const ordered = [...map.values()];
  if (!ordered.length) {
    return { ok: false, merged: [] };
  }
  try {
    const upsert = await api.upsertSetting({
      key: 'qualification_statuses',
      value: ordered,
      category: 'employee',
      description: 'Overall certificate status options for employees (shared suggestions)',
    });
    const merged = rawSettingToOverallOptionArray(upsert.success && upsert.data ? upsert.data.value : ordered);
    return { ok: !!upsert.success, merged: merged.length ? merged : ordered };
  } catch {
    return { ok: false, merged: [] };
  }
}
