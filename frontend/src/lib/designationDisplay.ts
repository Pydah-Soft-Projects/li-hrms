const DESIGNATION_ACCENT_CLASSES = [
  'text-violet-600 dark:text-violet-400',
  'text-cyan-600 dark:text-cyan-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-amber-600 dark:text-amber-400',
  'text-rose-600 dark:text-rose-400',
  'text-indigo-600 dark:text-indigo-400',
  'text-teal-600 dark:text-teal-400',
  'text-fuchsia-600 dark:text-fuchsia-400',
] as const;

/** Stable accent class for designation sublines (colorful + italic in UI). */
export function designationAccentClass(name: string): string {
  const s = String(name || '').trim();
  if (!s) return 'text-slate-500 dark:text-slate-400';
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return DESIGNATION_ACCENT_CLASSES[h % DESIGNATION_ACCENT_CLASSES.length];
}
