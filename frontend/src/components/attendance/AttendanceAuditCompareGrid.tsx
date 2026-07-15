'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import Spinner from '@/components/Spinner';
import { AlertTriangle, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';

type EditEntry = {
  source?: string;
  type?: string;
  label?: string;
  field?: string;
  date?: string;
  oldValue?: unknown;
  newValue?: unknown;
  by?: string | null;
  role?: string | null;
  at?: string | null;
  remarks?: string | null;
  details?: string | null;
};

type DayComparison = {
  date: string;
  attendanceCell: string;
  payRegisterCell: string;
  mismatch: boolean;
  isConflict?: boolean;
  hasEdits: boolean;
  attendanceEdits: EditEntry[];
  payRegisterEdits: EditEntry[];
};

type SummaryCols = Record<string, number>;

export type CompareData = {
  employee: {
    _id: string;
    emp_no: string;
    employee_name: string;
    department?: string;
    division?: string;
  };
  month: string;
  period: { start: string; end: string };
  processingMode?: string;
  hasPayRegister: boolean;
  summaryLocked?: boolean;
  dates: string[];
  dayComparisons: DayComparison[];
  mismatchDayCount: number;
  editDayCount: number;
  rows: {
    attendance: { label: string; summary: SummaryCols; edits: unknown[] };
    payRegister: { label: string; summary: SummaryCols; edits: EditEntry[]; lastEditedAt?: string | null };
  };
  summaryDiffs: { field: string; attendance: number; payRegister: number; delta: number }[];
  flagged: boolean;
};

const SINGLE_SHIFT_SUMMARY_COLUMNS: { key: string; label: string; short: string }[] = [
  { key: 'present', label: 'Present', short: 'Pres' },
  { key: 'weekOffs', label: 'Week offs', short: 'WO' },
  { key: 'holidays', label: 'Holidays', short: 'Hol' },
  { key: 'paidLeaves', label: 'Paid leave', short: 'Paid' },
  { key: 'lop', label: 'LOP', short: 'LOP' },
  { key: 'od', label: 'OD', short: 'OD' },
  { key: 'absent', label: 'Absent', short: 'Abs' },
  { key: 'totalDaysSummed', label: 'Total', short: 'Tot' },
  { key: 'periodDays', label: 'Period days', short: 'Per' },
  { key: 'lates', label: 'Late/early', short: 'Lt' },
  { key: 'dedAbsent', label: 'Ded. absent', short: 'DAbs' },
  { key: 'attDed', label: 'Att. ded.', short: 'Ded' },
  { key: 'paidDays', label: 'Paid days', short: 'PDays' },
];

const MULTI_SHIFT_SUMMARY_COLUMNS: { key: string; label: string; short: string }[] = [
  { key: 'present', label: 'Present', short: 'Pres' },
  { key: 'weekOffs', label: 'Week offs', short: 'WO' },
  { key: 'holidays', label: 'Holidays', short: 'Hol' },
  { key: 'leaves', label: 'Leaves', short: 'Lv' },
  { key: 'paidLeaves', label: 'Paid leave', short: 'Paid' },
  { key: 'lop', label: 'LOP', short: 'LOP' },
  { key: 'od', label: 'OD', short: 'OD' },
  { key: 'absent', label: 'Absent', short: 'Abs' },
  { key: 'partial', label: 'Partial', short: 'Part' },
  { key: 'totalDaysSummed', label: 'Total', short: 'Tot' },
  { key: 'periodDays', label: 'Period days', short: 'Per' },
  { key: 'lates', label: 'Late/early', short: 'Lt' },
  { key: 'attDed', label: 'Att. ded.', short: 'Ded' },
  { key: 'payableShifts', label: 'Payable', short: 'Pay' },
];

function summaryColumnsForMode(mode?: string) {
  return mode === 'single_shift' ? SINGLE_SHIFT_SUMMARY_COLUMNS : MULTI_SHIFT_SUMMARY_COLUMNS;
}

function formatDayLabel(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function formatEditTime(at?: string | null) {
  if (!at) return '';
  try {
    return new Date(at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(at);
  }
}

function formatEditValue(v: unknown) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

type Props = {
  employeeId?: string;
  month?: string;
  data?: CompareData | null;
  onClose?: () => void;
  compact?: boolean;
};

export function AttendanceAuditCompareGrid({ employeeId, month, data: dataProp, onClose, compact }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(!dataProp);
  const [data, setData] = useState<CompareData | null>(dataProp ?? null);
  const [editPanel, setEditPanel] = useState<{ date: string; edits: EditEntry[] } | null>(null);
  const showEditsOnly = true;

  useEffect(() => {
    if (dataProp) {
      setData(dataProp);
      setLoading(false);
      return;
    }
    if (!employeeId || !month) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.getAttendanceAuditCompare(employeeId, month);
        if (cancelled) return;
        if (res.success) setData(res.data as CompareData);
        else toast.error(res.message || 'Failed to load comparison');
      } catch {
        if (!cancelled) toast.error('Failed to load comparison');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, month, dataProp]);

  const summaryColumns = useMemo(
    () => summaryColumnsForMode(data?.processingMode),
    [data?.processingMode]
  );

  const diffFields = useMemo(() => new Set((data?.summaryDiffs || []).map((d) => d.field)), [data]);

  const visibleDays = useMemo(() => {
    if (!data) return [];
    return data.dayComparisons.filter((d) => d.mismatch || d.hasEdits || d.isConflict);
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return <p className="py-6 text-center text-sm text-slate-500">No comparison data.</p>;
  }

  const scrollTable = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' });
  };

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/40 ${compact ? '' : 'p-4'}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 px-1">
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">
            {data.employee.emp_no} — {data.employee.employee_name}
          </p>
          <p className="text-xs text-slate-500">
            {data.period.start} → {data.period.end}
            {data.processingMode ? ` · ${data.processingMode}` : ''}
            {data.summaryLocked ? ' · Pay register locked' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {(data.mismatchDayCount > 0 || data.editDayCount > 0) && (
        <div className="mb-3 flex flex-wrap gap-2 px-1 text-xs">
          {data.mismatchDayCount > 0 && (
            <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {data.mismatchDayCount} day mismatch(es)
            </span>
          )}
          {data.editDayCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              {data.editDayCount} day(s) with edits
            </span>
          )}
          {data.summaryDiffs.length > 0 && (
            <span className="rounded-full bg-orange-100 px-2.5 py-1 font-medium text-orange-800 dark:bg-orange-950/50 dark:text-orange-300">
              {data.summaryDiffs.length} summary column diff(s)
            </span>
          )}
        </div>
      )}

      <div className="mb-2 flex justify-end gap-1 px-1">
        <button type="button" onClick={() => scrollTable('left')} className="rounded border px-2 py-0.5 text-xs">
          ←
        </button>
        <button type="button" onClick={() => scrollTable('right')} className="rounded border px-2 py-0.5 text-xs">
          →
        </button>
      </div>

      <div ref={scrollRef} className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-max border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800">
              <th className="sticky left-0 z-20 min-w-[140px] border-b border-r border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold dark:border-slate-700 dark:bg-slate-800">
                Source
              </th>
              {visibleDays.map((d) => (
                <th
                  key={d.date}
                  className={`min-w-[52px] border-b border-r border-slate-200 px-1 py-2 text-center font-medium dark:border-slate-700 ${
                    d.mismatch ? 'bg-red-50 dark:bg-red-950/30' : d.hasEdits ? 'bg-amber-50 dark:bg-amber-950/20' : ''
                  }`}
                  title={d.date}
                >
                  {formatDayLabel(d.date)}
                </th>
              ))}
              {summaryColumns.map((col) => (
                <th
                  key={col.key}
                  className={`min-w-[56px] border-b border-r border-slate-200 px-2 py-2 text-center font-semibold dark:border-slate-700 ${
                    diffFields.has(col.key) ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-indigo-50 dark:bg-indigo-950/20'
                  }`}
                  title={col.label}
                >
                  {col.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Attendance row */}
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-900 dark:border-slate-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                {data.rows.attendance.label}
              </td>
              {visibleDays.map((d) => (
                <DayCell
                  key={`att-${d.date}`}
                  cell={d.attendanceCell}
                  mismatch={d.mismatch}
                  hasEdits={d.attendanceEdits.length > 0}
                  isConflict={d.isConflict}
                  onShowEdits={() =>
                    setEditPanel({ date: d.date, edits: [...d.attendanceEdits, ...d.payRegisterEdits] })
                  }
                  variant="attendance"
                />
              ))}
              {summaryColumns.map((col) => (
                <SummaryCell
                  key={`att-sum-${col.key}`}
                  value={data.rows.attendance.summary[col.key]}
                  diff={diffFields.has(col.key)}
                />
              ))}
            </tr>

            {/* Pay register row */}
            <tr>
              <td className="sticky left-0 z-10 border-r border-slate-200 bg-sky-50 px-3 py-2 font-semibold text-sky-900 dark:border-slate-700 dark:bg-sky-950/30 dark:text-sky-200">
                {data.rows.payRegister.label}
                {!data.hasPayRegister && (
                  <span className="mt-0.5 block text-[10px] font-normal text-red-600">No register row</span>
                )}
              </td>
              {visibleDays.map((d) => (
                <DayCell
                  key={`pr-${d.date}`}
                  cell={d.payRegisterCell}
                  mismatch={d.mismatch}
                  hasEdits={d.payRegisterEdits.length > 0}
                  onShowEdits={() =>
                    setEditPanel({ date: d.date, edits: [...d.attendanceEdits, ...d.payRegisterEdits] })
                  }
                  variant="payregister"
                />
              ))}
              {summaryColumns.map((col) => (
                <SummaryCell
                  key={`pr-sum-${col.key}`}
                  value={data.rows.payRegister.summary[col.key]}
                  diff={diffFields.has(col.key)}
                />
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {data.summaryDiffs.length > 0 && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50/80 p-3 dark:border-orange-900 dark:bg-orange-950/20">
          <p className="mb-2 text-xs font-semibold text-orange-900 dark:text-orange-200">Summary differences</p>
          <div className="flex flex-wrap gap-2">
            {data.summaryDiffs.map((d) => (
              <span key={d.field} className="rounded-md bg-white px-2 py-1 text-[11px] shadow-sm dark:bg-slate-900">
                <span className="font-medium">{d.field}</span>: Att {d.attendance} → PR {d.payRegister} (Δ{d.delta})
              </span>
            ))}
          </div>
        </div>
      )}

      {(data.rows.payRegister.edits.length > 0 || data.rows.attendance.edits.length > 0) && (
        <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
            All manual edits this month (
            {(data.rows.payRegister.edits.length || 0) + (data.rows.attendance.edits as unknown[]).length})
          </summary>
          <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
            {data.rows.payRegister.edits.map((e, i) => (
              <EditLine key={`pr-edit-${i}`} edit={e} date={e.date} />
            ))}
            {(data.rows.attendance.edits as { date: string; edits: EditEntry[] }[]).flatMap((block) =>
              (block.edits || []).map((e, i) => <EditLine key={`att-${block.date}-${i}`} edit={e} date={block.date} />)
            )}
          </div>
        </details>
      )}

      {editPanel && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Edits on {editPanel.date}</p>
            <button type="button" onClick={() => setEditPanel(null)} className="text-xs underline">
              Close
            </button>
          </div>
          {editPanel.edits.length === 0 ? (
            <p className="text-xs text-slate-600">No edit history for this date.</p>
          ) : (
            <ul className="space-y-2">
              {editPanel.edits.map((e, i) => (
                <li key={i} className="text-xs">
                  <EditLine edit={e} date={editPanel.date} inline />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function DayCell({
  cell,
  mismatch,
  hasEdits,
  isConflict,
  onShowEdits,
  variant,
}: {
  cell: string;
  mismatch: boolean;
  hasEdits: boolean;
  isConflict?: boolean;
  onShowEdits: () => void;
  variant: 'attendance' | 'payregister';
}) {
  const bg =
    variant === 'attendance'
      ? 'bg-emerald-50/30 dark:bg-emerald-950/10'
      : 'bg-sky-50/30 dark:bg-sky-950/10';

  return (
    <td
      className={`relative border-r border-slate-200 px-1 py-1.5 text-center align-middle dark:border-slate-700 ${bg} ${
        mismatch ? 'ring-2 ring-inset ring-red-400' : ''
      } ${hasEdits ? 'ring-2 ring-inset ring-amber-400' : ''}`}
    >
      <div className="font-mono text-[11px] font-semibold leading-tight">{cell || '—'}</div>
      {(hasEdits || isConflict) && (
        <button
          type="button"
          onClick={onShowEdits}
          className="mx-auto mt-0.5 flex items-center justify-center gap-0.5 text-[9px] text-amber-700 dark:text-amber-400"
          title="View edits"
        >
          {isConflict && <AlertTriangle className="h-3 w-3 text-red-500" />}
          {hasEdits && <Pencil className="h-3 w-3" />}
        </button>
      )}
    </td>
  );
}

function SummaryCell({ value, diff }: { value?: number; diff?: boolean }) {
  const n = Number(value);
  const text = Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : '—';
  return (
    <td
      className={`border-r border-slate-200 px-2 py-2 text-center font-semibold dark:border-slate-700 ${
        diff ? 'bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200' : ''
      }`}
    >
      {text}
    </td>
  );
}

function EditLine({ edit, date, inline }: { edit: EditEntry & { date?: string }; date?: string; inline?: boolean }) {
  const d = date || edit.date || '';
  const source = edit.source === 'pay_register' ? 'Pay register' : 'Attendance';
  return (
    <div className={inline ? '' : 'rounded border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800'}>
      <span className="font-medium text-slate-800 dark:text-slate-200">
        {d} · {source} · {edit.label || edit.field || edit.type}
      </span>
      {(edit.oldValue !== undefined || edit.newValue !== undefined) && (
        <span className="ml-1 text-slate-600 dark:text-slate-400">
          {formatEditValue(edit.oldValue)} → {formatEditValue(edit.newValue)}
        </span>
      )}
      {edit.details && <span className="ml-1 text-slate-500">— {edit.details}</span>}
      {edit.remarks && <span className="ml-1 text-slate-500">— {edit.remarks}</span>}
      {(edit.by || edit.at) && (
        <span className="block text-[10px] text-slate-400">
          {edit.by}
          {edit.role ? ` (${edit.role})` : ''}
          {edit.at ? ` · ${formatEditTime(edit.at)}` : ''}
        </span>
      )}
    </div>
  );
}

export default AttendanceAuditCompareGrid;
