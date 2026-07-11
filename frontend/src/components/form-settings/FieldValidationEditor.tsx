'use client';

import type { FieldValidation } from '@/lib/fieldTypeConfig';
import {
  fieldTypeSupportsNumberValidation,
  fieldTypeSupportsTextValidation,
} from '@/lib/fieldTypeConfig';

type Props = {
  type: string;
  validation?: FieldValidation;
  onChange: (validation: FieldValidation) => void;
};

function numOrUndef(v: string): number | undefined {
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function FieldValidationEditor({ type, validation = {}, onChange }: Props) {
  if (!fieldTypeSupportsTextValidation(type) && !fieldTypeSupportsNumberValidation(type)) {
    return null;
  }

  const patch = (key: keyof FieldValidation, raw: string) => {
    onChange({ ...validation, [key]: numOrUndef(raw) });
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Validation</p>
      <p className="mt-0.5 text-xs text-slate-500">Optional limits applied when applicants fill this field.</p>

      {fieldTypeSupportsTextValidation(type) ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Minimum length</label>
            <input
              type="number"
              min={0}
              value={validation.minLength ?? ''}
              onChange={(e) => patch('minLength', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="e.g. 2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Maximum length</label>
            <input
              type="number"
              min={0}
              value={validation.maxLength ?? ''}
              onChange={(e) => patch('maxLength', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="e.g. 100"
            />
          </div>
        </div>
      ) : null}

      {fieldTypeSupportsNumberValidation(type) ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Minimum value</label>
            <input
              type="number"
              value={validation.min ?? ''}
              onChange={(e) => patch('min', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="e.g. 0"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Maximum value</label>
            <input
              type="number"
              value={validation.max ?? ''}
              onChange={(e) => patch('max', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="e.g. 100"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
