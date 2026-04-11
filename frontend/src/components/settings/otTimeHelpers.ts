/** Shared HH:MM helpers for OT settings (global + department). */

export const minutesToHHMM = (minutes: number): string => {
  const safe = Math.max(0, Number.isFinite(minutes) ? Math.round(minutes) : 0);
  const hh = String(Math.floor(safe / 60)).padStart(2, '0');
  const mm = String(safe % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const hhmmToMinutes = (value: string): number => {
  const v = String(value || '').trim();
  const m = v.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

export const hoursToHHMM = (hours: number | null): string => {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '';
  return minutesToHHMM(Math.round(hours * 60));
};

export const hhmmToHours = (value: string): number | null => {
  if (!value) return null;
  const mins = hhmmToMinutes(value);
  return mins / 60;
};
