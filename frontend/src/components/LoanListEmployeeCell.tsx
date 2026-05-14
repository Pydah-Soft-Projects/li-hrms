'use client';

import React from 'react';
import type { LoanListRow } from '@/lib/loanListUi';
import { buildLoanListEmployeeParts } from '@/lib/loanListUi';

type Tone = 'emerald' | 'teal' | 'blue';

const avatarGradients: Record<Tone, string> = {
  emerald: 'from-emerald-400 to-emerald-600',
  teal: 'from-teal-400 to-teal-600',
  blue: 'from-blue-400 to-blue-600',
};

/**
 * Attendance-style employee block: bold name, #emp badge, division (when present), then department • designation.
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
  const p = buildLoanListEmployeeParts(loan, divisions, departments, designations);
  const initial = (p.primary.charAt(0) || 'E').toUpperCase();
  const grad = avatarGradients[tone];

  return (
    <div className="flex min-w-0 items-start gap-3" title={p.line}>
      {showAvatar ? (
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-xs font-semibold text-white`}
        >
          {initial}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="max-w-[200px] truncate font-semibold text-sm text-slate-900 dark:text-white sm:max-w-[260px]">
            {p.primary}
          </span>
          {p.empNo ? (
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              #{p.empNo}
            </span>
          ) : null}
        </div>
        {p.division ? (
          <div className="mt-1 truncate text-[9px] font-medium leading-snug text-slate-600 dark:text-slate-400">
            {p.division}
          </div>
        ) : null}
        {p.deptDesig ? (
          <div
            className={`truncate text-[9px] leading-snug text-slate-500 dark:text-slate-400 ${p.division ? 'mt-0.5' : 'mt-1'}`}
          >
            {p.deptDesig}
          </div>
        ) : null}
      </div>
    </div>
  );
}
