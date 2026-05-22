const Settings = require('../../settings/model/Settings');

const DEFAULT_COMPANY_PROFILE = {
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeCompanyProfile(stored) {
  if (!isPlainObject(stored)) return { ...DEFAULT_COMPANY_PROFILE };
  return {
    ...DEFAULT_COMPANY_PROFILE,
    ...stored,
    registration: { ...DEFAULT_COMPANY_PROFILE.registration, ...(stored.registration || {}) },
    addresses: {
      registered: {
        ...DEFAULT_COMPANY_PROFILE.addresses.registered,
        ...((stored.addresses && stored.addresses.registered) || {}),
      },
      corporate: {
        ...DEFAULT_COMPANY_PROFILE.addresses.corporate,
        ...((stored.addresses && stored.addresses.corporate) || {}),
      },
    },
    contact: { ...DEFAULT_COMPANY_PROFILE.contact, ...(stored.contact || {}) },
    branding: { ...DEFAULT_COMPANY_PROFILE.branding, ...(stored.branding || {}) },
    documents: {
      ...DEFAULT_COMPANY_PROFILE.documents,
      ...(stored.documents || {}),
      signatory: {
        ...DEFAULT_COMPANY_PROFILE.documents.signatory,
        ...((stored.documents && stored.documents.signatory) || {}),
      },
    },
    locale: { ...DEFAULT_COMPANY_PROFILE.locale, ...(stored.locale || {}) },
  };
}

function formatAddressBlock(address) {
  if (!address || typeof address !== 'object') return '';
  const lines = Array.isArray(address.lines)
    ? address.lines.map((l) => String(l || '').trim()).filter(Boolean)
    : [];
  const tail = [address.city, address.state, address.pin, address.country]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  return [...lines, ...tail].join(', ');
}

function validateCompanyProfile(value) {
  const errors = [];
  if (!isPlainObject(value)) {
    return { valid: false, errors: ['company_profile must be an object'] };
  }
  const legalName = String(value.legalName || '').trim();
  const displayName = String(value.displayName || '').trim();
  if (!legalName) errors.push('Legal name is required');
  if (!displayName) errors.push('Display name is required');
  return { valid: errors.length === 0, errors, normalized: mergeCompanyProfile({ ...value, legalName, displayName }) };
}

async function getCompanyProfile() {
  const doc = await Settings.findOne({ key: 'company_profile' }).lean();
  return mergeCompanyProfile(doc?.value);
}

module.exports = {
  DEFAULT_COMPANY_PROFILE,
  mergeCompanyProfile,
  formatAddressBlock,
  validateCompanyProfile,
  getCompanyProfile,
};
