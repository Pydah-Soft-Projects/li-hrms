import type { CSSProperties } from 'react';
import { ledgerStatusBadgeClass } from '@/lib/ledgerUi';

const roleBadgeBase =
  'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest border';

export function userRoleBadgeClass(role: string): string {
  switch (role) {
    case 'super_admin':
      return `${roleBadgeBase} border-rose-200/80 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300`;
    case 'sub_admin':
      return `${roleBadgeBase} border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300`;
    case 'hr':
      return `${roleBadgeBase} border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300`;
    case 'manager':
      return `${roleBadgeBase} border-sky-200/80 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300`;
    case 'hod':
      return `${roleBadgeBase} border-violet-200/80 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300`;
    default:
      return `${roleBadgeBase} border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400`;
  }
}

export function userActiveBadgeClass(isActive: boolean): string {
  return ledgerStatusBadgeClass(isActive ? 'approved' : 'rejected');
}

export function userActiveLabel(isActive: boolean): string {
  return isActive ? 'Active' : 'Disabled';
}

export function userAvatarClass(size: 'sm' | 'md' | 'lg' = 'md'): string {
  const dims =
    size === 'sm' ? 'h-9 w-9 text-sm' : size === 'lg' ? 'h-20 w-20 text-2xl' : 'h-11 w-11 text-base';
  return `relative flex shrink-0 items-center justify-center rounded-md font-semibold text-white ${dims}`;
}

export function userAvatarStyle(): CSSProperties {
  return { backgroundColor: 'var(--ps-accent)' };
}

export function userStatusDotClass(isActive: boolean): string {
  return `absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-stone-950 ${
    isActive ? 'bg-emerald-500' : 'bg-stone-400'
  }`;
}

export type UserLedgerTab = 'overview' | 'permissions' | 'activity';

export function userTabClass(active: boolean): string {
  return `relative flex items-center gap-2 px-4 pb-3 text-[10px] font-semibold uppercase tracking-[0.2em] transition ${
    active ? 'text-[color:var(--ps-accent-ink)]' : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300'
  }`;
}

export function permissionChipClass(kind: 'read' | 'write' | 'verify' | 'terminate' | 'bank' | 'release'): string {
  const base = 'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest border';
  switch (kind) {
    case 'read':
      return `${base} border-sky-200/80 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300`;
    case 'write':
      return `${base} border-emerald-200/80 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300`;
    case 'verify':
      return `${base} border-violet-200/80 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300`;
    case 'terminate':
      return `${base} border-orange-200/80 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300`;
    case 'release':
      return `${base} border-teal-200/80 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300`;
    case 'bank':
      return `${base} border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300`;
    default:
      return base;
  }
}
