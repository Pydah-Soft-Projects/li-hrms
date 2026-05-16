'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { SettingsSkeleton } from './SettingsSkeleton';
import {
  Building2,
  ChevronRight,
  FileText,
  Globe,
  Mail,
  MapPin,
  Save,
} from 'lucide-react';
import {
  type CompanyProfile,
  DEFAULT_COMPANY_PROFILE,
  formatAddressBlock,
  getBrandInitials,
  invalidateCompanyProfileCache,
  mergeCompanyProfile,
} from '@/lib/companyProfile';

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#0F172A] dark:text-white transition-all';

const labelClass = 'block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
];

const CompanySettings = () => {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getSetting('company_profile');
      if (res.success && res.data?.value != null) {
        setProfile(mergeCompanyProfile(res.data.value));
      } else {
        setProfile({ ...DEFAULT_COMPANY_PROFILE });
      }
    } catch (err) {
      console.error('Failed to load company profile', err);
      toast.error('Failed to load company settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const update = <K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
  };

  const handleSave = async () => {
    const legalName = profile.legalName.trim();
    const displayName = profile.displayName.trim();
    if (!legalName || !displayName) {
      toast.error('Legal name and display name are required');
      return;
    }
    try {
      setSaving(true);
      const res = await api.upsertSetting({
        key: 'company_profile',
        value: { ...profile, legalName, displayName },
        category: 'company',
        description: 'Organization identity, branding, and document defaults',
      });
      if (res.success) {
        invalidateCompanyProfileCache();
        toast.success('Company settings saved successfully');
      } else {
        toast.error('Failed to save company settings');
      }
    } catch {
      toast.error('An error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      setUploadingLogo(true);
      const res = await api.uploadCompanyLogo(file);
      if (res.success && res.url) {
        setProfile((p) => ({
          ...p,
          branding: { ...p.branding, logoUrl: res.url! },
        }));
        toast.success('Logo uploaded');
      } else {
        toast.error(res.message || 'Failed to upload logo');
      }
    } catch {
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  const registeredFormatted = formatAddressBlock(profile.addresses.registered);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="border-b border-gray-200 dark:border-gray-800 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
            <span>Settings</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-indigo-600">Company</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Organization &amp; brand</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Company identity used in navigation, exports, and system branding.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 text-white px-5 py-2.5 text-xs font-bold hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          Save company settings
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 space-y-8">
          {/* Legal identity + logo */}
          <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <Building2 className="h-5 w-5 text-indigo-500" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Legal identity &amp; logo</h3>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="space-y-4">
                  <p className={labelClass}>Company logo</p>
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#0F172A] overflow-hidden">
                    {profile.branding.logoUrl ? (
                      <img src={profile.branding.logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <span
                        className="text-2xl font-bold text-white rounded-xl w-full h-full flex items-center justify-center"
                        style={{ background: profile.branding.primaryColor }}
                      >
                        {getBrandInitials(profile)}
                      </span>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleLogoUpload(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-xl border border-indigo-200 dark:border-indigo-800 px-4 py-2.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50"
                  >
                    {uploadingLogo ? 'Uploading…' : 'Upload logo (PNG/JPG)'}
                  </button>
                  <div>
                    <label className={labelClass}>Logo URL (optional)</label>
                    <input
                      className={inputClass}
                      value={profile.branding.logoUrl}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          branding: { ...p.branding, logoUrl: e.target.value },
                        }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Legal name <span className="text-red-500">*</span></label>
                    <input
                      className={inputClass}
                      value={profile.legalName}
                      onChange={(e) => update('legalName', e.target.value)}
                      placeholder="ABC Industries Pvt Ltd"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Display name <span className="text-red-500">*</span></label>
                    <input
                      className={inputClass}
                      value={profile.displayName}
                      onChange={(e) => update('displayName', e.target.value)}
                      placeholder="ABC HRMS"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Shown in sidebar and app header.</p>
                  </div>
                  <div>
                    <label className={labelClass}>Short name</label>
                    <input
                      className={inputClass}
                      value={profile.shortName}
                      onChange={(e) => update('shortName', e.target.value)}
                      placeholder="ABC"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Used for initials when no logo is uploaded.</p>
                  </div>
                  <div>
                    <label className={labelClass}>Primary accent color</label>
                    <div className="flex gap-3 items-center">
                      <input
                        type="color"
                        value={profile.branding.primaryColor}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            branding: { ...p.branding, primaryColor: e.target.value },
                          }))
                        }
                        className="h-10 w-14 rounded-lg border border-gray-200 cursor-pointer flex-shrink-0"
                      />
                      <input
                        className={inputClass}
                        value={profile.branding.primaryColor}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            branding: { ...p.branding, primaryColor: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Registration */}
          <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Registration</h3>
            </div>
            <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {(
                [
                  ['pan', 'PAN'],
                  ['gstin', 'GSTIN'],
                  ['cin', 'CIN'],
                  ['pfCode', 'PF establishment code'],
                  ['esicCode', 'ESIC code'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <input
                    className={inputClass}
                    value={profile.registration[key]}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        registration: { ...p.registration, [key]: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Addresses */}
          <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-emerald-500" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Registered address</h3>
            </div>
            <AddressFields
              address={profile.addresses.registered}
              onChange={(registered) =>
                setProfile((p) => ({ ...p, addresses: { ...p.addresses, registered } }))
              }
            />
          </section>

          {/* Contact */}
          <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <Mail className="h-5 w-5 text-blue-500" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Contact</h3>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {(
                [
                  ['hrEmail', 'HR email'],
                  ['accountsEmail', 'Accounts email'],
                  ['phone', 'Phone'],
                  ['website', 'Website'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className={labelClass}>{label}</label>
                  <input
                    className={inputClass}
                    value={profile.contact[key]}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        contact: { ...p.contact, [key]: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </section>


          {/* Documents */}
          <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <FileText className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Document defaults</h3>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className={labelClass}>Report header line</label>
                <input
                  className={inputClass}
                  value={profile.documents.reportHeaderLine}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      documents: { ...p.documents, reportHeaderLine: e.target.value },
                    }))
                  }
                  placeholder="Optional subtitle on exports"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Document footer</label>
                <textarea
                  className={`${inputClass} min-h-[72px]`}
                  value={profile.documents.footerText}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      documents: { ...p.documents, footerText: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Signatory name</label>
                <input
                  className={inputClass}
                  value={profile.documents.signatory.name}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      documents: {
                        ...p.documents,
                        signatory: { ...p.documents.signatory, name: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Signatory designation</label>
                <input
                  className={inputClass}
                  value={profile.documents.signatory.designation}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      documents: {
                        ...p.documents,
                        signatory: { ...p.documents.signatory, designation: e.target.value },
                      },
                    }))
                  }
                />
              </div>
            </div>
          </section>

          {/* Locale */}
          <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <Globe className="h-5 w-5 text-cyan-500" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Regional</h3>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Timezone</label>
                <select
                  className={inputClass}
                  value={profile.locale.timezone}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      locale: { ...p.locale, timezone: e.target.value },
                    }))
                  }
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Date format</label>
                <select
                  className={inputClass}
                  value={profile.locale.dateFormat}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      locale: { ...p.locale, dateFormat: e.target.value },
                    }))
                  }
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Currency</label>
                <input
                  className={inputClass}
                  value={profile.locale.currency}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      locale: { ...p.locale, currency: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Financial year starts (month)</label>
                <select
                  className={inputClass}
                  value={profile.locale.financialYearStartMonth}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      locale: {
                        ...p.locale,
                        financialYearStartMonth: Number(e.target.value),
                      },
                    }))
                  }
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString('en', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* Preview */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 sticky top-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Live preview</p>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-[#0F172A]">
              <div className="flex items-center gap-3">
                {profile.branding.logoUrl ? (
                  <img src={profile.branding.logoUrl} alt="" className="h-10 w-10 object-contain rounded-lg" />
                ) : (
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: profile.branding.primaryColor }}
                  >
                    {getBrandInitials(profile)}
                  </div>
                )}
                <div>
                  <p className="font-bold text-sm text-gray-900 dark:text-white">{profile.displayName || 'HRMS'}</p>
                  <p className="text-[10px] text-gray-500">{profile.legalName || 'Legal name not set'}</p>
                </div>
              </div>
              {registeredFormatted && (
                <p className="text-[10px] text-gray-500 mt-3 leading-relaxed border-t border-dashed border-gray-300 dark:border-gray-600 pt-3">
                  {registeredFormatted}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save company settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function AddressFields({
  address,
  onChange,
}: {
  address: CompanyProfile['addresses']['registered'];
  onChange: (address: CompanyProfile['addresses']['registered']) => void;
}) {
  const lines = address.lines.length ? address.lines : [''];
  return (
    <div className="p-8 space-y-4">
      <div>
        <label className={labelClass}>Address lines</label>
        {lines.map((line, idx) => (
          <input
            key={idx}
            className={`${inputClass} mt-2`}
            value={line}
            onChange={(e) => {
              const next = [...lines];
              next[idx] = e.target.value;
              onChange({ ...address, lines: next });
            }}
            placeholder={idx === 0 ? 'Building, street' : 'Line 2 (optional)'}
          />
        ))}
        {lines.length < 3 && (
          <button
            type="button"
            className="mt-2 text-[10px] font-bold text-indigo-600 uppercase"
            onClick={() => onChange({ ...address, lines: [...lines, ''] })}
          >
            + Add address line
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(
          [
            ['city', 'City'],
            ['state', 'State'],
            ['pin', 'PIN'],
            ['country', 'Country'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className={labelClass}>{label}</label>
            <input
              className={inputClass}
              value={address[key]}
              onChange={(e) => onChange({ ...address, [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default CompanySettings;
