'use client';

import { RotateCw } from 'lucide-react';
import {
  collectModulePermissionFlags,
  moduleHasAnyGrantedPermission,
  type GranularModuleDef,
  type ModulePermissionFlags,
} from '@/lib/userFeaturePermissions';
import {
  getReadButtonLabel,
  getWriteButtonLabel,
} from '@/lib/modulePermissionLabels';

type BadgeProps = {
  label: string;
  className: string;
  icon?: React.ReactNode;
};

function Badge({ label, className, icon }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider ${className}`}>
      {icon}
      {label}
    </span>
  );
}

type Props = {
  module: GranularModuleDef;
  featureControl: string[] | undefined;
  /** Compact chips for inline matrix; default false uses UserViewDialog styling */
  variant?: 'view-dialog' | 'matrix';
  getReadLabel?: (code: string) => string;
  getWriteLabel?: (code: string) => string;
};

function renderBadges(
  module: GranularModuleDef,
  flags: ModulePermissionFlags,
  variant: 'view-dialog' | 'matrix',
  getReadLabel: (code: string) => string,
  getWriteLabel: (code: string) => string
) {
  const isMatrix = variant === 'matrix';
  const readCls = isMatrix
    ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
    : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300';
  const writeCls = isMatrix
    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';

  return (
    <>
      {flags.hasRead ? <Badge label={isMatrix ? getReadLabel(module.code).toUpperCase() : getReadLabel(module.code)} className={readCls} /> : null}
      {flags.hasWrite ? <Badge label={isMatrix ? getWriteLabel(module.code).toUpperCase() : getWriteLabel(module.code)} className={writeCls} /> : null}
      {flags.hasVerify ? (
        <Badge label="Verify" className={isMatrix ? 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' : 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'} />
      ) : null}
      {flags.hasBank ? (
        <Badge label="Bank" className={isMatrix ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'} icon={!isMatrix ? <RotateCw className="h-3 w-3" /> : undefined} />
      ) : null}
      {flags.hasSecondSalary ? (
        <Badge label="2nd Salary" className={isMatrix ? 'bg-lime-50 text-lime-700 dark:bg-lime-500/10 dark:text-lime-400' : 'bg-lime-50 text-lime-800 dark:bg-lime-500/10 dark:text-lime-300'} />
      ) : null}
      {flags.hasFile ? (
        <Badge label="File" className={isMatrix ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'} />
      ) : null}
      {flags.hasEdit ? (
        <Badge label="Edit" className={isMatrix ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'} />
      ) : null}
      {flags.hasTerminate ? (
        <Badge label="Terminate" className={isMatrix ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' : 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300'} />
      ) : null}
      {flags.hasRelease ? (
        <Badge label="Release" className={isMatrix ? 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400' : 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300'} />
      ) : null}
    </>
  );
}

export function modulePermissionFlagsForView(module: GranularModuleDef, featureControl: string[] | undefined) {
  return collectModulePermissionFlags(module, featureControl);
}

export function moduleShouldShowInPermissionView(module: GranularModuleDef, featureControl: string[] | undefined) {
  return moduleHasAnyGrantedPermission(collectModulePermissionFlags(module, featureControl));
}

export default function ModulePermissionBadges({
  module,
  featureControl,
  variant = 'view-dialog',
  getReadLabel = getReadButtonLabel,
  getWriteLabel = getWriteButtonLabel,
}: Props) {
  const flags = collectModulePermissionFlags(module, featureControl);
  return (
    <div className={`flex flex-wrap justify-end gap-1 ${variant === 'matrix' ? 'gap-2' : ''}`}>
      {renderBadges(module, flags, variant, getReadLabel, getWriteLabel)}
    </div>
  );
}
