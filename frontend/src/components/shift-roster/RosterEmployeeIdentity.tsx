'use client';

import React, { memo } from 'react';
import { Employee } from '@/lib/api';
import {
  getEmployeeDepartment,
  getEmployeeDesignation,
  getEmployeeInitials,
  getEmployeeProfilePhoto,
  getEmployeeRosterTooltip,
} from '@/lib/shiftRoster/employeeDisplay';

type RosterEmployeeIdentityProps = {
  emp: Employee;
  compact?: boolean;
  showDepartment?: boolean;
};

const RosterEmployeeIdentity = memo(function RosterEmployeeIdentity({
  emp,
  compact = false,
  showDepartment = true,
}: RosterEmployeeIdentityProps) {
  const photo = getEmployeeProfilePhoto(emp);
  const designation = getEmployeeDesignation(emp);
  const department = getEmployeeDepartment(emp);
  const avatarSize = compact ? 'h-8 w-8' : 'h-9 w-9';
  const textSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <div className="flex items-start gap-2 min-w-0" title={getEmployeeRosterTooltip(emp)}>
      <div
        className={`${avatarSize} shrink-0 rounded-lg overflow-hidden ring-1 ring-slate-200/80 dark:ring-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center`}
      >
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400">
            {getEmployeeInitials(emp)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className={`font-semibold truncate text-slate-900 dark:text-white ${textSize}`}>
          {emp.employee_name || '—'}
        </div>
        {designation ? (
          <div className="truncate text-[9px] font-medium italic text-slate-600 dark:text-slate-400">
            {designation}
          </div>
        ) : null}
        <div className="truncate text-[9px] text-slate-500 dark:text-slate-400 font-mono">
          {emp.emp_no}
          {showDepartment && department ? (
            <span className="font-sans not-italic text-slate-400 dark:text-slate-500">
              {' '}
              · {department}
            </span>
          ) : null}
        </div>
        {emp.leftDate ? (
          <div className="text-[8px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
            Left {new Date(emp.leftDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default RosterEmployeeIdentity;
