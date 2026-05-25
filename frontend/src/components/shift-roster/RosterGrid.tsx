'use client';

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Users, Hash, X } from 'lucide-react';
import { Employee, Shift } from '@/lib/api';
import { RosterCell, RosterGridProps } from '@/lib/shiftRoster/types';
import EmployeeQuickAssign from '@/components/shift-roster/EmployeeQuickAssign';

const RosterSkeletonRow = ({ daysCount }: { daysCount: number }) => (
  <tr className="animate-pulse border-b border-slate-200/40 dark:border-slate-800/40">
    <td className="w-8 px-1 py-1 sticky left-0 z-20 bg-white dark:bg-slate-950 border-r border-slate-200/60" />
    <td className="px-5 py-1 sticky left-8 z-10 bg-white dark:bg-slate-950 shadow-sm border-r border-slate-200/60 dark:border-slate-800/60">
      <div className="h-6 w-24 rounded bg-slate-100 dark:bg-slate-800" />
    </td>
    {Array(daysCount).fill(0).map((_, i) => (
      <td key={i} className="p-0 border-r border-slate-200/40 dark:border-slate-800/40 opacity-50">
        <div className="h-[36px] w-full bg-slate-50/50 dark:bg-slate-900/30" />
      </td>
    ))}
  </tr>
);

const getSoftShiftStyle = (color: string) => ({
  backgroundColor: `${color}14`,
  borderLeft: `2.5px solid ${color}`,
  color,
});

type EditorAnchor = { top: number; left: number; bottom: number; right: number };

type CellEditorState =
  | { kind: 'cell'; empNo: string; date: string; anchor: EditorAnchor; cell: RosterCell }
  | { kind: 'column'; date: string; anchor: EditorAnchor; employeeCount: number };

const MENU_W = 220;
const MENU_MAX_H = 320;

function computePopoverPosition(anchor: EditorAnchor) {
  const pad = 8;
  let top = anchor.bottom + 6;
  let left = anchor.left;

  if (left + MENU_W > window.innerWidth - pad) {
    left = Math.max(pad, anchor.right - MENU_W);
  }
  if (left < pad) left = pad;

  if (top + MENU_MAX_H > window.innerHeight - pad) {
    top = anchor.top - MENU_MAX_H - 6;
  }
  if (top < pad) {
    top = Math.min(anchor.bottom + 6, window.innerHeight - MENU_MAX_H - pad);
  }

  return { top, left };
}

const RosterCellComponent = memo(({
  empNo,
  date,
  cell,
  isHoliday,
  isWeekend,
  isDirty,
  shiftById,
  doj,
  onOpenEditor,
}: {
  empNo: string;
  date: string;
  cell: RosterCell;
  isHoliday: boolean;
  isWeekend: boolean;
  isDirty: boolean;
  shiftById: Map<string, Shift>;
  doj?: string;
  onOpenEditor: (empNo: string, date: string, el: HTMLElement) => void;
}) => {
  const isBeforeJoining = doj && date < format(parseISO(doj), 'yyyy-MM-dd');
  const current = cell?.status === 'WO' ? 'WO' : (cell?.status === 'HOL' ? 'HOL' : cell?.shiftId || '');
  const shift = current && current !== 'WO' && current !== 'HOL' ? shiftById.get(current) : undefined;
  const shiftColor = shift?.color || '#3b82f6';
  const softStyle = shift ? getSoftShiftStyle(shiftColor) : {};
  const h1 = cell?.firstHalfStatus;
  const h2 = cell?.secondHalfStatus;

  const visualStyle =
    current === 'WO'
      ? { backgroundColor: '#fff7ed', color: '#ea580c', borderLeft: '2.5px solid #f97316' }
      : current === 'HOL'
        ? { backgroundColor: '#fff1f2', color: '#e11d48', borderLeft: '2.5px solid #f43f5e' }
        : softStyle;

  return (
    <td
      className={`p-0 text-center relative h-[38px] border-r border-slate-200/30 dark:border-slate-800/20 last:border-r-0 ${isWeekend ? 'bg-slate-50/10 dark:bg-indigo-500/5' : ''} ${isHoliday ? 'bg-rose-50/10 dark:bg-rose-500/5' : ''} ${isDirty ? 'ring-2 ring-inset ring-amber-400 dark:ring-amber-500 z-[1]' : ''} ${isBeforeJoining ? 'bg-slate-100/30 dark:bg-slate-900/40 cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      title={isBeforeJoining ? `Pre-joining (Joined: ${format(parseISO(doj!), 'dd-MMM-yyyy')})` : undefined}
      onClick={(e) => {
        if (isBeforeJoining) return;
        onOpenEditor(empNo, date, e.currentTarget);
      }}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center text-[9px] font-black tracking-tight transition-opacity ${current ? 'opacity-100' : 'opacity-0 hover:opacity-30'}`}
        style={visualStyle}
      >
        {current === 'WO' ? (
          'WO'
        ) : current === 'HOL' ? (
          'HOL'
        ) : shift ? (
          <span className="flex flex-col items-center leading-none gap-0.5">
            <span>{shift.code || shift.name}</span>
            {(h1 || h2) && (
              <span className="flex gap-0.5 text-[7px] font-black">
                {h1 && (
                  <span className={h1 === 'HOL' ? 'text-rose-600' : 'text-orange-600'} title={`H1 ${h1}`}>
                    H1{h1 === 'HOL' ? '★' : '○'}
                  </span>
                )}
                {h2 && (
                  <span className={h2 === 'HOL' ? 'text-rose-600' : 'text-orange-600'} title={`H2 ${h2}`}>
                    H2{h2 === 'HOL' ? '★' : '○'}
                  </span>
                )}
              </span>
            )}
          </span>
        ) : (
          <Plus size={10} className="text-slate-400" />
        )}
      </div>
      {isDirty && (
        <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-white dark:ring-slate-900 z-10" title="Unsaved change" />
      )}
    </td>
  );
});
RosterCellComponent.displayName = 'RosterCellComponent';

