'use client';

import React, { memo } from 'react';
import { Shift } from '@/lib/api';
import { QUICK_ASSIGN_CLEAR, QUICK_ASSIGN_HOL, QUICK_ASSIGN_WO } from '@/lib/shiftRoster/quickAssignUtils';

export type QuickAssignControlsProps = {
  weekdays: string[];
  assignDays: Record<string, boolean>;
  setAssignDays: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedAssignment: string;
  setSelectedAssignment: (val: string) => void;
  shifts: Shift[];
  shiftLabel: (s?: Shift | null) => string;
  onApply: () => void;
  applyLabel?: string;
  applyDisabled?: boolean;
  compact?: boolean;
  showShiftShortcuts?: boolean;
};

const QuickAssignControls = memo(function QuickAssignControls({
  weekdays,
  assignDays,
  setAssignDays,
  selectedAssignment,
  setSelectedAssignment,
  shifts,
  shiftLabel,
  onApply,
  applyLabel = 'Apply',
  applyDisabled = false,
  compact = false,
  showShiftShortcuts = !compact,
}: QuickAssignControlsProps) {
  const btnClass = compact ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[9px]';
  const selectClass = compact
    ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-1 text-[8px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 focus:outline-none min-w-[96px]'
    : 'bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/50 rounded-lg text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300 focus:outline-none px-2.5 py-2 min-w-[128px] shadow-sm';
  const rowGap = compact ? 'gap-1.5' : 'gap-2';
  const canApply = !!selectedAssignment && !applyDisabled;

  const offBtn = (value: string, label: string, activeClass: string) => (
    <button
      type="button"
      onClick={() => setSelectedAssignment(value)}
      className={
        selectedAssignment === value
          ? `${compact ? 'px-1.5 py-0.5 text-[7px]' : 'px-2 py-1 text-[9px]'} rounded font-black uppercase ${activeClass}`
          : `${compact ? 'px-1.5 py-0.5 text-[7px]' : 'px-2 py-1 text-[9px]'} rounded font-black uppercase text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800`
      }
    >
      {label}
    </button>
  );

  return (
    <div className={`flex flex-wrap items-center ${rowGap}`}>
      <div className={compact ? 'flex items-center gap-0.5' : 'flex items-center gap-0.5 bg-white/50 dark:bg-slate-900/50 p-1 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30'}>
        {weekdays.map((w) => {
          const active = !!assignDays[w];
          return (
            <button
              key={w}
              type="button"
              title={w}
              onClick={() => setAssignDays((prev) => ({ ...prev, [w]: !prev[w] }))}
              className={
                active
                  ? `${btnClass} rounded-md font-black uppercase flex items-center justify-center bg-indigo-600 text-white shadow-sm`
                  : `${btnClass} rounded-md font-black uppercase flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent`
              }
            >
              {w[0]}
            </button>
          );
        })}
      </div>

      <div className={`flex flex-wrap items-center ${compact ? 'gap-0.5' : 'gap-1'}`}>
        {offBtn(QUICK_ASSIGN_WO, 'WO', 'bg-orange-500 text-white border border-orange-600')}
        {offBtn(QUICK_ASSIGN_HOL, 'HOL', 'bg-rose-500 text-white border border-rose-600')}
        {compact ? offBtn(QUICK_ASSIGN_CLEAR, 'Clr', 'bg-slate-600 text-white border border-slate-700') : null}
      </div>

      <select
        value={
          selectedAssignment === QUICK_ASSIGN_WO
            ? 'WO'
            : selectedAssignment === QUICK_ASSIGN_HOL
              ? 'HOL'
              : selectedAssignment === QUICK_ASSIGN_CLEAR
                ? 'CLEAR'
                : selectedAssignment
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'WO') setSelectedAssignment(QUICK_ASSIGN_WO);
          else if (v === 'HOL') setSelectedAssignment(QUICK_ASSIGN_HOL);
          else if (v === 'CLEAR') setSelectedAssignment(QUICK_ASSIGN_CLEAR);
          else setSelectedAssignment(v);
        }}
        className={selectClass}
      >
        <option value="">Select assignment</option>
        <option value="WO">Week Off</option>
        <option value="HOL">Holiday</option>
        {!compact ? <option value="CLEAR">Clear</option> : null}
        {shifts.map((s) => (
          <option key={s._id} value={s._id}>
            {shiftLabel(s)}
          </option>
        ))}
      </select>

      {!compact ? offBtn(QUICK_ASSIGN_CLEAR, 'Clear', 'bg-slate-700 text-white border border-slate-800') : null}

      <button
        type="button"
        onClick={onApply}
        disabled={!canApply}
        className={
          compact
            ? 'rounded-lg bg-indigo-600 text-white font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md active:scale-95 px-2 py-1 text-[8px]'
            : 'rounded-lg bg-indigo-600 text-white font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md active:scale-95 px-4 py-2 text-[10px]'
        }
      >
        {applyLabel}
      </button>

      {showShiftShortcuts ? (
        <div className="flex flex-wrap gap-1.5">
          {shifts.slice(0, 4).map((shift) => {
            const picked = selectedAssignment === shift._id;
            return (
              <button
                key={shift._id}
                type="button"
                onClick={() => setSelectedAssignment(shift._id)}
                className={
                  picked
                    ? 'px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-tight border-indigo-500 bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                    : 'px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-tight border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 hover:border-indigo-300'
                }
              >
                {shiftLabel(shift)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});

export default QuickAssignControls;
