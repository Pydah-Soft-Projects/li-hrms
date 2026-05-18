'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { LayoutGrid, Save, Download, CheckCircle2, Copy, CopyPlus } from 'lucide-react';
import CopyRepeatModal from '@/components/shift-roster/CopyRepeatModal';
import { useShiftRosterPage, UseShiftRosterPageOptions } from '@/lib/shiftRoster/useShiftRosterPage';
import RosterFilters from '@/app/(workspace)/shift-roster/components/RosterFilters';
import SearchSection from '@/app/(workspace)/shift-roster/components/SearchSection';
import QuickAssignSection from '@/components/shift-roster/QuickAssignSection';

const RosterGrid = dynamic(() => import('@/components/shift-roster/RosterGrid'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  ),
});

const AssignmentsView = dynamic(() => import('@/app/(workspace)/shift-roster/components/AssignmentsView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  ),
});

export default function ShiftRosterPage({ holidaysGraceful }: UseShiftRosterPageOptions = {}) {
  const p = useShiftRosterPage({ holidaysGraceful });

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 w-auto -mt-4 sm:-mt-5 lg:-mt-6 -mx-4 sm:-mx-5 lg:-mx-6 pb-6 space-y-0.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/60 bg-white/80 p-4 shadow-[0_2px_15px_rgba(0,0,0,0.02)] backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <LayoutGrid size={18} />
            </div>
            <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50 uppercase">Shift Roster</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4 lg:justify-end">
            <div className="flex flex-wrap items-center gap-y-2 gap-x-4">
              <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-orange-50/50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/40">
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                <span className="text-[9px] font-black uppercase text-orange-700 dark:text-orange-400">Week Off</span>
              </div>
              <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-[9px] font-black uppercase text-red-700 dark:text-red-400">Holiday</span>
              </div>
              <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                <span className="h-2 w-2 rounded-full bg-amber-500 ring-1 ring-amber-300" />
                <span className="text-[9px] font-black uppercase text-amber-800 dark:text-amber-300">Unsaved edit</span>
              </div>
              {p.shifts.slice(0, 6).map((s) => (
                <div key={s._id} className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color || '#3b82f6' }} />
                  <span className="text-[9px] font-black uppercase text-slate-600 dark:text-slate-400">{p.shiftLabel(s)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:px-6 py-3 bg-white/40 dark:bg-slate-950/20 border-b border-slate-200/40 dark:border-slate-800/40">
          <RosterFilters
            selectedDivision={p.selectedDivision}
            setSelectedDivision={p.setSelectedDivision}
            divisions={p.divisions}
            selectedDept={p.selectedDept}
            setSelectedDept={p.setSelectedDept}
            departments={p.filteredDepartments}
            selectedDesignation={p.selectedDesignation}
            setSelectedDesignation={p.setSelectedDesignation}
            designations={p.filteredDesignations}
            selectedGroup={p.selectedGroup}
            setSelectedGroup={p.setSelectedGroup}
            groups={p.groupsForDropdown}
            month={p.month}
            setMonth={p.setMonth}
            setPage={p.setPage}
            cycleDates={p.cycleDates}
          />

          <div className="w-full flex flex-col lg:flex-row lg:items-center gap-2.5">
            <div className="w-full lg:max-w-sm">
              <SearchSection value={p.searchTerm} onSearchChange={p.setSearchTerm} onSearchSubmit={p.handleSearchSubmit} />
            </div>
            <div className="w-full lg:w-auto grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  p.setDuplicateSourceEmp(null);
                  p.setShowCopyModal(true);
                }}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-600 border border-indigo-700 text-white text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md"
              >
                <CopyPlus size={13} />
                Copy & Repeat
              </button>
              <button
                type="button"
                onClick={p.handleAutoFillNextCycle}
                disabled={p.autoFillLoading}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-600 border border-amber-700 text-white text-[10px] font-black uppercase tracking-wider hover:bg-amber-700 transition-all shadow-md disabled:opacity-50"
              >
                <Copy size={13} />
                {p.autoFillLoading ? 'Filling...' : 'Auto-fill'}
              </button>
              <button type="button" onClick={p.handleExportExcel} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-green-600 border border-green-700 text-white text-[10px] font-black uppercase tracking-wider hover:bg-green-700 transition-all shadow-md">
                <Download size={13} />
                Export
              </button>
              <button
                type="button"
                onClick={p.saveRoster}
                disabled={p.saving}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-[10px] font-black uppercase tracking-wider shadow-lg transition-all disabled:opacity-50 ${p.dirtyCount > 0 ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30 ring-2 ring-amber-300/50' : 'bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-500/20'}`}
              >
                <Save size={14} />
                {p.saving ? `...${p.savingProgress}%` : p.dirtyCount > 0 ? `Save (${p.dirtyCount})` : 'Save'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/40 dark:bg-slate-950/20 border-b border-slate-200/40 dark:border-slate-800/40 sm:px-6 py-2">
          <div className="flex items-center gap-4">
            <div className="flex gap-1.5 p-1 rounded-xl bg-indigo-50/20 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-sm">
              <button type="button" onClick={() => p.setActiveTab('roster')} className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${p.activeTab === 'roster' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-blue-400' : 'text-slate-500'}`}>
                <LayoutGrid size={12} />
                Grid View
              </button>
              <button type="button" onClick={() => p.setActiveTab('assigned')} className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${p.activeTab === 'assigned' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-blue-400' : 'text-slate-500'}`}>
                <CheckCircle2 size={12} />
                Assignments
              </button>
            </div>
          </div>
          <QuickAssignSection
            weekdays={p.weekdays}
            shiftAssignDays={p.shiftAssignDays}
            setShiftAssignDays={p.setShiftAssignDays}
            selectedShiftForAssign={p.selectedShiftForAssign}
            setSelectedShiftForAssign={p.setSelectedShiftForAssign}
            shifts={p.shifts}
            handleAssignAll={p.handleAssignAll}
            handleAssignSelected={p.handleAssignSelected}
            selectedCount={p.selectedCount}
            shiftLabel={p.shiftLabel}
          />
        </div>

        <div className="p-0 sm:p-2 lg:p-4">
          {p.activeTab === 'roster' ? (
            <RosterGrid
              loading={p.loading}
              weekdays={p.weekdays}
              selectedEmpNos={p.selectedEmpNos}
              onToggleSelectEmployee={p.toggleSelectEmployee}
              onToggleSelectAll={p.toggleSelectAllOnPage}
              allOnPageSelected={p.allOnPageSelected}
              someOnPageSelected={p.someOnPageSelected}
              filteredEmployees={p.filteredEmployees}
              totalEmployees={p.totalEmployees}
              page={p.page}
              setPage={p.setPage}
              totalPages={p.totalPages}
              limit={p.limit}
              setLimit={p.setLimit}
              days={p.days}
              roster={p.roster}
              dirtyKeys={p.dirtyKeys}
              holidayCache={p.holidayCache}
              shifts={p.shifts}
              updateCell={p.updateCell}
              applyDayToRestOfWeek={p.applyDayToRestOfWeek}
              applyColumnDay={p.applyColumnDay}
              onDuplicateRow={p.openDuplicateRow}
              applyEmployeeAllDays={p.applyEmployeeAllDays}
              applyEmployeeWeekdays={p.applyEmployeeWeekdays}
              globalHolidayDates={p.globalHolidayDates}
              shiftLabel={p.shiftLabel}
            />
          ) : (
            <AssignmentsView filteredAssignedSummary={p.filteredAssignedSummary} shifts={p.shifts} shiftLabel={p.shiftLabel} />
          )}
        </div>

        <CopyRepeatModal
          open={p.showCopyModal}
          onClose={() => {
            p.setShowCopyModal(false);
            p.setDuplicateSourceEmp(null);
          }}
          employees={p.employees}
          departments={p.departments}
          selectedDept={p.selectedDept}
          templates={p.templates}
          onRefreshTemplates={p.refreshTemplates}
          onCopyFromEmployee={p.handleCopyFromEmployee}
          onFillFromPreviousCycle={p.handleFillFromPreviousCycle}
          onSaveTemplate={p.handleSaveTemplate}
          onApplyTemplate={p.handleApplyTemplate}
          onDeleteTemplate={p.handleDeleteTemplate}
          fillPreviousLoading={p.fillPreviousLoading}
          dirtyCount={p.dirtyCount}
          initialSourceEmp={p.duplicateSourceEmp}
        />
      </div>
    </div>
  );
}
