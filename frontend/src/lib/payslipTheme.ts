import type { CompanyProfile } from '@/lib/companyProfile';
import { DEFAULT_COMPANY_PROFILE } from '@/lib/companyProfile';

export const PAYSLIP_ACCENT_FALLBACK = DEFAULT_COMPANY_PROFILE.branding.primaryColor; // emerald-600

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const raw = String(hex || '').trim().replace('#', '');
  if (!raw) return null;
  const h =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.length >= 6
        ? raw.slice(0, 6)
        : '';
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function resolvePayslipAccentHex(profile?: CompanyProfile | null): string {
  const hex = profile?.branding?.primaryColor?.trim();
  if (hex && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex)) return hex;
  return PAYSLIP_ACCENT_FALLBACK;
}

export function resolvePayslipAccentRgb(profile?: CompanyProfile | null): Rgb {
  return hexToRgb(resolvePayslipAccentHex(profile)) ?? [5, 150, 105];
}

/** Darker shade of accent — for PDF bands, net blocks, table headers */
export function resolvePayslipAccentDarkRgb(
  profile?: CompanyProfile | null,
  ratio = 0.62
): Rgb {
  const [r, g, b] = resolvePayslipAccentRgb(profile);
  return [
    Math.max(0, Math.round(r * ratio)),
    Math.max(0, Math.round(g * ratio)),
    Math.max(0, Math.round(b * ratio)),
  ];
}

/** CSS custom properties for payslip surfaces */
export function payslipAccentCssVars(accentHex: string): Record<string, string> {
  const rgb = hexToRgb(accentHex) ?? [5, 150, 105];
  const [r, g, b] = rgb;
  return {
    '--ps-accent': accentHex,
    '--ps-accent-rgb': `${r} ${g} ${b}`,
    '--ps-accent-soft': `rgba(${r}, ${g}, ${b}, 0.08)`,
    '--ps-accent-muted': `rgba(${r}, ${g}, ${b}, 0.55)`,
    '--ps-accent-border': `rgba(${r}, ${g}, ${b}, 0.22)`,
    '--ps-accent-ink': `rgba(${r}, ${g}, ${b}, 0.92)`,
  };
}
