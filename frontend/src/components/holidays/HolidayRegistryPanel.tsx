'use client';

import { useMemo, useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { History, Search, Filter, Printer, Download } from 'lucide-react';
import { toast } from 'react-toastify';
import type { Holiday, HolidayGroup } from '@/lib/api';

function formatHolidayDate(d: string | Date | undefined) {
  if (!d) return '—';
  try {
    const dt = typeof d === 'string' ? parseISO(d) : new Date(d);
    return format(dt, 'dd MMM yyyy');
  } catch {
    return String(d);
  }
}

function scopeLabel(h: Holiday) {
  if (h.scope === 'MAPPING') return 'Employee scope';
  if (h.scope === 'GROUP') {
    const g = h.groupId;
    const name = typeof g === 'object' && g?.name ? g.name : null;
    return name ? `Group: ${name}` : 'Group';
  }
  if (h.scope === 'GLOBAL') return h.applicableTo === 'SPECIFIC_GROUPS' ? 'Global (selected groups)' : 'Global (all)';
  return h.scope || '—';
}

function mappingSummary(h: Holiday) {
  const rows = h.divisionMapping || [];
  if (rows.length === 0) return '—';
  return `${rows.length} division row${rows.length === 1 ? '' : 's'}`;
}

function getHolidayCreator(h: Holiday, userNames: Record<string, string>) {
  if (!h.createdBy) return 'Unknown';
  if (typeof h.createdBy === 'string') {
    const id = h.createdBy as string;
    // Prefer resolved name from cache if available
    if (userNames && userNames[id]) return userNames[id];
    // Fallback to raw id while resolving
    return id || 'Unknown';
  }
  return (h.createdBy as any).name || (h.createdBy as any).employee_name || (h.createdBy as any).email || 'Unknown';
}

function getHolidayDurationDays(h: Holiday) {
  if (!h.date) return '—';
  if (!h.endDate) return '1 day';

  try {
    const start = typeof h.date === 'string' ? parseISO(h.date) : h.date;
    const end = typeof h.endDate === 'string' ? parseISO(h.endDate) : h.endDate;
    const days = differenceInCalendarDays(end, start) + 1;
    return `${days} day${days === 1 ? '' : 's'}`;
  } catch {
    return '—';
  }
}

function createHolidayReportPdf(holidays: Holiday[], userNames: Record<string, string>) {
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerHeight = 26;

  doc.setFillColor(15, 23, 42);
  doc.rect(14, 10, pageWidth - 28, headerHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Holiday Report', 16, 18);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 16, 24);

  const body = holidays.map((h) => [
    h.name || '—',
    formatHolidayDate(h.date),
    h.endDate ? formatHolidayDate(h.endDate) : '—',
    getHolidayDurationDays(h),
    h.type || '—',
    scopeLabel(h),
    getHolidayCreator(h, userNames),
    h.createdAt ? formatHolidayDate(h.createdAt) : '—',
    mappingSummary(h),
    h.isActive === false ? 'Deactivated' : 'Active',
  ]);

  autoTable(doc, {
    startY: 10 + headerHeight + 6,
    head: [[
      'Holiday Name',
      'Start Date',
      'End Date',
      'Duration',
      'Type',
      'Scope',
      'Created By',
      'Created On',
      'Mapping',
      'Status',
    ]],
    body,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 22 },
      2: { cellWidth: 22 },
      3: { cellWidth: 18 },
      4: { cellWidth: 20 },
      5: { cellWidth: 28 },
      6: { cellWidth: 30 },
      7: { cellWidth: 22 },
      8: { cellWidth: 26 },
      9: { cellWidth: 18 },
    },
    didDrawPage: (data) => {
      if (data?.cursor?.y) {
        // nothing else required here; autoTable manages pagination
      }
    },
  });

  return doc;
}

function printPdfDocument(doc: jsPDF) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      URL.revokeObjectURL(url);
    };
  }
}

interface HolidayRegistryPanelProps {
  holidays: Holiday[];
  groups?: HolidayGroup[];
  onOpenActivity: (h: Holiday) => void;
  onOpenEdit?: (h: Holiday) => void;
  canEdit?: (h: Holiday) => boolean;
}

