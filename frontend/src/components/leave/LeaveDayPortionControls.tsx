'use client';

import type { HalfDayType } from '@/lib/leaveDayRange';

type Props = {
  variant: 'start' | 'end' | 'single';
  isHalf: boolean;
  halfDayType?: HalfDayType | null;
  disabled?: boolean;
  onSelectFull: () => void;
  onSelectHalf: () => void;
  onHalfDayTypeChange?: (half: HalfDayType) => void;
};

export default function LeaveDayPortionControls({
  variant,
  isHalf,
  halfDayType,
  disabled,
  onSelectFull,
  onSelectHalf,
  onHalfDayTypeChange,
}: Props) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden shrink-0">
        <button
          type="button"
          disabled={disabled}
          onClick={onSelectFull}
          className={`px-2.5 py-1 text-[11px] font-semibold ${!isHalf ? 'bg-blue-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
        >
          Full
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onSelectHalf}
          className={`px-2.5 py-1 text-[11px] font-semibold ${isHalf ? 'bg-blue-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
        >
          Half
        </button>
      </div>
      {variant === 'single' && isHalf && onHalfDayTypeChange && (
        <select
          value={halfDayType || 'first_half'}
          onChange={(e) => onHalfDayTypeChange(e.target.value as HalfDayType)}
          disabled={disabled}
          className="rounded-lg border border-blue-300 bg-white px-2 py-1 text-[11px] font-semibold dark:border-blue-600 dark:bg-slate-800 dark:text-white"
        >
          <option value="first_half">1st half</option>
          <option value="second_half">2nd half</option>
        </select>
      )}
      {variant === 'start' && isHalf && (
        <span className="text-[10px] text-slate-500 dark:text-slate-400">2nd half</span>
      )}
      {variant === 'end' && isHalf && (
        <span className="text-[10px] text-slate-500 dark:text-slate-400">1st half</span>
      )}
    </div>
  );
}
