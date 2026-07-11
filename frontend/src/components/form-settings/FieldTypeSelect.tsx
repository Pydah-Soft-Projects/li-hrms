'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FieldTypeGroup } from '@/lib/fieldTypeConfig';
import { flattenFieldGroups, getFieldTypeLabel } from '@/lib/fieldTypeConfig';

type Props = {
  groups: FieldTypeGroup[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
};

export default function FieldTypeSelect({ groups, value, onChange, disabled, label = 'Question type' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = flattenFieldGroups(groups).find((t) => t.value === value);
  const SelectedIcon = selected?.icon;

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm hover:border-violet-300 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
      >
        <span className="flex min-w-0 items-center gap-2">
          {SelectedIcon ? <SelectedIcon className="h-4 w-4 shrink-0 text-slate-500" /> : null}
          <span className="truncate font-medium">{getFieldTypeLabel(groups, value)}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled ? (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-600 dark:bg-slate-900">
          {groups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 ? <div className="my-1 border-t border-slate-100 dark:border-slate-700" /> : null}
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
              {group.types.map((t) => {
                const Icon = t.icon;
                const active = t.value === value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      onChange(t.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-violet-50 dark:hover:bg-violet-950/30 ${
                      active ? 'bg-violet-50 dark:bg-violet-950/40' : ''
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <span>
                      <span className="block font-medium text-slate-800 dark:text-slate-100">{t.label}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{t.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
