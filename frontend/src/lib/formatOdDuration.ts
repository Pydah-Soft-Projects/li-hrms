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
