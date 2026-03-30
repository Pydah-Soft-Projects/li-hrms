/**
 * Shared helpers for monthly summary → day-cell highlight badges (workspace + superadmin).
 */

/** True if the attendance detail has at least one check-in or check-out (shift-level or legacy root fields). */
export function hasAttendancePunches(detail: unknown): boolean {
  const d = detail as Record<string, unknown> | null | undefined;
  if (!d) return false;
  const shifts = d.shifts as Array<{ inTime?: unknown; outTime?: unknown }> | undefined;
  if (Array.isArray(shifts) && shifts.some((s) => s?.inTime || s?.outTime)) return true;
  if (d.inTime || d.outTime) return true;
  return false;
}

/**
 * Full-day OD (not hour-based, not half-day) with an OD id we can revoke.
 * Matches legacy rows where odType_extended is unset and isHalfDay is false.
 */
export function isFullDayOdEligibleForConflictRevoke(detail: unknown): boolean {
  const d = detail as Record<string, unknown> | null | undefined;
  const oi = d?.odInfo as Record<string, unknown> | undefined;
  if (!d?.hasOD || !oi || !oi.odId) return false;
  if (oi.odType_extended === 'hours') return false;
  if (oi.odType_extended === 'half_day' || oi.isHalfDay) return false;
  return oi.odType_extended === 'full_day' || !oi.isHalfDay;
}

export function formatHighlightContribution(v: number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 1000) / 1000;
  if (Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 1e-6) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Second line under the numeric contribution. Omit for absent (value-only) and for
 * redundant single-letter codes that match "present" style (P, Pay, OD, etc.).
 * For leaves, show leave type only (strip legacy " (0.5)" suffix from API label).
 */
export function highlightBadgeSubtitle(
  category: string,
  label: string | undefined | null
): string | null {
  const L = (label || '').trim();
  if (!L) return null;
  if (category === 'absent') return null;
  if (category === 'present' && L === 'P') return null;
  if (category === 'payableShifts' && L === 'Pay') return null;
  if (category === 'ods' && L === 'OD') return null;
  if (category === 'partial' && L === 'PARTIAL') return null;
  if (category === 'weeklyOffs' && (L === 'WO' || L === 'WEEK_OFF')) return null;
  if (category === 'holidays' && (L === 'HOL' || L === 'HOLIDAY')) return null;
  if (category === 'permissions' && L === 'Perm') return null;
  if (category === 'otHours' && /^OT\s*\(/i.test(L)) return null;
  if (category === 'extraHours' && /^Ex\s*\(/i.test(L)) return null;
  if (category === 'leaves') {
    const stripped = L.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return stripped || null;
  }
  return L;
}