export default function HolidayRegistryPanel({
  holidays,
  onOpenActivity,
  onOpenEdit,
  canEdit,
}: HolidayRegistryPanelProps) {
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const idsToFetch = new Set<string>();
    holidays.forEach((h) => {
      if (h && typeof h.createdBy === 'string') {
        const id = h.createdBy as string;
        if (id && !userNames[id]) idsToFetch.add(id);
      }
    });
    if (idsToFetch.size === 0) return;

    let cancelled = false;
    (async () => {
      const entries: Array<[string, string]> = [];
      await Promise.all(Array.from(idsToFetch).map(async (id) => {
        try {
          const res = await (await import('@/lib/api')).api.getUser(id);
          if (res && res.success && res.data) {
            const name = res.data.name || res.data.employee_name || res.data.email || id;
            entries.push([id, name]);
          } else {
            entries.push([id, id]);
          }
        } catch (e) {
          entries.push([id, id]);
        }
      }));
      if (cancelled) return;
      setUserNames((prev) => {
        const copy = { ...prev };
        entries.forEach(([id, name]) => { copy[id] = name; });
        return copy;
      });
    })();
    return () => { cancelled = true; };
  }, [holidays]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'GLOBAL' | 'GROUP' | 'MAPPING'>('all');
  const [exportingPdf, setExportingPdf] = useState(false);

  const sorted = useMemo(() => {
    return [...holidays].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return db - da;
    });
  }, [holidays]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((h) => {
      if (statusFilter === 'active' && h.isActive === false) return false;
      if (statusFilter === 'inactive' && h.isActive !== false) return false;
      if (scopeFilter !== 'all' && h.scope !== scopeFilter) return false;
      if (!q) return true;
      return (
        (h.name || '').toLowerCase().includes(q) ||
        (h.type || '').toLowerCase().includes(q) ||
        scopeLabel(h).toLowerCase().includes(q) ||
        getHolidayCreator(h, userNames).toLowerCase().includes(q) ||
        (h.createdAt ? formatHolidayDate(h.createdAt).toLowerCase() : '').includes(q)
      );
    });
  }, [sorted, search, statusFilter, scopeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          All holidays (active and deactivated) with scope and audit trail.
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search name, type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm w-full sm:w-48"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Deactivated only</option>
          </select>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as typeof scopeFilter)}
            className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="all">All scopes</option>
            <option value="GLOBAL">Global</option>
            <option value="GROUP">Group</option>
            <option value="MAPPING">Employee scope</option>
          </select>
          <button
            type="button"
            onClick={async () => {
              if (filtered.length === 0) {
                toast.info('No holidays to export.');
                return;
              }
              setExportingPdf(true);
              try {
                const doc = createHolidayReportPdf(filtered, userNames);
                doc.save(`Holiday_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
                toast.success('Holiday PDF exported successfully.');
              } catch (error) {
                console.error(error);
                toast.error('Failed to export holiday PDF.');
              } finally {
                setExportingPdf(false);
              }
            }}
            disabled={exportingPdf || filtered.length === 0}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export PDF</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              if (filtered.length === 0) {
                toast.info('No holidays to print.');
                return;
              }
              setExportingPdf(true);
              try {
                const doc = createHolidayReportPdf(filtered, userNames);
                printPdfDocument(doc);
              } catch (error) {
                console.error(error);
                toast.error('Failed to prepare holiday PDF for printing.');
              } finally {
                setExportingPdf(false);
              }
            }}
            disabled={exportingPdf || filtered.length === 0}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print PDF</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Created By</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Mapping</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                  No holidays match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((h) => {
                const active = h.isActive !== false;
                return (
                  <tr key={h._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{h.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatHolidayDate(h.date)}
                      {h.endDate ? ` → ${formatHolidayDate(h.endDate)}` : ''}
                    </td>
                    <td className="px-4 py-3">{h.type}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          h.scope === 'MAPPING'
                            ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
                            : h.scope === 'GLOBAL'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        }`}
                      >
                        {scopeLabel(h)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{getHolidayCreator(h, userNames)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{h.createdAt ? formatHolidayDate(h.createdAt) : '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{mappingSummary(h)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                        }`}
                      >
                        {active ? 'Active' : 'Deactivated'}
                      </span>
                      {!active && h.deactivatedAt && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatHolidayDate(h.deactivatedAt)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenActivity(h)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <History className="h-3.5 w-3.5" />
                          Activity
                        </button>
                        {onOpenEdit && (!canEdit || canEdit(h)) && (
                          <button
                            type="button"
                            onClick={() => onOpenEdit(h)}
                            className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            Open
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 flex items-center gap-1">
        <Filter className="h-3.5 w-3.5" />
        Showing {filtered.length} of {holidays.length} records
      </p>
    </div>
  );
}
