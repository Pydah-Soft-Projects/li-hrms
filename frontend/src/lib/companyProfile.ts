import { api } from '@/lib/api';

export type CompanyAddress = {
  lines: string[];
  city: string;
  state: string;
  pin: string;
  country: string;
};

export type CompanyProfile = {
  legalName: string;
  displayName: string;
  shortName: string;
  registration: {
    pan: string;
    gstin: string;
    cin: string;
    pfCode: string;
    esicCode: string;
  };
  addresses: {
    registered: CompanyAddress;
    corporate: CompanyAddress;
  };
  contact: {
    hrEmail: string;
    accountsEmail: string;
    phone: string;
    website: string;
  };
  branding: {
    logoUrl: string;
    faviconUrl: string;
    primaryColor: string;
  };
  documents: {
    payslipTitle: string;
    reportHeaderLine: string;
    footerText: string;
    signatory: { name: string; designation: string };
  };
  locale: {
    timezone: string;
    dateFormat: string;
    currency: string;
    financialYearStartMonth: number;
  };
};

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  legalName: '',
  displayName: 'HRMS',
  shortName: '',
  registration: {
    pan: '',
    gstin: '',
    cin: '',
    pfCode: '',
    esicCode: '',
  },
  addresses: {
    registered: { lines: [''], city: '', state: '', pin: '', country: 'India' },
    corporate: { lines: [''], city: '', state: '', pin: '', country: 'India' },
  },
  contact: {
    hrEmail: '',
    accountsEmail: '',
    phone: '',
    website: '',
  },
  branding: {
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#059669',
  },
  documents: {
    payslipTitle: 'PAYSLIP',
    reportHeaderLine: '',
    footerText: 'This is a system-generated document.',
    signatory: { name: '', designation: '' },
  },
  locale: {
    timezone: 'Asia/Kolkata',
    dateFormat: 'DD/MM/YYYY',
    currency: 'INR',
    financialYearStartMonth: 4,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function mergeCompanyProfile(stored: unknown): CompanyProfile {
  if (!isRecord(stored)) return { ...DEFAULT_COMPANY_PROFILE };
  const reg = isRecord(stored.registration) ? stored.registration : {};
  const addr = isRecord(stored.addresses) ? stored.addresses : {};
  const regAddr = isRecord(addr.registered) ? addr.registered : {};
  const corpAddr = isRecord(addr.corporate) ? addr.corporate : {};
  const contact = isRecord(stored.contact) ? stored.contact : {};
  const branding = isRecord(stored.branding) ? stored.branding : {};
  const documents = isRecord(stored.documents) ? stored.documents : {};
  const signatory = isRecord(documents.signatory) ? documents.signatory : {};
  const locale = isRecord(stored.locale) ? stored.locale : {};

  return {
    ...DEFAULT_COMPANY_PROFILE,
    legalName: String(stored.legalName ?? DEFAULT_COMPANY_PROFILE.legalName),
    displayName: String(stored.displayName ?? DEFAULT_COMPANY_PROFILE.displayName),
    shortName: String(stored.shortName ?? DEFAULT_COMPANY_PROFILE.shortName),
    registration: {
      ...DEFAULT_COMPANY_PROFILE.registration,
      pan: String(reg.pan ?? ''),
      gstin: String(reg.gstin ?? ''),
      cin: String(reg.cin ?? ''),
      pfCode: String(reg.pfCode ?? ''),
      esicCode: String(reg.esicCode ?? ''),
    },
    addresses: {
      registered: {
        ...DEFAULT_COMPANY_PROFILE.addresses.registered,
        lines: Array.isArray(regAddr.lines) && regAddr.lines.length
          ? regAddr.lines.map((l) => String(l ?? ''))
          : DEFAULT_COMPANY_PROFILE.addresses.registered.lines,
        city: String(regAddr.city ?? ''),
        state: String(regAddr.state ?? ''),
        pin: String(regAddr.pin ?? ''),
        country: String(regAddr.country ?? 'India'),
      },
      corporate: {
        ...DEFAULT_COMPANY_PROFILE.addresses.corporate,
        lines: Array.isArray(corpAddr.lines) && corpAddr.lines.length
          ? corpAddr.lines.map((l) => String(l ?? ''))
          : DEFAULT_COMPANY_PROFILE.addresses.corporate.lines,
        city: String(corpAddr.city ?? ''),
        state: String(corpAddr.state ?? ''),
        pin: String(corpAddr.pin ?? ''),
        country: String(corpAddr.country ?? 'India'),
      },
    },
    contact: {
      ...DEFAULT_COMPANY_PROFILE.contact,
      hrEmail: String(contact.hrEmail ?? ''),
      accountsEmail: String(contact.accountsEmail ?? ''),
      phone: String(contact.phone ?? ''),
      website: String(contact.website ?? ''),
    },
    branding: {
      ...DEFAULT_COMPANY_PROFILE.branding,
      logoUrl: String(branding.logoUrl ?? ''),
      faviconUrl: String(branding.faviconUrl ?? ''),
      primaryColor: String(branding.primaryColor ?? DEFAULT_COMPANY_PROFILE.branding.primaryColor),
    },
    documents: {
      ...DEFAULT_COMPANY_PROFILE.documents,
      payslipTitle: String(documents.payslipTitle ?? DEFAULT_COMPANY_PROFILE.documents.payslipTitle),
      reportHeaderLine: String(documents.reportHeaderLine ?? ''),
      footerText: String(documents.footerText ?? DEFAULT_COMPANY_PROFILE.documents.footerText),
      signatory: {
        name: String(signatory.name ?? ''),
        designation: String(signatory.designation ?? ''),
      },
    },
    locale: {
      ...DEFAULT_COMPANY_PROFILE.locale,
      timezone: String(locale.timezone ?? DEFAULT_COMPANY_PROFILE.locale.timezone),
      dateFormat: String(locale.dateFormat ?? DEFAULT_COMPANY_PROFILE.locale.dateFormat),
      currency: String(locale.currency ?? DEFAULT_COMPANY_PROFILE.locale.currency),
      financialYearStartMonth: Number(locale.financialYearStartMonth ?? DEFAULT_COMPANY_PROFILE.locale.financialYearStartMonth),
    },
  };
}

export function formatAddressBlock(address: CompanyAddress): string {
  const lines = (address.lines || []).map((l) => l.trim()).filter(Boolean);
  const tail = [address.city, address.state, address.pin, address.country]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return [...lines, ...tail].join(', ');
}

export function getBrandInitials(profile: CompanyProfile): string {
  const source = (profile.shortName || profile.displayName || profile.legalName || 'H').trim();
  if (!source) return 'H';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

let cachedProfile: CompanyProfile | null = null;
let loadPromise: Promise<CompanyProfile> | null = null;

function applyBrandingCssVars(profile: CompanyProfile) {
  if (typeof document === 'undefined') return;
  const accent = profile.branding.primaryColor || DEFAULT_COMPANY_PROFILE.branding.primaryColor;
  document.documentElement.style.setProperty('--color-accent', accent);
  document.documentElement.style.setProperty('--color-accent-dark', accent);
}

/** Accent from cached company profile (used by SweetAlert and UI). */
export function getCachedCompanyAccentColor(fallback = DEFAULT_COMPANY_PROFILE.branding.primaryColor): string {
  const fromProfile = cachedProfile?.branding?.primaryColor?.trim();
  if (fromProfile && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(fromProfile)) {
    return fromProfile;
  }
  if (typeof window !== 'undefined') {
    const css = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
    if (css && css.startsWith('#')) return css;
  }
  return fallback;
}

export function invalidateCompanyProfileCache(): void {
  cachedProfile = null;
  loadPromise = null;
}

export async function fetchCompanyProfile(): Promise<CompanyProfile> {
  if (cachedProfile) return cachedProfile;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const res = await api.getSetting('company_profile');
        const merged =
          res.success && res.data?.value != null
            ? mergeCompanyProfile(res.data.value)
            : { ...DEFAULT_COMPANY_PROFILE };
        cachedProfile = merged;
        applyBrandingCssVars(merged);
        return merged;
      } catch {
        const fallback = { ...DEFAULT_COMPANY_PROFILE };
        cachedProfile = fallback;
        return fallback;
      }
    })();
  }
  return loadPromise;
}
