'use client';

import { X } from 'lucide-react';
import type { FieldOption } from '@/lib/fieldTypeConfig';

type Props = {
  options: FieldOption[];
  onChange: (options: FieldOption[]) => void;
  disabled?: boolean;
};

export default function FieldOptionsEditor({ options, onChange, disabled }: Props) {
  const list = options || [];

  const addOption = (raw: string) => {
    const v = raw.trim();
    if (!v || disabled) return;
    onChange([...list, { label: v, value: v }]);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Answer choices</label>
      <p className="mt-0.5 text-xs text-slate-500">Add each option applicants can pick from.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map((opt, i) => (
          <span
            key={`${opt.value}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-700"
          >
            {opt.label}
            {!disabled ? (
              <button
                type="button"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
                className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {!disabled ? (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            placeholder="Type an option and press Enter"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addOption((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = '';
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
