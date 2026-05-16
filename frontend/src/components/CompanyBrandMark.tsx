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
          className="h-8 w-8 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 text-sm font-bold text-white"
          style={{
            background: `linear-gradient(135deg, ${accent}, ${accent}dd)`,
            boxShadow: `0 10px 15px -3px ${accent}33`,
          }}
        >
          {initials}
        </div>
      )}
      {!collapsed && (
        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
          {displayName}
        </h2>
      )}
    </div>
  );
}
