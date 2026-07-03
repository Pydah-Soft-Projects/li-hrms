'use client';

import React from 'react';
import { DurationTimeInput } from './DurationTimeInput';
import { minutesToHHMM, hhmmToMinutes } from './otTimeHelpers';

export type OtHourRange = {
  minMinutes: number;
  maxMinutes: number;
  creditedMinutes: number;
  label?: string;
};

type OtHourRangesEditorProps = {
  ranges: OtHourRange[];
  onChange: (ranges: OtHourRange[]) => void;
};

function RangeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-w-[7rem] flex-col gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
      <DurationTimeInput compact value={value} onChange={onChange} />
    </div>
  );
}

function RangeConnector({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 self-end pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{children}</span>
  );
}

export function OtHourRangesEditor({ ranges, onChange }: OtHourRangesEditorProps) {
  const updateRange = (idx: number, patch: Partial<OtHourRange>) => {
    const next = ranges.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  const removeRange = (idx: number) => {
    onChange(ranges.filter((_, i) => i !== idx));
  };

  const addRange = () => {
    onChange([...ranges, { minMinutes: 0, maxMinutes: 0, creditedMinutes: 0, label: '' }]);
  };

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-tighter text-gray-500">Ranges (HH:MM)</p>
      <p className="text-[10px] text-gray-500">Example: 00:30 to 01:00 consider as 01:00</p>

      <div className="space-y-3">
        {ranges.map((r, idx) => (
          <div
            key={idx}
            className="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-slate-900/30"
          >
            <RangeField
              label="From"
              value={minutesToHHMM(r.minMinutes)}
              onChange={(v) => updateRange(idx, { minMinutes: hhmmToMinutes(v) })}
            />
            <RangeConnector>to</RangeConnector>
            <RangeField
              label="To"
              value={minutesToHHMM(r.maxMinutes)}
              onChange={(v) => updateRange(idx, { maxMinutes: hhmmToMinutes(v) })}
            />
            <RangeConnector>consider as</RangeConnector>
            <RangeField
              label="Consider as"
              value={minutesToHHMM(r.creditedMinutes)}
              onChange={(v) => updateRange(idx, { creditedMinutes: hhmmToMinutes(v) })}
            />
            <button
              type="button"
              onClick={() => removeRange(idx)}
              className="ml-auto shrink-0 self-end pb-2 text-xs font-bold text-red-600 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRange}
        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
      >
        + Add range
      </button>
    </div>
  );
}
