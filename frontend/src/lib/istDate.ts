/** Indian Standard Time — same basis as backend dateCycleService / dateUtils. */
export const IST_TIMEZONE = 'Asia/Kolkata';

export type ISTDateParts = {
  year: number;
  month: number;
  day: number;
  dateStr: string;
};

/** YYYY-MM-DD components of a moment in IST. */
export function extractISTComponents(dateInput: Date | string): ISTDateParts | null {
  const d = dateInput instanceof Date ? dateInput : new Date(String(dateInput));
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  if (!year || !month || !day) return null;
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, dateStr };
}

/**
 * Normalize leave form/API values to IST calendar YYYY-MM-DD.
 * Plain YYYY-MM-DD from <input type="date"> is treated as that civil day in IST (no TZ shift).
 */
export function normalizeToISTYmd(value: Date | string): string | null {
  const raw = String(value ?? '').trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const ist = extractISTComponents(raw);
  return ist?.dateStr ?? null;
}

export function istYmdToParts(ymd: string): ISTDateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, dateStr: `${m[1]}-${m[2]}-${m[3]}` };
}
