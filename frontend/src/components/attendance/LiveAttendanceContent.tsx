'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Clock,
  CircleCheck,
  Calendar,
  RefreshCw,
  Search,
  Download,
  Layers,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  api,
  LiveAttendanceReportData,
  LiveAttendanceFilterOption,
  LiveAttendanceEmployee,
  Division,
  Department,
} from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import { departmentsForDivisionFilter } from '@/lib/manualDeductionListUi';
import {
  LoansPageShell,
  LoansPageHeader,
  LoansToolbar,
  LoansContentPanel,
  LoansSectionTitle,
  loansTableHeadClass,
  loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanFormLabel,
  loansFormInputClass,
  loansFormInputStyle,
  loansFormSelectClass,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { ledgerActionButtonClass } from '@/lib/ledgerUi';

interface MultiShiftSegment {
  segmentIndex: number;
  shift: string;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  inTime: string | null;
  outTime: string | null;
  hoursWorked: number;
  isActive: boolean;
  isComplete: boolean;
  isLate: boolean;
  lateMinutes: number;
  isEarlyOut: boolean;
  earlyOutMinutes: number;
}

type ExtendedEmployee = LiveAttendanceEmployee & {
  isMultiShift?: boolean;
  shiftCount?: number;
  segments?: MultiShiftSegment[];
};

const ledgerBorder = { borderColor: 'var(--ps-accent-border)' };

function LedgerStat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'neutral' | 'accent' | 'emerald' | 'violet' | 'amber' | 'rose';
}) {
  const toneClass =
    tone === 'accent'
      ? 'bg-[var(--ps-accent-soft)]'
      : tone === 'emerald'
        ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
        : tone === 'violet'
          ? 'bg-violet-50/80 dark:bg-violet-950/30'
          : tone === 'amber'
            ? 'bg-amber-50/80 dark:bg-amber-950/30'
            : tone === 'rose'
              ? 'bg-rose-50/80 dark:bg-rose-950/30'
              : 'bg-white dark:bg-stone-950';

  const labelStyle =
    tone === 'accent'
      ? { color: 'var(--ps-accent-ink)' }
      : tone === 'emerald'
        ? { color: 'rgb(4 120 87)' }
        : tone === 'violet'
          ? { color: 'rgb(109 40 217)' }
          : tone === 'amber'
            ? { color: 'rgb(180 83 9)' }
            : tone === 'rose'
              ? { color: 'rgb(190 18 60)' }
              : { color: 'rgb(120 113 108)' };

  return (
    <div className={`px-4 py-3 sm:px-5 sm:py-4 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={labelStyle}>
        {label}
      </p>
      <p
        className="mt-1 font-mono text-xl font-medium tabular-nums text-stone-900 dark:text-stone-100"
        style={tone === 'accent' ? { color: 'var(--ps-accent)' } : undefined}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">{sub}</p> : null}
    </div>
  );
}

function StatusBadge({
  children,
  tone,
  pulse,
}: {
  children: React.ReactNode;
  tone: 'emerald' | 'violet' | 'amber' | 'sky' | 'rose' | 'stone';
  pulse?: boolean;
}) {
  const classes =
    tone === 'stone'
      ? 'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-stone-300/90 bg-stone-50/80 px-2.5 text-[9px] font-semibold uppercase tracking-wide text-stone-600 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-400'
      : ledgerActionButtonClass(
          tone === 'emerald' ? 'emerald' : tone === 'rose' ? 'rose' : tone === 'amber' ? 'amber' : tone === 'violet' ? 'violet' : 'sky',
        );
  return (
    <span className={`${classes} !h-auto !px-2 !py-0.5 !text-[9px]`}>
      {pulse ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> : null}
      {children}
    </span>
  );
}

export function LiveAttendanceContent() {
  const [reportData, setReportData] = useState<LiveAttendanceReportData | null>(null);
  const [isMultiShiftMode, setIsMultiShiftMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [sortBy, setSortBy] = useState<'latest' | 'oldest'>('latest');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [workingSearch, setWorkingSearch] = useState('');

  const [divisions, setDivisions] = useState<LiveAttendanceFilterOption[]>([]);
  const [shifts, setShifts] = useState<LiveAttendanceFilterOption[]>([]);
  const [fullDivisions, setFullDivisions] = useState<Division[]>([]);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [filterDivisions, setFilterDivisions] = useState<string[]>([]);
  const [filterDepartments, setFilterDepartments] = useState<string[]>([]);
  const [filterShifts, setFilterShifts] = useState<string[]>([]);

  const listDepartmentOptions = useMemo(
    () => departmentsForDivisionFilter(fullDivisions, allDepartments, filterDivisions),
    [fullDivisions, allDepartments, filterDivisions],
  );

  const fetchFilterOptions = async () => {
    try {
      const [filtersRes, divRes, deptRes] = await Promise.all([
        api.getLiveAttendanceFilterOptions(),
        api.getDivisions(true),
        api.getDepartments(true),
      ]);
      if (filtersRes.success && filtersRes.data) {
        setDivisions(filtersRes.data.divisions);
        setShifts(filtersRes.data.shifts);
      }
      if (divRes.success && divRes.data) setFullDivisions(divRes.data);
      if (deptRes.success && deptRes.data) setAllDepartments(deptRes.data);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  useEffect(() => {
    if (!filterDepartments.length) return;
    const allowed = new Set(listDepartmentOptions.map((d) => String(d._id)));
    const next = filterDepartments.filter((id) => allowed.has(id));
    if (next.length !== filterDepartments.length) setFilterDepartments(next);
  }, [listDepartmentOptions, filterDepartments]);

  const fetchReportData = useCallback(async () => {
    try {
      const response = await api.getLiveAttendanceReport({
        date: selectedDate,
        divisionIds: filterDivisions.length ? [...filterDivisions] : undefined,
        departmentIds: filterDepartments.length ? [...filterDepartments] : undefined,
        shiftIds: filterShifts.length ? [...filterShifts] : undefined,
      });
      if (response.success) {
        setReportData(response.data as LiveAttendanceReportData);
        setIsMultiShiftMode(!!(response.data as { isMultiShift?: boolean })?.isMultiShift);
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, filterDivisions, filterDepartments, filterShifts]);

  useEffect(() => {
    void fetchFilterOptions();
    void fetchReportData();
  }, [fetchReportData]);

  useEffect(() => {
    const interval = setInterval(() => void fetchReportData(), 60000);
    return () => clearInterval(interval);
  }, [fetchReportData]);

  const formatTime = (dateTimeString: string | null) => {
    if (!dateTimeString) return '-';
    return new Date(dateTimeString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  };

  const formatHoursWorked = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const sortEmployees = (employees: ExtendedEmployee[]) =>
    [...employees].sort((a, b) => {
      const timeA = new Date(a.inTime).getTime();
      const timeB = new Date(b.inTime).getTime();
      return sortBy === 'latest' ? timeB - timeA : timeA - timeB;
    });

  const getYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const handleExportPDF = () => {
    if (!reportData) return;
    setExportingPdf(true);
    const toastId = toast.loading('Generating Live Attendance PDF...');
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('LIVE ATTENDANCE', 15, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 15, 25);
      doc.text(`Report Date: ${selectedDate}`, 15, 30);
      const namesForIds = (ids: string[], options: { id: string; name: string }[]) =>
        ids.map((id) => options.find((o) => o.id === id)?.name).filter(Boolean).join(', ');
      const filterText = [
        filterDivisions.length
          ? `Division: ${namesForIds(filterDivisions, divisions)}`
          : 'All Divisions',
        filterDepartments.length
          ? `Department: ${namesForIds(
              filterDepartments,
              listDepartmentOptions.map((d) => ({ id: String(d._id), name: d.name ?? 'Department' })),
            )}`
          : 'All Departments',
        filterShifts.length ? `Shift: ${namesForIds(filterShifts, shifts)}` : 'All Shifts',
      ].join(' | ');
      doc.text(filterText, 15, 35);

      let currentY = 50;
      autoTable(doc, {
        startY: currentY,
        head: [['Metric', 'Value', 'Percentage']],
        body: [
          ['Total Active Employees', reportData.summary.totalActiveEmployees.toString(), '100%'],
          ['Currently Working', reportData.summary.currentlyWorking.toString(), `${Math.round((reportData.summary.currentlyWorking / reportData.summary.totalActiveEmployees) * 100)}%`],
          ['Shift Completed', reportData.summary.completedShift.toString(), `${Math.round((reportData.summary.completedShift / reportData.summary.totalActiveEmployees) * 100)}%`],
          ['Total Present', reportData.summary.totalPresent.toString(), `${Math.round((reportData.summary.totalPresent / reportData.summary.totalActiveEmployees) * 100)}%`],
          ['Absent', reportData.summary.absentEmployees.toString(), `${Math.round((reportData.summary.absentEmployees / reportData.summary.totalActiveEmployees) * 100)}%`],
        ],
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 9 },
        margin: { left: 15, right: 15 },
      });
      currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

      if (reportData.summary.shiftBreakdown.length > 0) {
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Shift Utilization Breakdown', 15, currentY);
        currentY += 8;
        autoTable(doc, {
          startY: currentY,
          head: [['Shift Name', 'Working', 'Completed', 'Total', 'Workforce Share']],
          body: reportData.summary.shiftBreakdown.map((s) => [
            s.name,
            s.working.toString(),
            s.completed.toString(),
            `${s.working + s.completed}`,
            `${Math.round(((s.working + s.completed) / reportData.summary.totalActiveEmployees) * 100)}%`,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229] },
          styles: { fontSize: 9 },
          margin: { left: 15, right: 15 },
        });
        currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
      }

      if (reportData.summary.departmentBreakdown?.length) {
        if (currentY > 240) { doc.addPage(); currentY = 20; }
        doc.setFontSize(14);
        doc.text('Department Analytics', 15, currentY);
        currentY += 8;
        autoTable(doc, {
          startY: currentY,
          head: [['Division', 'Department', 'Total Emp', 'Present', 'Working', 'Completed', 'Absent', 'Att. %']],
          body: reportData.summary.departmentBreakdown.map((d) => [
            d.divisionName,
            d.name,
            d.totalEmployees.toString(),
            d.present.toString(),
            d.working.toString(),
            d.completed.toString(),
            d.absent.toString(),
            `${Math.round((d.present / (d.totalEmployees || 1)) * 100)}%`,
          ]),
          theme: 'grid',
          headStyles: { fillColor: [234, 88, 12] },
          styles: { fontSize: 8 },
          margin: { left: 15, right: 15 },
        });
        currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
      }

      if (reportData.currentlyWorking.length > 0) {
        if (currentY > 240) { doc.addPage(); currentY = 20; }
        doc.setFontSize(14);
        doc.text(`Currently Working (${reportData.currentlyWorking.length})`, 15, currentY);
        currentY += 8;
        autoTable(doc, {
          startY: currentY,
          head: [['Employee', 'Shift/Dept', 'Punch In', 'Duration', 'Live Status']],
          body: sortEmployees(reportData.currentlyWorking).map((emp) => [
            `${emp.name}\n(${emp.empNo})`,
            `${emp.shift}\n${emp.department}`,
            formatTime(emp.inTime),
            formatHoursWorked(emp.hoursWorked),
            emp.isLate ? `Late (${emp.lateMinutes}m)` : 'On Time',
          ]),
          theme: 'striped',
          headStyles: { fillColor: [22, 163, 74] },
          styles: { fontSize: 8 },
          margin: { left: 15, right: 15 },
        });
        currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
      }

      if (reportData.completedShift.length > 0) {
        if (currentY > 240) { doc.addPage(); currentY = 20; }
        doc.setFontSize(14);
        doc.text(`Shift Completed (${reportData.completedShift.length})`, 15, currentY);
        currentY += 8;
        autoTable(doc, {
          startY: currentY,
          head: [['Employee', 'Shift/Desig', 'Time Window', 'Duration', 'Metrics']],
          body: reportData.completedShift.map((emp) => [
            `${emp.name}\n(${emp.empNo})`,
            `${emp.shift}\n${emp.designation}`,
            `${formatTime(emp.inTime)} - ${formatTime(emp.outTime)}`,
            formatHoursWorked(emp.hoursWorked),
            ['Completed', emp.isLate ? `Late In (${emp.lateMinutes}m)` : null, emp.isEarlyOut ? `Early Out (${emp.earlyOutMinutes}m)` : null].filter(Boolean).join('\n'),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [147, 51, 234] },
          styles: { fontSize: 8 },
          margin: { left: 15, right: 15 },
        });
      }

      doc.save(`Live_Attendance_${selectedDate}_${Date.now()}.pdf`);
      toast.success('PDF generated successfully!', { id: toastId });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF.', { id: toastId });
    } finally {
      setExportingPdf(false);
    }
  };

  const filteredWorking = reportData
    ? sortEmployees(reportData.currentlyWorking).filter((emp) => {
        const q = workingSearch.trim().toLowerCase();
        if (!q) return true;
        return (
          emp.name.toLowerCase().includes(q) ||
          emp.empNo.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          emp.shift.toLowerCase().includes(q)
        );
      })
    : [];

  const thClass = `${loansTableHeadClass()} border-r px-4 py-3 text-left last:border-r-0`;
  const tdClass = 'border-r px-4 py-3 text-sm text-stone-800 dark:text-stone-200 last:border-r-0';
  const rowClass = 'border-b transition hover:bg-[var(--ps-accent-soft)]/40';

  if (loading && !reportData) {
    return (
      <LoansPageShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--ps-accent)' }} />
        </div>
      </LoansPageShell>
    );
  }

  return (
    <LoansPageShell>
      <LoansPageHeader
        dense
        layout="toolbar"
        badge="Attendance · Live"
        title="Live attendance"
        subtitle={`Live pulse · refreshes every minute${isMultiShiftMode ? ' · multi-shift mode' : ''}`}
        action={
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => void fetchReportData()}
              className={loansDialogOutlineButtonClass()}
              style={loansDialogOutlineButtonStyle()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={exportingPdf || !reportData}
              className={ledgerActionButtonClass('rose')}
            >
              {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {exportingPdf ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        }
      />

      <LoansToolbar>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`h-8 rounded-md border px-3 text-[10px] font-semibold uppercase tracking-wide transition ${
                selectedDate === todayStr
                  ? 'text-white'
                  : 'bg-white text-stone-700 hover:opacity-90 dark:bg-stone-950 dark:text-stone-300'
              }`}
              style={
                selectedDate === todayStr
                  ? { backgroundColor: 'var(--ps-accent)', borderColor: 'var(--ps-accent)' }
                  : ledgerBorder
              }
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(getYesterday())}
              className={`h-8 rounded-md border px-3 text-[10px] font-semibold uppercase tracking-wide transition ${
                selectedDate === getYesterday()
                  ? 'text-white'
                  : 'bg-white text-stone-700 hover:opacity-90 dark:bg-stone-950 dark:text-stone-300'
              }`}
              style={
                selectedDate === getYesterday()
                  ? { backgroundColor: 'var(--ps-accent)', borderColor: 'var(--ps-accent)' }
                  : ledgerBorder
              }
            >
              Yesterday
            </button>
          </div>

          <div className="min-w-[150px]">
            <LoanFormLabel>Date</LoanFormLabel>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className={`h-9 pl-8 ${loansFormInputClass()}`}
                style={loansFormInputStyle()}
              />
            </div>
          </div>

          <MultiSelect
            variant="ledger"
            compact
            options={divisions.map((d) => ({ id: String(d.id), name: d.name }))}
            selectedIds={filterDivisions}
            onChange={(vals) => {
              setFilterDivisions(vals);
              setFilterDepartments([]);
            }}
            placeholder="Division"
            className="w-28 sm:w-32"
          />

          <MultiSelect
            variant="ledger"
            compact
            options={listDepartmentOptions.map((d) => ({
              id: String(d._id),
              name: d.name ?? 'Department',
            }))}
            selectedIds={filterDepartments}
            onChange={setFilterDepartments}
            placeholder="Department"
            className="w-28 sm:w-32"
          />

          <MultiSelect
            variant="ledger"
            compact
            options={shifts.map((s) => ({ id: String(s.id), name: s.name }))}
            selectedIds={filterShifts}
            onChange={setFilterShifts}
            placeholder="Shift"
            className="w-28 sm:w-32"
          />
        </div>
      </LoansToolbar>

      {reportData ? (
        <>
          <section
            className="mb-5 grid grid-cols-2 divide-y border bg-white dark:divide-stone-800 dark:bg-stone-950 lg:grid-cols-5 lg:divide-y-0"
            style={ledgerBorder}
          >
            <LedgerStat label="Total workforce" value={reportData.summary.totalActiveEmployees} tone="accent" />
            <LedgerStat label="Active now" value={reportData.summary.currentlyWorking} tone="emerald" />
            <LedgerStat label="Completed" value={reportData.summary.completedShift} tone="violet" />
            <LedgerStat
              label="Total present"
              value={reportData.summary.totalPresent}
              sub={`${Math.round((reportData.summary.totalPresent / reportData.summary.totalActiveEmployees) * 100)}%`}
              tone="accent"
            />
            <LedgerStat
              label="Absent"
              value={reportData.summary.absentEmployees}
              sub={`${Math.round((reportData.summary.absentEmployees / reportData.summary.totalActiveEmployees) * 100)}%`}
              tone="amber"
            />
          </section>

          {reportData.summary.shiftBreakdown.length > 0 ? (
            <LoansContentPanel>
              <div className="border-b px-5 py-4" style={ledgerBorder}>
                <LoansSectionTitle>Shift utilization</LoansSectionTitle>
              </div>
              <div className="grid grid-cols-1 gap-px bg-[var(--ps-accent-border)] p-px sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {reportData.summary.shiftBreakdown.map((s) => (
                  <div key={s.name} className="bg-white px-4 py-3 dark:bg-stone-950">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{s.name}</p>
                      <span className={ledgerActionButtonClass('sky', 'outline') + ' !h-auto !px-1.5 !py-0.5 !text-[9px]'}>
                        {Math.round(((s.working + s.completed) / reportData.summary.totalActiveEmployees) * 100)}%
                      </span>
                    </div>
                    <p className="mt-2 font-mono text-xs tabular-nums text-stone-600 dark:text-stone-400">
                      Working {s.working} · Completed {s.completed}
                    </p>
                    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full border" style={ledgerBorder}>
                      <div className="h-full bg-emerald-500" style={{ width: `${(s.working / (s.working + s.completed || 1)) * 100}%` }} />
                      <div className="h-full bg-violet-500" style={{ width: `${(s.completed / (s.working + s.completed || 1)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </LoansContentPanel>
          ) : null}

          {reportData.summary.departmentBreakdown ? (
            <div className="mb-5">
              <LoansContentPanel>
                <div className="border-b px-5 py-4" style={ledgerBorder}>
                  <LoansSectionTitle>Department analytics</LoansSectionTitle>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] border-collapse text-sm">
                    <thead>
                      <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                        {['Division', 'Department', 'Total', 'Present', 'Working', 'Completed', 'Absent', 'Attendance %'].map((h) => (
                          <th key={h} className={thClass}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.summary.departmentBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-6 py-12 text-center text-sm text-stone-500">
                            No department data for the selected filters.
                          </td>
                        </tr>
                      ) : (
                        reportData.summary.departmentBreakdown.map((dept) => (
                          <tr key={`${dept.divisionId}_${dept.id}`} className={rowClass} style={ledgerBorder}>
                            <td className={tdClass} style={{ color: 'var(--ps-accent-ink)' }}>{dept.divisionName}</td>
                            <td className={`${tdClass} font-medium`}>{dept.name}</td>
                            <td className={tdClass}>{dept.totalEmployees}</td>
                            <td className={tdClass}>{dept.present}</td>
                            <td className={`${tdClass} text-emerald-700 dark:text-emerald-400`}>{dept.working}</td>
                            <td className={`${tdClass} text-violet-700 dark:text-violet-400`}>{dept.completed}</td>
                            <td className={`${tdClass} text-rose-600 dark:text-rose-400`}>{dept.absent}</td>
                            <td className={tdClass}>
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full border" style={ledgerBorder}>
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.min(100, (dept.present / (dept.totalEmployees || 1)) * 100)}%`,
                                      backgroundColor: 'var(--ps-accent)',
                                    }}
                                  />
                                </div>
                                <span className="font-mono text-xs tabular-nums">
                                  {Math.round((dept.present / (dept.totalEmployees || 1)) * 100)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </LoansContentPanel>
            </div>
          ) : null}

          {reportData.currentlyWorking.length > 0 ? (
            <div className="mb-5">
              <LoansContentPanel>
                <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={ledgerBorder}>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    <LoansSectionTitle>Currently working</LoansSectionTitle>
                    <span className={ledgerActionButtonClass('emerald') + ' !h-auto !px-2 !py-0.5 !text-[9px]'}>
                      {reportData.currentlyWorking.length} active
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                      <input
                        placeholder="Search…"
                        value={workingSearch}
                        onChange={(e) => setWorkingSearch(e.target.value)}
                        className={`h-8 w-44 pl-8 text-xs ${loansFormInputClass()}`}
                        style={loansFormInputStyle()}
                      />
                    </div>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'latest' | 'oldest')}
                      className={`h-8 text-xs ${loansFormSelectClass()}`}
                      style={loansFormInputStyle()}
                    >
                      <option value="latest">Latest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] border-collapse text-sm">
                    <thead>
                      <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                        {['Employee', 'Shift / dept', 'Punched in', 'Progress', 'Hours', 'Status'].map((h) => (
                          <th key={h} className={thClass}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWorking.map((employee) => (
                        <React.Fragment key={String(employee.id)}>
                          <tr className={rowClass} style={ledgerBorder}>
                            <td className={tdClass}>
                              <div className="font-medium text-stone-900 dark:text-stone-100">{employee.name}</div>
                              <div className="font-mono text-[10px] text-stone-500">{employee.empNo}</div>
                            </td>
                            <td className={tdClass}>
                              <div>{employee.shift}</div>
                              <div className="text-[10px] uppercase tracking-wider text-stone-500">{employee.department}</div>
                            </td>
                            <td className={`${tdClass} font-mono text-emerald-700 dark:text-emerald-400`}>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(employee.inTime)}
                              </span>
                            </td>
                            <td className={tdClass}>
                              <div className="h-1.5 w-24 overflow-hidden rounded-full border" style={ledgerBorder}>
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, (employee.hoursWorked / 8) * 100)}%` }}
                                />
                              </div>
                            </td>
                            <td className={`${tdClass} font-mono tabular-nums`}>{formatHoursWorked(employee.hoursWorked)}</td>
                            <td className={tdClass}>
                              <div className="flex flex-wrap gap-1">
                                <StatusBadge tone="emerald" pulse>Working</StatusBadge>
                                {(employee as ExtendedEmployee).isMultiShift ? (
                                  <StatusBadge tone="violet">
                                    <Layers className="h-2.5 w-2.5" />
                                    {(employee as ExtendedEmployee).shiftCount} shifts
                                  </StatusBadge>
                                ) : null}
                                {employee.isLate ? <StatusBadge tone="amber">Late {employee.lateMinutes}m</StatusBadge> : null}
                                {employee.otHours > 0 ? <StatusBadge tone="violet">OT {employee.otHours.toFixed(1)}h</StatusBadge> : null}
                              </div>
                            </td>
                          </tr>
                          {(employee as ExtendedEmployee).isMultiShift &&
                            (employee as ExtendedEmployee).segments?.map((seg, si) => (
                              <tr key={`${employee.id}-seg-${si}`} className="bg-violet-50/40 dark:bg-violet-950/20" style={ledgerBorder}>
                                <td className="pl-8 pr-4 py-2 text-xs" colSpan={2}>
                                  Shift {seg.segmentIndex} · {seg.shift}
                                </td>
                                <td className="px-4 py-2 font-mono text-xs">
                                  {formatTime(seg.inTime)} — {seg.outTime ? formatTime(seg.outTime) : '…'}
                                </td>
                                <td className="px-4 py-2" colSpan={2}>
                                  <span className="font-mono text-xs">{formatHoursWorked(seg.hoursWorked)}</span>
                                </td>
                                <td className="px-4 py-2">
                                  {seg.isActive ? (
                                    <StatusBadge tone="emerald" pulse>Active</StatusBadge>
                                  ) : (
                                    <StatusBadge tone="stone">Done</StatusBadge>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </LoansContentPanel>
            </div>
          ) : null}

          {reportData.completedShift.length > 0 ? (
            <div className="mb-5">
              <LoansContentPanel>
                <div className="flex items-center gap-2 border-b px-5 py-4" style={ledgerBorder}>
                  <CircleCheck className="h-4 w-4 text-violet-600" />
                  <LoansSectionTitle>Shift completed</LoansSectionTitle>
                  <span className={ledgerActionButtonClass('violet') + ' !h-auto !px-2 !py-0.5 !text-[9px]'}>
                    {reportData.completedShift.length} finished
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] border-collapse text-sm">
                    <thead>
                      <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                        {['Employee', 'Shift / role', 'Time window', 'Duration', 'Metrics'].map((h) => (
                          <th key={h} className={thClass}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.completedShift.map((employee) => (
                        <React.Fragment key={String(employee.id)}>
                          <tr className={rowClass} style={ledgerBorder}>
                            <td className={tdClass}>
                              <div className="font-medium">{employee.name}</div>
                              <div className="font-mono text-[10px] text-stone-500">{employee.empNo}</div>
                            </td>
                            <td className={tdClass}>
                              <div>{employee.shift}</div>
                              <div className="text-[10px] text-stone-500">{employee.designation}</div>
                            </td>
                            <td className={`${tdClass} font-mono text-xs`}>
                              <div>{formatTime(employee.inTime)}</div>
                              <div>{formatTime(employee.outTime)}</div>
                            </td>
                            <td className={`${tdClass} font-mono tabular-nums`}>{formatHoursWorked(employee.hoursWorked)}</td>
                            <td className={tdClass}>
                              <div className="flex flex-wrap gap-1">
                                <StatusBadge tone="sky">Done</StatusBadge>
                                {(employee as ExtendedEmployee).isMultiShift ? (
                                  <StatusBadge tone="violet">
                                    <Layers className="h-2.5 w-2.5" />
                                    {(employee as ExtendedEmployee).shiftCount} shifts
                                  </StatusBadge>
                                ) : null}
                                {employee.isLate ? <StatusBadge tone="amber">Late {employee.lateMinutes}m</StatusBadge> : null}
                                {employee.isEarlyOut ? (
                                  <StatusBadge tone="amber">Early {employee.earlyOutMinutes}m</StatusBadge>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {(employee as ExtendedEmployee).isMultiShift &&
                            (employee as ExtendedEmployee).segments?.map((seg, si) => (
                              <tr key={`${employee.id}-cseg-${si}`} className="bg-violet-50/40 dark:bg-violet-950/20" style={ledgerBorder}>
                                <td className="pl-8 pr-4 py-2 text-xs" colSpan={2}>
                                  Shift {seg.segmentIndex} · {seg.shift}
                                </td>
                                <td className="px-4 py-2 font-mono text-xs">
                                  {formatTime(seg.inTime)} — {seg.outTime ? formatTime(seg.outTime) : '…'}
                                </td>
                                <td className="px-4 py-2 font-mono text-xs" colSpan={2}>
                                  {formatHoursWorked(seg.hoursWorked)}
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </LoansContentPanel>
            </div>
          ) : null}

          {reportData.currentlyWorking.length === 0 && reportData.completedShift.length === 0 ? (
            <LoansContentPanel>
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <Activity className="mb-4 h-10 w-10 opacity-30" style={{ color: 'var(--ps-accent)' }} />
                <LoansSectionTitle>No attendance pulse</LoansSectionTitle>
                <p className="mt-2 text-sm text-stone-500">No records for the selected date and filters.</p>
              </div>
            </LoansContentPanel>
          ) : null}
        </>
      ) : null}
    </LoansPageShell>
  );
}
