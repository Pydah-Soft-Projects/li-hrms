'use client';

import Link from 'next/link';
import type { CompanyProfile } from '@/lib/companyProfile';

type CompanyBrandMarkProps = {
  profile?: CompanyProfile;
  collapsed?: boolean;
  className?: string;
  href?: string;
  subtitle?: string;
};

export function CompanyBrandMark({
  profile,
  collapsed,
  className = '',
  href = '/dashboard',
  subtitle = 'Human Resource Management',
}: CompanyBrandMarkProps) {
  const content = collapsed ? (
    <div className="flex flex-col items-center justify-center w-full">
      <img
        src="/campo-logos/favicon.svg"
        alt="Campo"
        title="Campo Human Resource Management"
        style={{ width: '28px', height: '28px', maxHeight: '28px' }}
        className="w-7 h-7 rounded-lg object-contain shadow-xs shrink-0 mx-auto"
      />
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center text-center w-full min-w-0 select-none">
      <img
        src="/campo-logos/campo_logo_transparent_hq.png"
        alt="Campo"
        style={{
          height: '28px',
          maxHeight: '28px',
          width: 'auto',
          maxWidth: '115px',
          objectFit: 'contain',
          display: 'block',
        }}
        className="h-7 w-auto max-w-[115px] object-contain mx-auto select-none"
      />
      <span
        className="text-[11px] font-medium tracking-wide mt-2 whitespace-nowrap select-none"
        style={{ color: 'var(--sidebar-muted)' }}
      >
        {subtitle}
      </span>
    </div>
  );

  const containerClass = `flex flex-col items-center justify-center w-full focus:outline-none ${className}`;

  if (href) {
    return (
      <Link href={href} className={containerClass}>
        {content}
      </Link>
    );
  }

  return <div className={containerClass}>{content}</div>;
}
