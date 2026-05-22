'use client';

import React, { memo } from 'react';
import { Plus } from 'lucide-react';
import { QuickAssignSectionProps } from '@/lib/shiftRoster/types';
import QuickAssignControls from '@/components/shift-roster/QuickAssignControls';

const QuickAssignSection = memo(function QuickAssignSection({
  weekdays,
  shiftAssignDays,
  setShiftAssignDays,
  selectedShiftForAssign,
  setSelectedShiftForAssign,
  shifts,
  handleAssignAll,
  handleAssignSelected,
  selectedCount,
  shiftLabel,
}: QuickAssignSectionProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-indigo-50/50 dark:bg-indigo-900/10 px-4 py-2 rounded-xl border border-indigo-200/60 dark:border-indigo-900/30 shadow-sm transition-all hover:bg-white dark:hover:bg-slate-900">
      <div className="flex items-center gap-2 shrink-0">
        <Plus size={16} className="text-indigo-600 dark:text-indigo-400" />
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          Quick Assign
        </span>
      </div>

      <QuickAssignControls
        weekdays={weekdays}
        assignDays={shiftAssignDays}
        setAssignDays={setShiftAssignDays}
        selectedAssignment={selectedShiftForAssign}
        setSelectedAssignment={setSelectedShiftForAssign}
        shifts={shifts}
        shiftLabel={shiftLabel}
        onApply={handleAssignAll}
        applyLabel="Apply to All"
      />

      <button
        type="button"
        onClick={handleAssignSelected}
        disabled={!selectedShiftForAssign || selectedCount === 0}
        className="px-4 py-2 rounded-lg border-2 border-indigo-600 text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-50 transition-all shrink-0"
        title={selectedCount === 0 ? 'Select employees in the grid first' : undefined}
      >
        Apply to Selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
      </button>
    </div>
  );
});

export default QuickAssignSection;
