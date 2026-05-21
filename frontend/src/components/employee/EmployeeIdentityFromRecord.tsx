'use client';

import {
  resolveEmployeeListDisplayParts,
  type EmployeeListDisplaySource,
} from '@/lib/employeeListDisplay';

type AvatarTone = 'blue' | 'violet' | 'emerald' | 'teal' | 'slate';
type Size = 'sm' | 'md';

const avatarGradients: Record<AvatarTone, string> = {
  blue: 'from-blue-400 to-blue-600',
  violet: 'from-violet-400 to-violet-600',
  emerald: 'from-emerald-400 to-emerald-600',
  teal: 'from-teal-400 to-teal-600',
  slate: 'from-slate-400 to-slate-600',
};

const avatarSizes: Record<Size, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
};

const nameSizes: Record<Size, string> = {
  sm: 'text-xs',
  md: 'text-sm',
};

const sublineSizes: Record<Size, string> = {
  sm: 'text-[10px]',
  md: 'text-[11px]',
};

export function EmployeeIdentityFromRecord({
  record,
  lookups,
  size = 'md',
  avatarTone = 'blue',
  className = '',
  showAvatar = true,
}: {
  record: Record<string, unknown>;
  lookups?: {
    divisions?: { _id?: string; name?: string; code?: string }[];
    departments?: { _id?: string; name?: string; code?: string }[];
    designations?: { _id?: string; name?: string; title?: string; code?: string }[];
  };
  size?: Size;
  avatarTone?: AvatarTone;
  className?: string;
  showAvatar?: boolean;
}) {
  const source: EmployeeListDisplaySource = {
    employeeId: (record.employeeId as EmployeeListDisplaySource['employeeId']) ?? null,
    employee_name: record.employee_name as string | undefined,
    emp_no: record.emp_no as string | undefined,
    department: record.department as EmployeeListDisplaySource['department'],
    designation: record.designation as EmployeeListDisplaySource['designation'],
    division_id: record.division_id as EmployeeListDisplaySource['division_id'],
  };

  const d = resolveEmployeeListDisplayParts(source, lookups);
  const initial = (d.name.charAt(0) || 'E').toUpperCase();
  const grad = avatarGradients[avatarTone];
  const avatarClass = avatarSizes[size];

  return (
    <div className={`flex min-w-0 items-start gap-3 ${className}`.trim()} title={d.tooltip}>
      {showAvatar ? (
        d.profilePhoto ? (
          <img
            src={d.profilePhoto}
            alt=""
            className={`${avatarClass} shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700`}
          />
        ) : (
          <div
            className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${grad} font-semibold text-white ${avatarClass}`}
          >
            {initial}
          </div>
        )
      ) : null}
      <div className="min-w-0 flex-1">
        <div className={`truncate font-semibold text-slate-900 dark:text-white ${nameSizes[size]}`}>
          {d.name}
        </div>
        {d.empDesigLine ? (
          <div className={`mt-0.5 truncate text-slate-600 dark:text-slate-400 ${sublineSizes[size]}`}>
            {d.empDesigLine}
          </div>
        ) : null}
        {d.deptDivLine ? (
          <div className={`mt-0.5 truncate text-slate-500 dark:text-slate-400 ${sublineSizes[size]}`}>
            {d.deptDivLine}
          </div>
        ) : null}
      </div>
    </div>
  );
}
