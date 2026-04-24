/**
 * Derive pay-register leave nature from configured leave types (Leave Settings).
 * Mirrors backend behaviour: unpaid types → LOP; otherwise paid / explicit leaveNature.
 */

export type PayRegisterLeaveNature = 'paid' | 'lop' | 'without_pay';

export function resolveLeaveNatureFromLeaveTypeCode(
  leaveTypeCode: string | null | undefined,
  leaveTypes: Array<{ code?: string; leaveNature?: string; isPaid?: boolean }>
): PayRegisterLeaveNature | null {
  if (!leaveTypeCode || !String(leaveTypeCode).trim()) return null;
  const upper = String(leaveTypeCode).trim().toUpperCase();
  const t = leaveTypes.find((lt) => String(lt.code ?? '').trim().toUpperCase() === upper);
  if (!t) return 'paid';
  const raw = String(t.leaveNature ?? '').toLowerCase();
  if (raw === 'paid' || raw === 'lop' || raw === 'without_pay') return raw as PayRegisterLeaveNature;
  return t.isPaid === false ? 'lop' : 'paid';
}

export function leaveNatureDisplayLabel(n: PayRegisterLeaveNature | null | undefined): string {
  if (!n) return '—';
  if (n === 'paid') return 'Paid';
  if (n === 'lop') return 'LOP (Loss of Pay)';
  return 'Without Pay';
}

/** Ensure leaveNature on record / halves matches the selected leave type(s) before save or after settings load. */
export function mergeEditDataLeaveNatureFromTypes(
  data: Record<string, unknown>,
  leaveTypes: Array<{ code?: string; leaveNature?: string; isPaid?: boolean }>,
  isHalfDayMode: boolean
): Record<string, unknown> {
  const resolve = (code: string | null | undefined) =>
    resolveLeaveNatureFromLeaveTypeCode(code, leaveTypes);

  const next = { ...data };

  if (isHalfDayMode) {
    const fh = next.firstHalf as Record<string, unknown> | undefined;
    if (fh) {
      if (fh.status === 'leave' && fh.leaveType) {
        next.firstHalf = { ...fh, leaveNature: resolve(String(fh.leaveType)) };
      } else {
        next.firstHalf = { ...fh, leaveNature: null };
      }
    }
    const sh = next.secondHalf as Record<string, unknown> | undefined;
    if (sh) {
      if (sh.status === 'leave' && sh.leaveType) {
        next.secondHalf = { ...sh, leaveNature: resolve(String(sh.leaveType)) };
      } else {
        next.secondHalf = { ...sh, leaveNature: null };
      }
    }
  } else {
    const lt = next.leaveType as string | null | undefined;
    if (next.status === 'leave' && lt) {
      const nat = resolve(lt);
      next.leaveNature = nat;
      if (next.firstHalf) {
        next.firstHalf = {
          ...(next.firstHalf as object),
          leaveNature: nat,
          leaveType: lt,
        };
      }
      if (next.secondHalf) {
        next.secondHalf = {
          ...(next.secondHalf as object),
          leaveNature: nat,
          leaveType: lt,
        };
      }
    } else if (next.status === 'leave' && !lt) {
      next.leaveNature = null;
      if (next.firstHalf) {
        next.firstHalf = { ...(next.firstHalf as object), leaveNature: null };
      }
      if (next.secondHalf) {
        next.secondHalf = { ...(next.secondHalf as object), leaveNature: null };
      }
    }
  }

  return next;
}
