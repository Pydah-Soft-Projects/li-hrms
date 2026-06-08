'use client';

import { getBrandInitials, type CompanyProfile } from '@/lib/companyProfile';

type CompanyBrandMarkProps = {
  profile: CompanyProfile;
  collapsed?: boolean;
  className?: string;
};

export function CompanyBrandMark({ profile, collapsed, className = '' }: CompanyBrandMarkProps) {
  const displayName = profile.displayName || 'HRMS';
  const initials = getBrandInitials(profile);
  const logoUrl = profile.branding.logoUrl?.trim();
  const accent = profile.branding.primaryColor || '#059669';

  return (
    <div className={`flex items-center gap-3 ${collapsed ? 'justify-center w-full' : ''} ${className}`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={displayName}
          className="h-8 w-8 rounded-xl object-contain flex-shrink-0 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700"
        />
      ) : (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center border text-sm font-bold text-white"
          style={{
            backgroundColor: accent,
            borderColor: 'var(--ps-accent-border, rgba(5, 150, 105, 0.22))',
          }}
        >
          {initials}
        </div>
      )}
      {!collapsed && (
        <h2
          className="truncate font-serif text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100"
          style={{ color: 'var(--ps-accent-ink, rgb(28 25 23))' }}
        >
          {displayName}
        </h2>
      )}
    </div>
  );
}
