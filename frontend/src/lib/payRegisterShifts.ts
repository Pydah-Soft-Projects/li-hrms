/** Matches backend MAX_SHIFTS_PER_DAY in payRegisterShiftUtils */
export const MAX_PAY_REGISTER_SHIFTS_PER_DAY = 3;

export type PayRegisterShiftSelection = {
  shiftId: string;
  isHalf?: boolean;
  payableUnits?: number | null;
};

export type PayRegisterShiftOption = {
  _id: string;
  name: string;
  payableShifts?: number;
};

export function payableUnitsForSelection(
  sel: PayRegisterShiftSelection,
  shift?: PayRegisterShiftOption
): number {
  if (sel.payableUnits != null && Number.isFinite(Number(sel.payableUnits))) {
    return Math.max(0, Number(sel.payableUnits));
  }
  const base = Number(shift?.payableShifts) || 1;
  return sel.isHalf ? base * 0.5 : base;
}

export function computePayableFromShiftSelections(
  selections: PayRegisterShiftSelection[],
  shifts: PayRegisterShiftOption[]
): number {
  const total = selections.reduce((sum, sel) => {
    const sh = shifts.find((s) => s._id === String(sel.shiftId));
    return sum + payableUnitsForSelection(sel, sh);
  }, 0);
  return Math.round(total * 100) / 100;
}

export function shiftLabelFromSelection(
  sel: PayRegisterShiftSelection,
  shifts: PayRegisterShiftOption[]
): string {
  const sh = shifts.find((s) => s._id === String(sel.shiftId));
  const name = sh?.name || 'Shift';
  return sel.isHalf && sel.payableUnits == null ? `${name} (½)` : name;
}

export function shiftNamesFromSelections(
  selections: PayRegisterShiftSelection[],
  shifts: PayRegisterShiftOption[]
): string {
  return selections.map((s) => shiftLabelFromSelection(s, shifts)).filter(Boolean).join(' + ');
}

export function initialShiftSelectionsFromRecord(record: {
  shiftSelections?: PayRegisterShiftSelection[] | null;
  shiftIds?: string[] | null;
  shiftId?: string | null;
}): PayRegisterShiftSelection[] {
  if (Array.isArray(record.shiftSelections) && record.shiftSelections.length > 0) {
    return record.shiftSelections.map((s) => ({
      shiftId: String(s.shiftId),
      isHalf: Boolean(s.isHalf),
      payableUnits: s.payableUnits ?? null,
    }));
  }
  const ids =
    Array.isArray(record.shiftIds) && record.shiftIds.length > 0
      ? record.shiftIds.map(String)
      : record.shiftId
        ? [String(record.shiftId)]
        : [];
  return ids.map((shiftId) => ({ shiftId, isHalf: false, payableUnits: null }));
}

/** @deprecated use initialShiftSelectionsFromRecord */
export function initialShiftIdsFromRecord(record: {
  shiftIds?: string[] | null;
  shiftId?: string | null;
}): string[] {
  return initialShiftSelectionsFromRecord(record).map((s) => s.shiftId);
}

export function payRegisterDayShowsShiftPicker(
  editData: {
    status?: string | null;
    firstHalf?: { status?: string };
    secondHalf?: { status?: string };
  },
  isHalfDayMode: boolean
): boolean {
  const presentish = (st?: string | null) => st === 'present' || st === 'od';
  if (isHalfDayMode) {
    return presentish(editData.firstHalf?.status) || presentish(editData.secondHalf?.status);
  }
  return presentish(editData.status);
}
