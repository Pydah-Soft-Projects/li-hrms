'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import {
  type CompanyProfile,
  DEFAULT_COMPANY_PROFILE,
  formatAddressBlock,
  getBrandInitials,
  invalidateCompanyProfileCache,
  mergeCompanyProfile,
} from '@/lib/companyProfile';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsField,
  SettingsSaveBar,
  SettingsOutlineButton,
} from '@/components/settings/SettingsPageShell';
import { settingsInputClass, settingsInputStyle, settingsLedgerBorder } from '@/lib/settingsUi';

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
    <SettingsPanel>
      <SettingsPanelHeader
        section="Company"
        title="Organization & brand"
        subtitle="Company identity used in navigation, exports, and system branding."
      />

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-3">
        <div className="space-y-8 xl:col-span-2">
          <SettingsSectionCard title="Legal identity & logo">
            <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2">
              <div className="space-y-4">
                <SettingsField label="Company logo">
                  <div
                    className="flex h-24 w-24 items-center justify-center overflow-hidden border bg-stone-50 dark:bg-stone-900"
                    style={settingsLedgerBorder}
                  >
                    {profile.branding.logoUrl ? (
                      <img src={profile.branding.logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center text-2xl font-bold text-white"
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
                  <SettingsOutlineButton
                    className={`w-full justify-center ${uploadingLogo ? 'pointer-events-none opacity-50' : ''}`}
                    onClick={() => {
                      if (!uploadingLogo) fileRef.current?.click();
                    }}
                  >
                    {uploadingLogo ? 'Uploading…' : 'Upload logo (PNG/JPG)'}
                  </SettingsOutlineButton>
                </SettingsField>
                <SettingsField label="Logo URL (optional)">
                  <input
                    className={settingsInputClass()}
                    style={settingsInputStyle()}
                    value={profile.branding.logoUrl}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        branding: { ...p.branding, logoUrl: e.target.value },
                      }))
                    }
                    placeholder="https://..."
                  />
                </SettingsField>
              </div>

              <div className="space-y-4">
                <SettingsField label="Legal name" required>
                  <input
                    className={settingsInputClass()}
                    style={settingsInputStyle()}
                    value={profile.legalName}
                    onChange={(e) => update('legalName', e.target.value)}
                    placeholder="ABC Industries Pvt Ltd"
                  />
                </SettingsField>
                <SettingsField label="Display name" help="Shown in sidebar and app header." required>
                  <input
                    className={settingsInputClass()}
                    style={settingsInputStyle()}
                    value={profile.displayName}
                    onChange={(e) => update('displayName', e.target.value)}
                    placeholder="ABC HRMS"
                  />
                </SettingsField>
                <SettingsField label="Short name" help="Used for initials when no logo is uploaded.">
                  <input
                    className={settingsInputClass()}
                    style={settingsInputStyle()}
                    value={profile.shortName}
                    onChange={(e) => update('shortName', e.target.value)}
                    placeholder="ABC"
                  />
                </SettingsField>
                <SettingsField label="Primary accent color">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={profile.branding.primaryColor}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          branding: { ...p.branding, primaryColor: e.target.value },
                        }))
                      }
                      className="h-10 w-14 flex-shrink-0 cursor-pointer border border-stone-200"
                    />
                    <input
                      className={settingsInputClass()}
                      style={settingsInputStyle()}
                      value={profile.branding.primaryColor}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          branding: { ...p.branding, primaryColor: e.target.value },
                        }))
                      }
                    />
                  </div>
                </SettingsField>
              </div>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title="Registration">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ['pan', 'PAN'],
                  ['gstin', 'GSTIN'],
                  ['cin', 'CIN'],
                  ['pfCode', 'PF establishment code'],
                  ['esicCode', 'ESIC code'],
                ] as const
              ).map(([key, label]) => (
                <SettingsField key={key} label={label}>
                  <input
                    className={settingsInputClass()}
                    style={settingsInputStyle()}
                    value={profile.registration[key]}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        registration: { ...p.registration, [key]: e.target.value },
                      }))
                    }
                  />
                </SettingsField>
              ))}
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title="Registered address">
            <AddressFields
              address={profile.addresses.registered}
              onChange={(registered) =>
                setProfile((p) => ({ ...p, addresses: { ...p.addresses, registered } }))
              }
            />
          </SettingsSectionCard>

          <SettingsSectionCard title="Contact">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {(
                [
                  ['hrEmail', 'HR email'],
                  ['accountsEmail', 'Accounts email'],
                  ['phone', 'Phone'],
                  ['website', 'Website'],
                ] as const
              ).map(([key, label]) => (
                <SettingsField key={key} label={label}>
                  <input
                    className={settingsInputClass()}
                    style={settingsInputStyle()}
                    value={profile.contact[key]}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        contact: { ...p.contact, [key]: e.target.value },
                      }))
                    }
                  />
                </SettingsField>
              ))}
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title="Document defaults">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <SettingsField label="Report header line">
                  <input
                    className={settingsInputClass()}
                    style={settingsInputStyle()}
                    value={profile.documents.reportHeaderLine}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        documents: { ...p.documents, reportHeaderLine: e.target.value },
                      }))
                    }
                    placeholder="Optional subtitle on exports"
                  />
                </SettingsField>
              </div>
              <div className="md:col-span-2">
                <SettingsField label="Document footer">
                  <textarea
                    className={`${settingsInputClass()} min-h-[72px]`}
                    style={settingsInputStyle()}
                    value={profile.documents.footerText}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        documents: { ...p.documents, footerText: e.target.value },
                      }))
                    }
                  />
                </SettingsField>
              </div>
              <SettingsField label="Signatory name">
                <input
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
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
              </SettingsField>
              <SettingsField label="Signatory designation">
                <input
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
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
              </SettingsField>
            </div>
          </SettingsSectionCard>

          <SettingsSectionCard title="Regional">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <SettingsField label="Timezone">
                <select
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
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
              </SettingsField>
              <SettingsField label="Date format">
                <select
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
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
              </SettingsField>
              <SettingsField label="Currency">
                <input
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                  value={profile.locale.currency}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      locale: { ...p.locale, currency: e.target.value },
                    }))
                  }
                />
              </SettingsField>
              <SettingsField label="Financial year starts (month)">
                <select
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
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
              </SettingsField>
            </div>
          </SettingsSectionCard>
        </div>

        <div className="space-y-6">
          <div className="sticky top-6 border bg-white p-6 dark:bg-stone-950" style={settingsLedgerBorder}>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Live preview</p>
            <div
              className="border bg-stone-50 p-4 dark:bg-stone-900"
              style={settingsLedgerBorder}
            >
              <div className="flex items-center gap-3">
                {profile.branding.logoUrl ? (
                  <img src={profile.branding.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
                ) : (
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ background: profile.branding.primaryColor }}
                  >
                    {getBrandInitials(profile)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{profile.displayName || 'HRMS'}</p>
                  <p className="text-[10px] text-stone-500">{profile.legalName || 'Legal name not set'}</p>
                </div>
              </div>
              {registeredFormatted && (
                <p
                  className="mt-3 border-t border-dashed pt-3 text-[10px] leading-relaxed text-stone-500"
                  style={settingsLedgerBorder}
                >
                  {registeredFormatted}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <SettingsSaveBar onSave={handleSave} saving={saving} label="Save company settings" />
    </SettingsPanel>
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
    <div className="space-y-4">
      <SettingsField label="Address lines">
        {lines.map((line, idx) => (
          <input
            key={idx}
            className={`${settingsInputClass()} mt-2`}
            style={settingsInputStyle()}
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
            className="mt-2 text-[10px] font-semibold uppercase text-[color:var(--ps-accent)]"
            onClick={() => onChange({ ...address, lines: [...lines, ''] })}
          >
            + Add address line
          </button>
        )}
      </SettingsField>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(
          [
            ['city', 'City'],
            ['state', 'State'],
            ['pin', 'PIN'],
            ['country', 'Country'],
          ] as const
        ).map(([key, label]) => (
          <SettingsField key={key} label={label}>
            <input
              className={settingsInputClass()}
              style={settingsInputStyle()}
              value={address[key]}
              onChange={(e) => onChange({ ...address, [key]: e.target.value })}
            />
          </SettingsField>
        ))}
      </div>
    </div>
  );
}

export default CompanySettings;
