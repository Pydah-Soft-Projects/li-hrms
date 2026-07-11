import type { LucideIcon } from 'lucide-react';
import {
  AlignLeft,
  AlignJustify,
  Hash,
  Calendar,
  Clock,
  Mail,
  Phone,
  CircleDot,
  CheckSquare,
  ChevronDown,
  ToggleLeft,
  Upload,
  Users,
  List,
  Layers,
  Star,
  SlidersHorizontal,
  Grid3x3,
  LayoutGrid,
} from 'lucide-react';

export type FieldValidation = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
  /** Linear scale: label at lowest point */
  minLabel?: string;
  /** Linear scale: label at highest point */
  maxLabel?: string;
  /** Multiselect / checkbox grid: minimum selections */
  minSelections?: number;
  /** Multiselect / checkbox grid: maximum selections */
  maxSelections?: number;
  /** Rating: show half stars (future) */
  allowHalf?: boolean;
  /** File upload: max size in MB */
  maxFileSizeMb?: number;
  /** File upload: accepted extensions e.g. .pdf,.jpg */
  accept?: string;
};

export type FieldOption = { label: string; value: string };

export type FieldTypeDefinition = {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type FieldTypeGroup = {
  label: string;
  types: FieldTypeDefinition[];
};

/** Shared field draft used in column/question builders */
export type FieldConfigDraft = {
  id?: string;
  label: string;
  type: string;
  isRequired: boolean;
  isEnabled: boolean;
  placeholder: string;
  order?: number;
  validation?: FieldValidation;
  options?: FieldOption[];
  /** Row labels for grid types (questions down the left) */
  gridRows?: string[];
  minItems?: number;
  maxItems?: number;
};

export type QualificationColumnDraft = FieldConfigDraft;

export const emptyFieldConfigDraft = (): FieldConfigDraft => ({
  label: '',
  type: 'text',
  isRequired: false,
  isEnabled: true,
  placeholder: '',
  validation: {},
  options: [],
  gridRows: [],
});

export const emptyQualificationColumnDraft = emptyFieldConfigDraft;

/** Google Forms–style types for employee application form questions */
export const EMPLOYEE_FORM_FIELD_GROUPS: FieldTypeGroup[] = [
  {
    label: 'Text',
    types: [
      { value: 'text', label: 'Short answer', description: 'Single-line text response', icon: AlignLeft },
      { value: 'textarea', label: 'Paragraph', description: 'Longer multi-line text', icon: AlignJustify },
      { value: 'email', label: 'Email', description: 'Email address with format check', icon: Mail },
      { value: 'tel', label: 'Phone number', description: 'Mobile or landline number', icon: Phone },
    ],
  },
  {
    label: 'Choices',
    types: [
      { value: 'radio', label: 'Multiple choice', description: 'Pick exactly one option', icon: CircleDot },
      { value: 'select', label: 'Drop-down', description: 'Pick one option from a list', icon: ChevronDown },
      { value: 'multiselect', label: 'Checkboxes', description: 'Pick one or more options', icon: CheckSquare },
      { value: 'boolean', label: 'Yes / No', description: 'Simple yes or no answer', icon: ToggleLeft },
    ],
  },
  {
    label: 'Scale & rating',
    types: [
      { value: 'scale', label: 'Linear scale', description: 'Rate on a number line (e.g. 1–5)', icon: SlidersHorizontal },
      { value: 'rating', label: 'Rating', description: 'Star rating (e.g. 1–5 stars)', icon: Star },
    ],
  },
  {
    label: 'Grids',
    types: [
      { value: 'radio_grid', label: 'Multiple-choice grid', description: 'One choice per row in a table', icon: Grid3x3 },
      { value: 'checkbox_grid', label: 'Tick box grid', description: 'Multiple choices per row in a table', icon: LayoutGrid },
    ],
  },
  {
    label: 'Numbers & dates',
    types: [
      { value: 'number', label: 'Number', description: 'Numeric value with optional min/max', icon: Hash },
      { value: 'date', label: 'Date', description: 'Calendar date', icon: Calendar },
      { value: 'time', label: 'Time', description: 'Time of day', icon: Clock },
    ],
  },
  {
    label: 'Files & advanced',
    types: [
      { value: 'file', label: 'File upload', description: 'Upload a document or image', icon: Upload },
      { value: 'userselect', label: 'Choose person', description: 'Select a user from the system', icon: Users },
      { value: 'array', label: 'List of items', description: 'Repeatable rows in a table', icon: List },
      { value: 'object', label: 'Group of fields', description: 'Nested set of sub-fields', icon: Layers },
    ],
  },
];

/** Google Forms–style types for qualification table columns */
export const QUALIFICATION_FIELD_GROUPS: FieldTypeGroup[] = [
  {
    label: 'Text',
    types: [
      { value: 'text', label: 'Short answer', description: 'Single-line text in a table cell', icon: AlignLeft },
      { value: 'textarea', label: 'Paragraph', description: 'Multi-line text in a cell', icon: AlignJustify },
      { value: 'email', label: 'Email', description: 'Email address', icon: Mail },
      { value: 'tel', label: 'Phone number', description: 'Phone or mobile number', icon: Phone },
    ],
  },
  {
    label: 'Choices',
    types: [
      { value: 'radio', label: 'Multiple choice', description: 'Pick exactly one option', icon: CircleDot },
      { value: 'multiselect', label: 'Checkboxes', description: 'Pick multiple options', icon: CheckSquare },
      { value: 'select', label: 'Drop-down', description: 'Compact single-choice list', icon: ChevronDown },
      { value: 'boolean', label: 'Yes / No', description: 'Simple yes or no toggle', icon: ToggleLeft },
    ],
  },
  {
    label: 'Scale & rating',
    types: [
      { value: 'scale', label: 'Linear scale', description: 'Rate 1–5 or custom range in a cell', icon: SlidersHorizontal },
      { value: 'rating', label: 'Rating', description: 'Star rating in a cell', icon: Star },
    ],
  },
  {
    label: 'Grids',
    types: [
      { value: 'radio_grid', label: 'Multiple-choice grid', description: 'One choice per row', icon: Grid3x3 },
      { value: 'checkbox_grid', label: 'Tick box grid', description: 'Multiple choices per row', icon: LayoutGrid },
    ],
  },
  {
    label: 'Numbers & dates',
    types: [
      { value: 'number', label: 'Number', description: 'Numeric score, percentage, etc.', icon: Hash },
      { value: 'date', label: 'Date', description: 'Passing date or completion date', icon: Calendar },
      { value: 'time', label: 'Time', description: 'Time of day', icon: Clock },
    ],
  },
];

export const QUALIFICATION_FIELD_TYPE_VALUES = QUALIFICATION_FIELD_GROUPS.flatMap((g) =>
  g.types.map((t) => t.value)
);

export const EMPLOYEE_FORM_FIELD_TYPE_VALUES = EMPLOYEE_FORM_FIELD_GROUPS.flatMap((g) =>
  g.types.map((t) => t.value)
);

export function flattenFieldGroups(groups: FieldTypeGroup[]): FieldTypeDefinition[] {
  return groups.flatMap((g) => g.types);
}

export function getFieldTypeLabel(groups: FieldTypeGroup[], type: string): string {
  const hit = flattenFieldGroups(groups).find((t) => t.value === type);
  return hit?.label || type;
}

export function fieldTypeNeedsOptions(type: string): boolean {
  return type === 'select' || type === 'multiselect' || type === 'radio';
}

export function fieldTypeNeedsGrid(type: string): boolean {
  return type === 'radio_grid' || type === 'checkbox_grid';
}

export function fieldTypeIsScale(type: string): boolean {
  return type === 'scale';
}

export function fieldTypeIsRating(type: string): boolean {
  return type === 'rating';
}

export function fieldTypeSupportsTextValidation(type: string): boolean {
  return type === 'text' || type === 'textarea' || type === 'email' || type === 'tel';
}

export function fieldTypeSupportsNumberValidation(type: string): boolean {
  return type === 'number';
}

export function fieldTypeSupportsMultiselectLimits(type: string): boolean {
  return type === 'multiselect' || type === 'checkbox_grid';
}

export function slugifyFieldId(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/** Default validation/options when user switches field type */
export function defaultConfigForFieldType(type: string): Partial<FieldConfigDraft> {
  switch (type) {
    case 'scale':
      return {
        validation: { min: 1, max: 5, step: 1, minLabel: 'Lowest', maxLabel: 'Highest' },
        options: [],
        gridRows: [],
      };
    case 'rating':
      return {
        validation: { min: 1, max: 5, step: 1 },
        options: [],
        gridRows: [],
      };
    case 'number':
      return { validation: { min: 0, max: 100, step: 1 }, options: [], gridRows: [] };
    case 'radio_grid':
    case 'checkbox_grid':
      return { options: [], gridRows: ['Row 1'] };
    case 'select':
    case 'radio':
    case 'multiselect':
      return { options: [], gridRows: [], validation: {} };
    case 'boolean':
      return {
        options: [
          { label: 'Yes', value: 'true' },
          { label: 'No', value: 'false' },
        ],
        gridRows: [],
        validation: {},
      };
    case 'file':
      return { validation: { maxFileSizeMb: 5, accept: '.pdf,.jpg,.jpeg,.png' }, options: [], gridRows: [] };
    case 'array':
      return { minItems: 0, maxItems: 10, options: [], gridRows: [], validation: {} };
    default:
      return { validation: {}, options: [], gridRows: [] };
  }
}

export function validateFieldConfigDraft(draft: FieldConfigDraft): string | null {
  if (!draft.label.trim()) return 'Name is required';
  if (fieldTypeNeedsOptions(draft.type) && !(draft.options || []).length) {
    return 'Add at least one answer choice';
  }
  if (fieldTypeNeedsGrid(draft.type)) {
    if (!(draft.gridRows || []).filter((r) => r.trim()).length) return 'Add at least one grid row';
    if (!(draft.options || []).length) return 'Add at least one grid column';
  }
  if (fieldTypeIsScale(draft.type)) {
    const min = draft.validation?.min ?? 1;
    const max = draft.validation?.max ?? 5;
    if (max <= min) return 'Scale maximum must be greater than minimum';
  }
  if (fieldTypeIsRating(draft.type)) {
    const max = draft.validation?.max ?? 5;
    if (max < 1 || max > 10) return 'Rating must be between 1 and 10 stars';
  }
  return null;
}
