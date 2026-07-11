export type QualificationFieldConfig = {
  id: string;
  label: string;
  type: string;
  isRequired?: boolean;
  isEnabled?: boolean;
  placeholder?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    step?: number;
    minLabel?: string;
    maxLabel?: string;
  };
  options?: Array<{ label: string; value: string }>;
  gridRows?: string[];
  order?: number;
};

export type QualificationsConfig = {
  isEnabled: boolean;
  enableCertificateUpload?: boolean;
  fields: QualificationFieldConfig[];
  defaultRows?: Record<string, unknown>[];
};

export type QualificationScopeType =
  | 'division'
  | 'department'
  | 'designation'
  | 'department_designation'
  | 'division_designation'
  | 'division_department'
  | 'division_department_designation';

export const QUALIFICATION_SCOPE_LABELS: Record<QualificationScopeType, string> = {
  division: 'Division default',
  department: 'Department default',
  designation: 'Designation default',
  department_designation: 'Department + Designation',
  division_designation: 'Division + Designation',
  division_department: 'Division + Department',
  division_department_designation: 'Division + Department + Designation',
};

export const QUALIFICATION_SCOPE_REQUIRED: Record<QualificationScopeType, Array<'division_id' | 'department_id' | 'designation_id'>> = {
  division: ['division_id'],
  department: ['department_id'],
  designation: ['designation_id'],
  department_designation: ['department_id', 'designation_id'],
  division_designation: ['division_id', 'designation_id'],
  division_department: ['division_id', 'department_id'],
  division_department_designation: ['division_id', 'department_id', 'designation_id'],
};

export type ResolvedQualificationProfile = QualificationsConfig & {
  source: QualificationScopeType | 'global';
  scopeType?: QualificationScopeType | null;
  scopeKey?: string | null;
  profileId?: string | null;
  division_id?: string | null;
  department_id?: string | null;
  designation_id?: string | null;
};

export function idFromRef(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && value !== null && '_id' in (value as object)) {
    return String((value as { _id?: string })._id || '');
  }
  return String(value);
}

/** Keep applicant rows; replace org pre-filled rows when org scope context changes. */
export function mergeQualificationsOnProfileChange(
  existingQuals: unknown[],
  newDefaultRows: Record<string, unknown>[]
): Record<string, unknown>[] {
  const list = Array.isArray(existingQuals) ? existingQuals : [];
  const applicantRows = list.filter(
    (row) => row && typeof row === 'object' && (row as { isPreFilled?: boolean }).isPreFilled !== true
  ) as Record<string, unknown>[];
  const prefilled = (newDefaultRows || []).map((row) => ({
    ...row,
    isPreFilled: true,
  }));
  return [...prefilled, ...applicantRows];
}

export function seedQualificationsFromDefaults(
  existingQuals: unknown[],
  defaultRows: Record<string, unknown>[]
): Record<string, unknown>[] | null {
  const list = Array.isArray(existingQuals) ? existingQuals : [];
  if (list.length > 0 || !defaultRows?.length) return null;
  return defaultRows.map((row) => ({ ...row, isPreFilled: true }));
}

export function resolvedToQualificationsConfig(resolved: ResolvedQualificationProfile | null | undefined): QualificationsConfig | null {
  if (!resolved) return null;
  return {
    isEnabled: resolved.isEnabled !== false,
    enableCertificateUpload: !!resolved.enableCertificateUpload,
    fields: Array.isArray(resolved.fields) ? resolved.fields : [],
    defaultRows: Array.isArray(resolved.defaultRows) ? resolved.defaultRows : [],
  };
}

/** Deep-clone qualifications config for profile draft (columns, rows, toggles). */
export function cloneQualificationsConfigForDraft(
  source: Partial<QualificationsConfig> | null | undefined
): QualificationsConfig {
  if (!source) {
    return {
      isEnabled: true,
      enableCertificateUpload: false,
      fields: [],
      defaultRows: [],
    };
  }
  return {
    isEnabled: source.isEnabled !== false,
    enableCertificateUpload: !!source.enableCertificateUpload,
    fields: Array.isArray(source.fields)
      ? source.fields.map((f) => ({
          id: String(f.id || '').trim(),
          label: String(f.label || '').trim(),
          type: f.type || 'text',
          isRequired: !!f.isRequired,
          isEnabled: f.isEnabled !== false,
          placeholder: f.placeholder || '',
          validation: f.validation ? { ...f.validation } : undefined,
          options: Array.isArray(f.options) ? f.options.map((o) => ({ ...o })) : undefined,
          order: f.order ?? 0,
        }))
      : [],
    defaultRows: Array.isArray(source.defaultRows)
      ? source.defaultRows.map((row) => ({ ...(row as Record<string, unknown>) }))
      : [],
  };
}

type FormSettingsQualificationsInput = {
  qualifications?: Partial<Omit<QualificationsConfig, 'fields'>> & {
    fields?: Array<Partial<QualificationFieldConfig> & Pick<QualificationFieldConfig, 'id' | 'label'>>;
  };
} | null | undefined;

function normalizeQualificationFields(
  fields?: Array<Partial<QualificationFieldConfig> & Pick<QualificationFieldConfig, 'id' | 'label'>>
): QualificationFieldConfig[] {
  if (!Array.isArray(fields)) return [];
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type ?? 'text',
    isRequired: f.isRequired,
    isEnabled: f.isEnabled,
    placeholder: f.placeholder,
    validation: f.validation,
    options: f.options,
    order: f.order,
  }));
}

export function globalQualificationsFromFormSettings(
  formSettings?: FormSettingsQualificationsInput
): QualificationsConfig | null {
  const q = formSettings?.qualifications;
  if (!q) return null;
  return {
    isEnabled: q.isEnabled !== false,
    enableCertificateUpload: !!q.enableCertificateUpload,
    fields: normalizeQualificationFields(q.fields),
    defaultRows: Array.isArray(q.defaultRows) ? q.defaultRows : [],
  };
}

export function buildQualFieldIdToLabelMap(fields: QualificationFieldConfig[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  (fields || []).forEach((f) => {
    if (f?.id && f?.label) map[f.id] = f.label;
  });
  return map;
}

export async function resolveQualConfigForEmployeeForm(
  divisionId: string,
  departmentId: string,
  designationId: string,
  globalFallback?: QualificationsConfig | null
): Promise<QualificationsConfig | null> {
  const { api } = await import('./api');
  try {
    const res = await api.resolveQualificationProfile({
      divisionId: divisionId || undefined,
      departmentId: departmentId || undefined,
      designationId: designationId || undefined,
    });
    if (res.success && res.data) {
      return resolvedToQualificationsConfig(res.data as ResolvedQualificationProfile);
    }
  } catch {
    // use fallback
  }
  return globalFallback ?? null;
}
