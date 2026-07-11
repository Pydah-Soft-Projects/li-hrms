'use client';

import { X, Plus } from 'lucide-react';
import FieldOptionsEditor from './FieldOptionsEditor';
import type { FieldConfigDraft, FieldValidation } from '@/lib/fieldTypeConfig';
import {
  fieldTypeIsRating,
  fieldTypeIsScale,
  fieldTypeNeedsGrid,
  fieldTypeNeedsOptions,
  fieldTypeSupportsMultiselectLimits,
  fieldTypeSupportsNumberValidation,
  fieldTypeSupportsTextValidation,
} from '@/lib/fieldTypeConfig';

type Props = {
  draft: FieldConfigDraft;
  onChange: (draft: FieldConfigDraft) => void;
  /** Show placeholder field (columns/questions) */
  showPlaceholder?: boolean;
};

function numOrUndef(v: string): number | undefined {
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function patchValidation(draft: FieldConfigDraft, patch: Partial<FieldValidation>): FieldConfigDraft {
  return { ...draft, validation: { ...draft.validation, ...patch } };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function FieldTypeConfigPanel({ draft, onChange, showPlaceholder = true }: Props) {
  const set = (patch: Partial<FieldConfigDraft>) => onChange({ ...draft, ...patch });
  const v = draft.validation || {};

  return (
    <div className="space-y-4">
      {showPlaceholder && !fieldTypeNeedsGrid(draft.type) ? (
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            {draft.type === 'textarea' ? 'Help text / placeholder' : 'Placeholder / hint (optional)'}
          </label>
          <input
            type="text"
            value={draft.placeholder}
            onChange={(e) => set({ placeholder: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            placeholder="Shown to the user when the field is empty"
          />
        </div>
      ) : null}

      {/* Text length */}
      {fieldTypeSupportsTextValidation(draft.type) ? (
        <Section title="Text limits" hint="Optional character limits for this answer.">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Minimum length</label>
              <input
                type="number"
                min={0}
                value={v.minLength ?? ''}
                onChange={(e) => onChange(patchValidation(draft, { minLength: numOrUndef(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder="e.g. 2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Maximum length</label>
              <input
                type="number"
                min={0}
                value={v.maxLength ?? ''}
                onChange={(e) => onChange(patchValidation(draft, { maxLength: numOrUndef(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder="e.g. 500"
              />
            </div>
          </div>
        </Section>
      ) : null}

      {/* Number scalar */}
      {fieldTypeSupportsNumberValidation(draft.type) ? (
        <Section title="Number range" hint="Set allowed minimum, maximum, and step for numeric answers.">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Minimum</label>
              <input
                type="number"
                value={v.min ?? ''}
                onChange={(e) => onChange(patchValidation(draft, { min: numOrUndef(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Maximum</label>
              <input
                type="number"
                value={v.max ?? ''}
                onChange={(e) => onChange(patchValidation(draft, { max: numOrUndef(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Step</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={v.step ?? ''}
                onChange={(e) => onChange(patchValidation(draft, { step: numOrUndef(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder="1"
              />
            </div>
          </div>
        </Section>
      ) : null}

      {/* Linear scale */}
      {fieldTypeIsScale(draft.type) ? (
        <Section title="Linear scale settings" hint="Applicants pick one value on a scale (like Google Forms linear scale).">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Lowest value</label>
              <input
                type="number"
                value={v.min ?? 1}
                onChange={(e) => onChange(patchValidation(draft, { min: numOrUndef(e.target.value) ?? 1 }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Highest value</label>
              <input
                type="number"
                value={v.max ?? 5}
                onChange={(e) => onChange(patchValidation(draft, { max: numOrUndef(e.target.value) ?? 5 }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Step</label>
              <input
                type="number"
                min={1}
                value={v.step ?? 1}
                onChange={(e) => onChange(patchValidation(draft, { step: numOrUndef(e.target.value) ?? 1 }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Label for lowest point</label>
              <input
                type="text"
                value={v.minLabel ?? ''}
                onChange={(e) => onChange(patchValidation(draft, { minLabel: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder="e.g. Strongly disagree"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Label for highest point</label>
              <input
                type="text"
                value={v.maxLabel ?? ''}
                onChange={(e) => onChange(patchValidation(draft, { maxLabel: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder="e.g. Strongly agree"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">
            Point values shown: {buildScalePoints(v.min ?? 1, v.max ?? 5, v.step ?? 1).join(', ') || '—'}
          </p>
        </Section>
      ) : null}

      {/* Star rating */}
      {fieldTypeIsRating(draft.type) ? (
        <Section title="Rating settings" hint="How many stars (or points) can the user give?">
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Maximum rating (1–10)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={v.max ?? 5}
              onChange={(e) => onChange(patchValidation(draft, { max: numOrUndef(e.target.value) ?? 5, min: 1 }))}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">Users tap from 1 to {v.max ?? 5} stars.</p>
        </Section>
      ) : null}

      {/* Choice options */}
      {fieldTypeNeedsOptions(draft.type) ? (
        <FieldOptionsEditor options={draft.options || []} onChange={(options) => set({ options })} />
      ) : null}

      {/* Yes/No labels */}
      {draft.type === 'boolean' ? (
        <Section title="Yes / No labels" hint="Customize the labels shown for each option.">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Yes label</label>
              <input
                type="text"
                value={draft.options?.[0]?.label ?? 'Yes'}
                onChange={(e) =>
                  set({
                    options: [
                      { label: e.target.value, value: 'true' },
                      { label: draft.options?.[1]?.label ?? 'No', value: 'false' },
                    ],
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">No label</label>
              <input
                type="text"
                value={draft.options?.[1]?.label ?? 'No'}
                onChange={(e) =>
                  set({
                    options: [
                      { label: draft.options?.[0]?.label ?? 'Yes', value: 'true' },
                      { label: e.target.value, value: 'false' },
                    ],
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        </Section>
      ) : null}

      {/* Multiselect limits */}
      {fieldTypeSupportsMultiselectLimits(draft.type) && !fieldTypeNeedsGrid(draft.type) ? (
        <Section title="Selection limits" hint="How many options can the user tick?">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Minimum selections</label>
              <input
                type="number"
                min={0}
                value={v.minSelections ?? ''}
                onChange={(e) => onChange(patchValidation(draft, { minSelections: numOrUndef(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Maximum selections</label>
              <input
                type="number"
                min={1}
                value={v.maxSelections ?? ''}
                onChange={(e) => onChange(patchValidation(draft, { maxSelections: numOrUndef(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        </Section>
      ) : null}

      {/* Grid types */}
      {fieldTypeNeedsGrid(draft.type) ? (
        <>
          <Section
            title="Grid rows"
            hint="Each row is a sub-question (shown on the left of the grid)."
          >
            <div className="space-y-2">
              {(draft.gridRows || []).map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={row}
                    onChange={(e) => {
                      const rows = [...(draft.gridRows || [])];
                      rows[i] = e.target.value;
                      set({ gridRows: rows });
                    }}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    placeholder={`Row ${i + 1} label`}
                  />
                  <button
                    type="button"
                    onClick={() => set({ gridRows: (draft.gridRows || []).filter((_, j) => j !== i) })}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set({ gridRows: [...(draft.gridRows || []), `Row ${(draft.gridRows || []).length + 1}`] })}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
              >
                <Plus className="h-3.5 w-3.5" />
                Add row
              </button>
            </div>
          </Section>
          <FieldOptionsEditor
            options={draft.options || []}
            onChange={(options) => set({ options })}
          />
          <p className="text-xs text-slate-500">
            {draft.type === 'radio_grid'
              ? 'Each row allows exactly one column choice (radio buttons).'
              : 'Each row allows multiple column choices (checkboxes).'}
          </p>
        </>
      ) : null}

      {/* File upload */}
      {draft.type === 'file' ? (
        <Section title="File upload settings">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Max file size (MB)</label>
              <input
                type="number"
                min={1}
                value={v.maxFileSizeMb ?? 5}
                onChange={(e) => onChange(patchValidation(draft, { maxFileSizeMb: numOrUndef(e.target.value) ?? 5 }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Allowed types</label>
              <input
                type="text"
                value={v.accept ?? '.pdf,.jpg,.jpeg,.png'}
                onChange={(e) => onChange(patchValidation(draft, { accept: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                placeholder=".pdf,.jpg,.png"
              />
            </div>
          </div>
        </Section>
      ) : null}

      {/* Repeatable list */}
      {draft.type === 'array' ? (
        <Section title="List limits" hint="How many rows can be added in a tabular section?">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Minimum rows</label>
              <input
                type="number"
                min={0}
                value={draft.minItems ?? 0}
                onChange={(e) => set({ minItems: numOrUndef(e.target.value) ?? 0 })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Maximum rows</label>
              <input
                type="number"
                min={1}
                value={draft.maxItems ?? 10}
                onChange={(e) => set({ maxItems: numOrUndef(e.target.value) ?? 10 })}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function buildScalePoints(min: number, max: number, step: number): number[] {
  if (max <= min || step <= 0) return [];
  const pts: number[] = [];
  for (let i = min; i <= max; i += step) pts.push(i);
  return pts;
}
