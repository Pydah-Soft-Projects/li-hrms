function roundOdDurationHours(hours: number | null | undefined): number | null {
  if (hours == null || Number.isNaN(Number(hours))) return null;
  return Math.round(Number(hours) * 100) / 100;
}

/** Numeric value only, 2 decimals (e.g. "1.17"). */
export function formatOdDurationHoursValue(hours: number | null | undefined): string {
  const rounded = roundOdDurationHours(hours);
  return rounded == null ? '' : rounded.toFixed(2);
}

/** Hour-based OD duration for grid labels (max 2 decimal places). */
export function formatOdDurationHours(hours: number | null | undefined): string {
  const value = formatOdDurationHoursValue(hours);
  return value ? `${value}h` : '';
}

export function formatOdDurationHoursParen(hours: number | null | undefined): string {
  const formatted = formatOdDurationHours(hours);
  return formatted ? `(${formatted})` : '';
}

/** Format evidence / shift duration minutes as "Xh Ym". */
export function formatOdEvidenceMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(Number(minutes))) return '—';
  const m = Math.max(0, Math.round(Number(minutes)));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem} min`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}
