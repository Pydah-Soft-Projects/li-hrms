import { RosterCell } from '@/lib/shiftRoster/types';

export const QUICK_ASSIGN_WO = '__WO__';
export const QUICK_ASSIGN_HOL = '__HOL__';
export const QUICK_ASSIGN_CLEAR = '__CLEAR__';

export function parseQuickAssignValue(value: string): Pick<RosterCell, 'shiftId' | 'status'> {
  if (value === QUICK_ASSIGN_WO) return { shiftId: null, status: 'WO' };
  if (value === QUICK_ASSIGN_HOL) return { shiftId: null, status: 'HOL' };
  if (value === QUICK_ASSIGN_CLEAR) return { shiftId: null, status: undefined };
  return { shiftId: value, status: undefined };
}

export function quickAssignLabel(value: string, shiftLabel: (id: string) => string): string {
  if (value === QUICK_ASSIGN_WO) return 'Week Off';
  if (value === QUICK_ASSIGN_HOL) return 'Holiday';
  if (value === QUICK_ASSIGN_CLEAR) return 'Clear';
  return shiftLabel(value);
}
