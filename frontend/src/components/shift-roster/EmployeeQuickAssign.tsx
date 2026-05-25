'use client';

import React, { memo, useCallback, useState } from 'react';
import { Shift } from '@/lib/api';
import QuickAssignControls from '@/components/shift-roster/QuickAssignControls';

type EmployeeQuickAssignProps = {
  empNo: string;
  weekdays: string[];
  shifts: Shift[];
  shiftLabel: (s?: Shift | null) => string;
  onApplyWeekdays: (empNo: string, assignmentValue: string, weekdayFlags: Record<string, boolean>) => void;
  onApplyAllDays: (empNo: string, shiftId: string | null, status?: 'WO' | 'HOL') => void;
  /** Called after apply / full-cycle action (e.g. close popover). */
  onDone?: () => void;
};

const emptyWeekdays = (weekdays: string[]) =>
  weekdays.reduce<Record<string, boolean>>((acc, w) => ({ ...acc, [w]: false }), {});

const EmployeeQuickAssign = memo(function EmployeeQuickAssign({
  empNo,
  weekdays,
  shifts,
  shiftLabel,
  onApplyWeekdays,
  onApplyAllDays,
  onDone,
}: EmployeeQuickAssignProps) {
  const [assignDays, setAssignDays] = useState(() => emptyWeekdays(weekdays));
  const [selectedAssignment, setSelectedAssignment] = useState('');

  const handleApply = useCallback(() => {
    if (!selectedAssignment) return;
    onApplyWeekdays(empNo, selectedAssignment, assignDays);
    onDone?.();
  }, [empNo, selectedAssignment, assignDays, onApplyWeekdays, onDone]);

  return (
    <div className="space-y-2">
      <QuickAssignControls
        weekdays={weekdays}
        assignDays={assignDays}
        setAssignDays={setAssignDays}
        selectedAssignment={selectedAssignment}
        setSelectedAssignment={setSelectedAssignment}
        shifts={shifts}
        shiftLabel={shiftLabel}
        onApply={handleApply}
        applyLabel="Apply"
        compact={false}
        showShiftShortcuts
      />
      <select
        onChange={(e) => {
          const val = e.target.value;
          if (val === 'WO') onApplyAllDays(empNo, null, 'WO');
          else if (val === 'HOL') onApplyAllDays(empNo, null, 'HOL');
          else if (val) onApplyAllDays(empNo, val);
          e.target.value = '';
          if (val) onDone?.();
        }}
        className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1 py-0.5 text-[7px] font-black uppercase tracking-widest text-slate-500 focus:outline-none w-full"
      >
        <option value="">Full cycle…</option>
        <option value="WO">All week off</option>
        <option value="HOL">All holiday</option>
        {shifts.map((s) => (
          <option key={s._id} value={s._id}>
            All {shiftLabel(s)}
          </option>
        ))}
      </select>
    </div>
  );
});

export default EmployeeQuickAssign;
