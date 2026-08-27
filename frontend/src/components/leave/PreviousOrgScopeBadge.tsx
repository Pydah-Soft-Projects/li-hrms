'use client';

import { Building2 } from 'lucide-react';
import { getPreviousOrgBadgeLabel } from '@/lib/leaveOdOrgScope';

type PreviousOrgScopeBadgeProps = {
  item: Record<string, unknown>;
  className?: string;
  size?: 'sm' | 'md';
};

export function PreviousOrgScopeBadge({
  item,
  className = '',
  size = 'sm',
}: PreviousOrgScopeBadgeProps) {
  const label = getPreviousOrgBadgeLabel(item);
  const sizeClasses =
    size === 'md'
      ? 'px-2.5 py-1 text-[11px] gap-1.5'
      : 'px-2 py-0.5 text-[10px] gap-1';

  return (
    <span
      className={`inline-flex items-center rounded-full border border-violet-200 bg-violet-50 font-bold text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300 ${sizeClasses} ${className}`}
      title="Action required by the previous department or division approver"
    >
      <Building2 className={size === 'md' ? 'h-3.5 w-3.5 shrink-0' : 'h-3 w-3 shrink-0'} />
      <span className="truncate max-w-[220px]">{label}</span>
    </span>
  );
}
