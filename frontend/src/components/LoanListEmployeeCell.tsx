'use client';

import React from 'react';
import type { LoanListRow } from '@/lib/loanListUi';
import { buildLoanListEmployeeParts } from '@/lib/loanListUi';
import { resolveEmployeeListDisplayParts } from '@/lib/employeeListDisplay';

type Tone = 'emerald' | 'teal' | 'blue';

const avatarGradients: Record<Tone, string> = {
  emerald: 'from-emerald-400 to-emerald-600',
  teal: 'from-teal-400 to-teal-600',
  blue: 'from-blue-400 to-blue-600',
};

/**
 * Employee block: profile photo, name, #emp • designation, department • division.
 */
export function LoanListEmployeeCell({
  loan,
  divisions,
  departments,
  designations,
  tone = 'blue',
  showAvatar = true,
}: {
  loan: LoanListRow;
  divisions: any[];
  departments: any[];
  designations: any[];
  tone?: Tone;
  showAvatar?: boolean;
}) {
  buildLoanListEmployeeParts(loan, divisions, departments, designations);
  const d = resolveEmployeeListDisplayParts(
    {
      employeeId: loan.employeeId as any,
      emp_no: loan.emp_no,
      department: loan.department,
      designation: loan.designation,
      division_id: loan.division_id,
    },
    { divisions, departments, designations },
  );
  const initial = (d.name.charAt(0) || 'E').toUpperCase();
  const grad = avatarGradients[tone];

  return (
    <div className="flex min-w-0 items-start gap-3" title={d.tooltip}>
      {showAvatar ? (
        d.profilePhoto ? (
          <img
            src={d.profilePhoto}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
          />
        ) : (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-xs font-semibold text-white`}
          >
            {initial}
          </div>
        )
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
          {d.name}
        </div>
        {d.empDesigLine ? (
          <div className="mt-0.5 truncate text-[11px] text-slate-600 dark:text-slate-400">
            {d.empDesigLine}
          </div>
        ) : null}
        {d.deptDivLine ? (
          <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
            {d.deptDivLine}
          </div>
        ) : null}
      </div>
    </div>
  );
}
