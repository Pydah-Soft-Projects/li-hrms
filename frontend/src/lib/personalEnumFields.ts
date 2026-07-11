export type FieldOption = { label: string; value: string };

export const GENDER_OPTIONS: FieldOption[] = [
  { label: 'Male', value: 'Male' },
  { label: 'Female', value: 'Female' },
  { label: 'Other', value: 'Other' },
];

export const MARITAL_STATUS_OPTIONS: FieldOption[] = [
  { label: 'Single', value: 'Single' },
  { label: 'Married', value: 'Married' },
  { label: 'Divorced', value: 'Divorced' },
  { label: 'Widowed', value: 'Widowed' },
];

export const BLOOD_GROUP_OPTIONS: FieldOption[] = [
  { label: 'A+', value: 'A+' },
  { label: 'A-', value: 'A-' },
  { label: 'B+', value: 'B+' },
  { label: 'B-', value: 'B-' },
  { label: 'AB+', value: 'AB+' },
  { label: 'AB-', value: 'AB-' },
  { label: 'O+', value: 'O+' },
  { label: 'O-', value: 'O-' },
];

const PERSONAL_ENUM_FIELDS: Record<string, FieldOption[]> = {
  gender: GENDER_OPTIONS,
  marital_status: MARITAL_STATUS_OPTIONS,
  blood_group: BLOOD_GROUP_OPTIONS,
};

export function isPersonalEnumFieldId(fieldId: string): boolean {
  return fieldId in PERSONAL_ENUM_FIELDS;
}

/** Ensure gender, marital status, and blood group always render as select dropdowns. */
export function normalizePersonalEnumField<T extends { id: string; type?: string; dataType?: string; options?: FieldOption[] }>(
  field: T
): T {
  const options = PERSONAL_ENUM_FIELDS[field.id];
  if (!options) return field;
  return {
    ...field,
    type: 'select',
    dataType: field.dataType || 'string',
    options,
  };
}
