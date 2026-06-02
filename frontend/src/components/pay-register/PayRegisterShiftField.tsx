'use client';

import {
  MAX_PAY_REGISTER_SHIFTS_PER_DAY,
  PayRegisterShiftOption,
  PayRegisterShiftSelection,
  computePayableFromShiftSelections,
  payableUnitsForSelection,
  shiftNamesFromSelections,
} from '@/lib/payRegisterShifts';

export type { PayRegisterShiftOption, PayRegisterShiftSelection };

type ShiftValue = {
  shiftId: string | null;
  shiftIds: string[];
  shiftSelections: PayRegisterShiftSelection[];
  shiftName: string | null;
  payableShifts: number;
};

type Props = {
  shifts: PayRegisterShiftOption[];
  isMultiShiftMode: boolean;
  showShiftPicker: boolean;
  value: ShiftValue;
  onChange: (next: ShiftValue) => void;
  className?: string;
};

function buildValueFromSelections(
  selections: PayRegisterShiftSelection[],
  shifts: PayRegisterShiftOption[]
): ShiftValue {
  const shiftIds = selections.map((s) => s.shiftId);
  return {
    shiftSelections: selections,
    shiftIds,
    shiftId: shiftIds[0] || null,
    shiftName: selections.length ? shiftNamesFromSelections(selections, shifts) : null,
    payableShifts: selections.length ? computePayableFromShiftSelections(selections, shifts) : 1,
  };
}

/** @deprecated use computePayableFromShiftSelections */
export function computePayableFromShiftIds(
  shiftIds: string[],
  shifts: PayRegisterShiftOption[]
): number {
  return computePayableFromShiftSelections(
    shiftIds.map((shiftId) => ({ shiftId, isHalf: false })),
    shifts
  );
}

export function shiftNamesFromIds(shiftIds: string[], shifts: PayRegisterShiftOption[]): string {
  return shiftNamesFromSelections(
    shiftIds.map((shiftId) => ({ shiftId, isHalf: false })),
    shifts
  );
}

export default function PayRegisterShiftField({
  shifts,
  isMultiShiftMode,
  showShiftPicker,
  value,
  onChange,
  className = '',
}: Props) {
  if (!showShiftPicker) return null;

  const selections = value.shiftSelections?.length
    ? value.shiftSelections
    : (value.shiftIds || []).map((shiftId) => ({ shiftId, isHalf: false }));

  const toggleMultiShift = (shiftId: string) => {
    const exists = selections.find((s) => s.shiftId === shiftId);
    let next: PayRegisterShiftSelection[];
    if (exists) {
      next = selections.filter((s) => s.shiftId !== shiftId);
    } else if (selections.length >= MAX_PAY_REGISTER_SHIFTS_PER_DAY) {
      return;
    } else {
      next = [...selections, { shiftId, isHalf: false, payableUnits: null }];
    }
    onChange(buildValueFromSelections(next, shifts));
  };

  const setShiftHalf = (shiftId: string, isHalf: boolean) => {
    const next = selections.map((s) =>
      s.shiftId === shiftId ? { ...s, isHalf, payableUnits: null } : s
    );
    onChange(buildValueFromSelections(next, shifts));
  };

  if (isMultiShiftMode) {
    return (
      <div className={className}>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Shifts{' '}
          <span className="font-normal text-slate-500">
            (up to {MAX_PAY_REGISTER_SHIFTS_PER_DAY}; mark each full or half)
          </span>
        </label>
        <div className="flex flex-col gap-2 max-h-52 overflow-y-auto rounded-md border border-slate-300 dark:border-slate-600 p-2 dark:bg-slate-700/50">
          {shifts.map((shift) => {
            const sel = selections.find((s) => s.shiftId === shift._id);
            const checked = Boolean(sel);
            const disabled =
              !checked && selections.length >= MAX_PAY_REGISTER_SHIFTS_PER_DAY;
            const base = Number(shift.payableShifts) || 1;
            const units = sel ? payableUnitsForSelection(sel, shift) : 0;
            return (
              <div
                key={shift._id}
                className={`rounded-md border px-2 py-1.5 ${
                  checked
                    ? 'border-indigo-200 bg-indigo-50/80 dark:border-indigo-800 dark:bg-indigo-950/30'
                    : 'border-transparent'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                <label
                  className={`flex items-center gap-2 text-sm ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleMultiShift(shift._id)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="flex-1 text-slate-800 dark:text-slate-100">
                    {shift.name}
                    <span className="text-slate-500 dark:text-slate-400 ml-1">(base {base})</span>
                  </span>
                  {checked && (
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      → {units.toFixed(2)}
                    </span>
                  )}
                </label>
                {checked && (
                  <div className="mt-1.5 ml-6 flex gap-3 text-xs">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name={`shift-duration-${shift._id}`}
                        checked={!sel?.isHalf}
                        onChange={() => setShiftHalf(shift._id, false)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      Full ({base})
                    </label>
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name={`shift-duration-${shift._id}`}
                        checked={Boolean(sel?.isHalf)}
                        onChange={() => setShiftHalf(shift._id, true)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      Half ({(base * 0.5).toFixed(2)})
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Payable shifts for this day:{' '}
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
            {(value.payableShifts ?? computePayableFromShiftSelections(selections, shifts)).toFixed(2)}
          </span>
        </p>
      </div>
    );
  }

  const singleSel = selections[0];
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
        Shift
      </label>
      <select
        value={value.shiftId || ''}
        onChange={(e) => {
          const id = e.target.value || null;
          if (!id) {
            onChange(buildValueFromSelections([], shifts));
            return;
          }
          onChange(
            buildValueFromSelections([{ shiftId: id, isHalf: singleSel?.isHalf || false }], shifts)
          );
        }}
        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white mb-2"
      >
        <option value="">Select Shift</option>
        {shifts.map((shift) => (
          <option key={shift._id} value={shift._id}>
            {shift.name} (payable {Number(shift.payableShifts) || 1})
          </option>
        ))}
      </select>
      {value.shiftId && (
        <div className="flex gap-4 text-sm">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="single-shift-duration"
              checked={!singleSel?.isHalf}
              onChange={() =>
                onChange(
                  buildValueFromSelections(
                    [{ shiftId: value.shiftId!, isHalf: false, payableUnits: null }],
                    shifts
                  )
                )
              }
              className="text-indigo-600 focus:ring-indigo-500"
            />
            Full day
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="single-shift-duration"
              checked={Boolean(singleSel?.isHalf)}
              onChange={() =>
                onChange(
                  buildValueFromSelections(
                    [{ shiftId: value.shiftId!, isHalf: true, payableUnits: null }],
                    shifts
                  )
                )
              }
              className="text-indigo-600 focus:ring-indigo-500"
            />
            Half day
          </label>
        </div>
      )}
    </div>
  );
}