const RosterRow = memo(({
  emp,
  days,
  row,
  empHolidays,
  shifts,
  shiftById,
  weekdays,
  isSelected,
  onToggleSelect,
  onBulkUpdate,
  onApplyWeekdays,
  onOpenEditor,
  onDuplicateRow,
  dirtyKeys,
  shiftLabel,
}: {
  emp: Employee;
  days: string[];
  row: Record<string, RosterCell>;
  empHolidays: Set<string>;
  shifts: Shift[];
  shiftById: Map<string, Shift>;
  weekdays: string[];
  isSelected: boolean;
  onToggleSelect: (empNo: string) => void;
  onBulkUpdate: (empNo: string, shiftId: string | null, status?: 'WO' | 'HOL') => void;
  onApplyWeekdays: (empNo: string, shiftId: string, weekdayFlags: Record<string, boolean>) => void;
  onOpenEditor: (empNo: string, date: string, el: HTMLElement) => void;
  onDuplicateRow: (empNo: string) => void;
  dirtyKeys: Set<string>;
  shiftLabel: (s?: Shift | null) => string;
}) => (
  <tr className={`group border-b border-slate-200/40 dark:border-slate-800/40 hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors ${isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}>
    <td className="w-8 px-1 py-1 sticky left-0 z-20 bg-white dark:bg-slate-950 group-hover:bg-slate-50 dark:group-hover:bg-slate-900 border-r border-slate-200/60 dark:border-slate-800/60 text-center">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelect(emp.emp_no)}
        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        aria-label={`Select ${emp.employee_name || emp.emp_no}`}
      />
    </td>
    <td className="px-5 py-1 sticky left-8 z-10 bg-white dark:bg-slate-950 group-hover:bg-slate-50 dark:group-hover:bg-slate-900 shadow-[10px_0_15px_-10px_rgba(0,0,0,0.05)] border-r border-slate-200/60 dark:border-slate-800/60 transition-colors min-w-[220px]">
      <div className="flex flex-col gap-0.5">
        <div className="min-w-0 max-w-[180px]" title={[String(emp?.employee_name || '—'), String(emp?.emp_no || '')].filter(Boolean).join(' · ')}>
          <div className="font-semibold truncate text-slate-900 dark:text-white text-sm">{emp?.employee_name || '—'}</div>
          {emp?.emp_no ? <div className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400">{emp.emp_no}</div> : null}
        </div>
        <div className="mt-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onDuplicateRow(emp.emp_no)}
            className="text-[7px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:underline text-left"
          >
            Duplicate to…
          </button>
          <EmployeeQuickAssign
            empNo={emp.emp_no}
            weekdays={weekdays}
            shifts={shifts}
            shiftLabel={shiftLabel}
            onApplyWeekdays={onApplyWeekdays}
            onApplyAllDays={onBulkUpdate}
          />
        </div>
      </div>
    </td>
    {days.map((d) => (
      <RosterCellComponent
        key={d}
        empNo={emp.emp_no}
        date={d}
        cell={row[d]}
        isHoliday={empHolidays.has(d)}
        isWeekend={new Date(d).getDay() === 0 || new Date(d).getDay() === 6}
        isDirty={dirtyKeys.has(`${emp.emp_no}|${d}`)}
        shiftById={shiftById}
        doj={emp.doj}
        onOpenEditor={onOpenEditor}
      />
    ))}
  </tr>
));
RosterRow.displayName = 'RosterRow';

function toggleHalf(
  cell: RosterCell,
  half: 'firstHalfStatus' | 'secondHalfStatus',
  value: 'HOL' | 'WO'
): RosterCell {
  const next = { ...cell, shiftId: cell.shiftId, status: undefined as undefined };
  const cur = cell[half];
  next[half] = cur === value ? undefined : value;
  const other = half === 'firstHalfStatus' ? 'secondHalfStatus' : 'firstHalfStatus';
  if (next[half] && next[other] === value) next[other] = undefined;
  return next;
}

function CellEditorPopover({
  editor,
  shifts,
  shiftLabel,
  onPick,
  onApplyRestOfWeek,
  onClose,
}: {
  editor: CellEditorState;
  shifts: Shift[];
  shiftLabel: (s?: Shift | null) => string;
  onPick: (value: RosterCell) => void;
  onApplyRestOfWeek: () => void;
  onClose: () => void;
}) {
  const cellForHalf = editor.kind === 'cell' ? editor.cell : null;
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState(() => computePopoverPosition(editor.anchor));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setPos(computePopoverPosition(editor.anchor));
  }, [editor.anchor]);

  useEffect(() => {
    const update = () => setPos(computePopoverPosition(editor.anchor));
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor.anchor]);

  if (!mounted) return null;

  const menu = (
    <>
      <div
        className="fixed inset-0 z-[200]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Assign shift"
        className="fixed z-[210] w-[220px] max-h-[320px] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl py-1 custom-scrollbar"
        style={{ top: pos.top, left: pos.left }}
      >
      <div className="flex items-center justify-between px-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <div>
          <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">
            {editor.kind === 'column' ? 'Assign column' : 'Assign'}
          </span>
          {editor.kind === 'column' && (
            <p className="text-[8px] font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
              All {editor.employeeCount} on this page
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-600"><X size={12} /></button>
      </div>
      {editor.kind === 'cell' && (
        <button type="button" className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30" onClick={() => { onApplyRestOfWeek(); onClose(); }}>Apply to rest of week</button>
      )}
      <button type="button" className="w-full text-left px-3 py-1.5 text-[10px] font-bold hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => onPick({ shiftId: null, status: undefined })}>Clear</button>
      <button type="button" className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30" onClick={() => onPick({ shiftId: null, status: 'WO' })}>Week Off</button>
      <button type="button" className="w-full text-left px-3 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" onClick={() => onPick({ shiftId: null, status: 'HOL' })}>Holiday</button>
      <div className="border-t border-slate-100 dark:border-slate-800 my-0.5" />
      {shifts.map((s) => (
        <button
          key={s._id}
          type="button"
          className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2"
          onClick={() => onPick({
            shiftId: s._id,
            firstHalfStatus: cellForHalf?.firstHalfStatus,
            secondHalfStatus: cellForHalf?.secondHalfStatus,
          })}
        >
          <span className="h-2 w-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: s.color || '#3b82f6' }} />
          <span className="leading-tight break-words">{shiftLabel(s)}</span>
        </button>
      ))}
      {cellForHalf?.shiftId && (
        <>
          <div className="border-t border-slate-100 dark:border-slate-800 my-0.5 px-2 pt-1">
            <span className="text-[7px] font-black uppercase text-slate-400 tracking-widest">Half (with shift)</span>
          </div>
          <button
            type="button"
            className={`w-full text-left px-3 py-1.5 text-[10px] font-bold ${cellForHalf.firstHalfStatus === 'HOL' ? 'bg-rose-50 text-rose-700' : 'hover:bg-rose-50/50 text-rose-600'}`}
            onClick={() => onPick(toggleHalf(cellForHalf, 'firstHalfStatus', 'HOL'))}
          >
            H1 Holiday {cellForHalf.firstHalfStatus === 'HOL' ? '✓' : ''}
          </button>
          <button
            type="button"
            className={`w-full text-left px-3 py-1.5 text-[10px] font-bold ${cellForHalf.secondHalfStatus === 'HOL' ? 'bg-rose-50 text-rose-700' : 'hover:bg-rose-50/50 text-rose-600'}`}
            onClick={() => onPick(toggleHalf(cellForHalf, 'secondHalfStatus', 'HOL'))}
          >
            H2 Holiday {cellForHalf.secondHalfStatus === 'HOL' ? '✓' : ''}
          </button>
          <button
            type="button"
            className={`w-full text-left px-3 py-1.5 text-[10px] font-bold ${cellForHalf.firstHalfStatus === 'WO' ? 'bg-orange-50 text-orange-700' : 'hover:bg-orange-50/50 text-orange-600'}`}
            onClick={() => onPick(toggleHalf(cellForHalf, 'firstHalfStatus', 'WO'))}
          >
            H1 Week off {cellForHalf.firstHalfStatus === 'WO' ? '✓' : ''}
          </button>
          <button
            type="button"
            className={`w-full text-left px-3 py-1.5 text-[10px] font-bold ${cellForHalf.secondHalfStatus === 'WO' ? 'bg-orange-50 text-orange-700' : 'hover:bg-orange-50/50 text-orange-600'}`}
            onClick={() => onPick(toggleHalf(cellForHalf, 'secondHalfStatus', 'WO'))}
          >
            H2 Week off {cellForHalf.secondHalfStatus === 'WO' ? '✓' : ''}
          </button>
        </>
      )}
    </div>
  </>
  );

  return createPortal(menu, document.body);
}

const RosterGrid = memo((props: RosterGridProps) => {
  const {
    loading,
    filteredEmployees,
    totalEmployees,
    page,
    setPage,
    limit,
    setLimit,
    totalPages,
    days,
    weekdays,
    roster,
    dirtyKeys,
    holidayCache,
    shifts,
    selectedEmpNos,
    onToggleSelectEmployee,
    onToggleSelectAll,
    allOnPageSelected,
    someOnPageSelected,
    updateCell,
    applyDayToRestOfWeek,
    applyColumnDay,
    onDuplicateRow,
    applyEmployeeAllDays,
    applyEmployeeWeekdays,
    globalHolidayDates,
    shiftLabel,
  } = props;

  const [editor, setEditor] = useState<CellEditorState | null>(null);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s._id, s])), [shifts]);

  const anchorFromEl = (el: HTMLElement): EditorAnchor => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right };
  };

  const handleOpenEditor = useCallback((empNo: string, date: string, el: HTMLElement) => {
    const cell = roster.get(empNo)?.[date] || { shiftId: null };
    setEditor({ kind: 'cell', empNo, date, anchor: anchorFromEl(el), cell });
  }, [roster]);

  const handleOpenColumnEditor = useCallback((date: string, el: HTMLElement) => {
    setEditor({
      kind: 'column',
      date,
      anchor: anchorFromEl(el),
      employeeCount: filteredEmployees.length,
    });
  }, [filteredEmployees.length]);

  const handlePick = useCallback((value: RosterCell) => {
    if (!editor) return;
    if (editor.kind === 'column') {
      applyColumnDay(editor.date, value);
    } else {
      updateCell(editor.empNo, editor.date, value);
    }
    setEditor(null);
  }, [editor, updateCell, applyColumnDay]);

  const handleApplyRestOfWeek = useCallback(() => {
    if (!editor || editor.kind !== 'cell') return;
    applyDayToRestOfWeek(editor.empNo, editor.date);
  }, [editor, applyDayToRestOfWeek]);

  return (
    <div className="bg-white/60 dark:bg-slate-950/40 rounded-[2rem] border border-slate-200/60 dark:border-slate-800/60 shadow-[0_20px_50px_rgba(0,0,0,0.04)] backdrop-blur-xl overflow-hidden">
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/60 dark:border-slate-800/60 backdrop-blur-md">
        <div className="flex items-center gap-4 mb-3 sm:mb-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-800/30">
            <Users size={14} className="text-blue-600 dark:text-blue-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">
              {totalEmployees} <span className="text-blue-400 dark:text-blue-500/60">Staff</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Show</label>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="bg-transparent border-none text-[10px] font-black text-slate-700 dark:text-slate-300 focus:ring-0 cursor-pointer"
            >
              <option value={20}>20 Rows</option>
              <option value={50}>50 Rows</option>
              <option value={100}>100 Rows</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest text-slate-400">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60">
            <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1 || loading} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30"><ChevronLeft size={16} /></button>
            <span className="text-[10px] font-black px-2">{page}</span>
            <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages || loading} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-900 disabled:opacity-30"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar relative text-[10px]">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-slate-50/30 dark:bg-slate-900/10">
              <th className="w-8 px-1 py-3 sticky left-0 z-30 bg-slate-50 dark:bg-slate-950 border-r border-b border-slate-200/60 dark:border-slate-800/60 text-center">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
                  }}
                  onChange={onToggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  title="Select all on this page"
                  aria-label="Select all employees on this page"
                />
              </th>
              <th className="px-5 py-3 text-left sticky left-8 z-20 bg-slate-50 dark:bg-slate-950 border-r border-b border-slate-200/60 dark:border-slate-800/60">
                <div className="flex items-center gap-2">
                  <Hash size={12} className="text-slate-400" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Employee List</span>
                </div>
              </th>
              {days.map((d) => {
                const dateObj = new Date(d);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const isGlobalHoliday = globalHolidayDates.has(d);
                return (
                  <th
                    key={d}
                    className={`px-1 py-1.5 text-center min-w-[46px] border-r border-b border-slate-200/40 cursor-pointer group/col transition-colors ${isWeekend ? 'bg-slate-100/30 hover:bg-slate-200/50' : 'hover:bg-indigo-50/90 dark:hover:bg-indigo-950/50'} ${isGlobalHoliday ? 'bg-rose-50/20' : ''}`}
                    title={`Assign all staff on ${format(dateObj, 'EEE, dd MMM')}`}
                    onClick={(e) => handleOpenColumnEditor(d, e.currentTarget)}
                  >
                    <div className="flex flex-col items-center">
                      <span className={`text-[7px] font-black uppercase ${isWeekend ? 'text-blue-500' : 'text-slate-400 group-hover/col:text-indigo-600'}`}>{weekdays[dateObj.getDay()].substring(0, 3)}</span>
                      <span className={`text-[10px] font-black ${isGlobalHoliday ? 'text-red-500 underline' : 'group-hover/col:text-indigo-700 dark:group-hover/col:text-indigo-300'}`}>{dateObj.getDate()}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array(10).fill(0).map((_, i) => <RosterSkeletonRow key={i} daysCount={days.length} />)
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={days.length + 2} className="py-20 text-center text-slate-400 uppercase text-[10px] font-black tracking-widest italic">No staff members found</td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => (
                <RosterRow
                  key={emp.emp_no}
                  emp={emp}
                  days={days}
                  row={roster.get(emp.emp_no) || {}}
                  empHolidays={holidayCache.get(emp.emp_no) || new Set()}
                  shifts={shifts}
                  shiftById={shiftById}
                  weekdays={weekdays}
                  isSelected={selectedEmpNos.has(emp.emp_no)}
                  onToggleSelect={onToggleSelectEmployee}
                  dirtyKeys={dirtyKeys}
                  onBulkUpdate={applyEmployeeAllDays}
                  onApplyWeekdays={applyEmployeeWeekdays}
                  onOpenEditor={handleOpenEditor}
                  onDuplicateRow={onDuplicateRow}
                  shiftLabel={shiftLabel}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {editor && (
        <CellEditorPopover
          editor={editor}
          shifts={shifts}
          shiftLabel={shiftLabel}
          onPick={handlePick}
          onApplyRestOfWeek={handleApplyRestOfWeek}
          onClose={() => setEditor(null)}
        />
      )}

      <div className="px-6 py-3 bg-slate-50/10 border-t border-slate-200/40 flex flex-wrap items-center gap-4">
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Click cell / day header · row quick assign · select + Apply to Selected</span>
        <span className="flex items-center gap-1.5 text-[8px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
          <span className="h-2 w-2 rounded-full bg-amber-500 ring-1 ring-amber-200" />
          Unsaved change (Save to update database)
        </span>
    </div>
    </div>
  );
});

RosterGrid.displayName = 'RosterGrid';
export default RosterGrid;


