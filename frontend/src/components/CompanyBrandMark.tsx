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
    <img
      src="/campo-logos/favicon.svg"
      alt="Campo HRMS"
      title="Campo Human Resource Management"
      className="w-8 h-8 rounded-lg object-contain shadow-xs shrink-0"
    />
  ) : (
    <div className="flex flex-col leading-tight min-w-0 select-none">
      <img
        src="/campo-logos/campo_logo_transparent_hq.png"
        alt="Campo"
        className="h-7 w-auto max-w-[155px] object-contain object-left"
      />
      <span
        className="text-[10px] mt-1.5 font-medium tracking-wider whitespace-nowrap"
        style={{ color: 'var(--sidebar-muted, rgba(255, 255, 255, 0.7))' }}
      >
        {subtitle}
      </span>
    </div>
  );

  const containerClass = `flex items-center gap-3 overflow-hidden focus:outline-none ${
    collapsed ? 'justify-center w-full' : ''
  } ${className}`;

  if (href) {
    return (
      <Link href={href} className={containerClass}>
        {content}
      </Link>
    );
  }

  return <div className={containerClass}>{content}</div>;
}
