'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

export type EmployeeSalaryHistoryData = {
  masterGrossSalary?: number | null;
  grossUsedForCurrentPayCycle?: number;
  currentPayrollMonthLabel?: string;
  revisions?: Array<{
    effectiveLabel: string;
    grossSalary: number;
    previousGrossSalary?: number | null;
    requestType?: string;
    recordedAt?: string;
  }>;
  /** Pending promotion/demotion/increment requests (effective month editable on Promotions & transfers). */
  pendingSalaryRequests?: Array<{
    requestId?: string;
    requestType?: string;
    status?: string;
    effectiveLabel?: string;
    effectivePayrollYear?: number;
    effectivePayrollMonth?: number;
    newGrossSalary?: number | null;
    previousGrossSalary?: number | null;
    incrementAmount?: number | null;
    updatedAt?: string;
    createdAt?: string;
  }>;
  relatedHistory?: Array<{
    event?: string;
    timestamp?: string;
    comments?: string;
    details?: Record<string, unknown>;
    performedByName?: string;
    performedByRole?: string;
  }>;
};

function formatHistoryEventLabel(event?: string): string {
  if (!event) return '—';
  return event
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function formatHistoryRow(d: Record<string, unknown> | undefined) {
  if (!d || typeof d !== 'object') {
    return {
      effectiveMonth: '—' as string,
      newGross: null as number | null,
      prevGross: null as number | null,
      requestType: '—' as string,
      step: '—' as string,
    };
  }
  const effY = typeof d.effectivePayrollYear === 'number' ? d.effectivePayrollYear : null;
  const effM = typeof d.effectivePayrollMonth === 'number' ? d.effectivePayrollMonth : null;
  const effectiveMonth =
    effY != null && effM != null ? `${effY}-${String(effM).padStart(2, '0')}` : '—';
  const newGross = typeof d.newGrossSalary === 'number' && Number.isFinite(d.newGrossSalary) ? d.newGrossSalary : null;
  const prevGross =
    typeof d.previousGrossSalary === 'number' && Number.isFinite(d.previousGrossSalary) ? d.previousGrossSalary : null;
  const requestType = typeof d.requestType === 'string' && d.requestType ? d.requestType : '—';
  const stepRole = typeof d.stepRole === 'string' && d.stepRole ? d.stepRole : '';
  const stepOrder = typeof d.stepOrder === 'number' ? d.stepOrder : null;
  const step =
    stepRole || stepOrder != null
      ? [stepOrder != null ? `Step ${stepOrder}` : null, stepRole || null].filter(Boolean).join(' · ')
      : '—';
  return { effectiveMonth, newGross, prevGross, requestType, step };
}

export type SalaryHistoryRelatedItem = NonNullable<EmployeeSalaryHistoryData['relatedHistory']>[number];

export type SalaryHistoryRequestGroup = {
  key: string;
  requestId: string | null;
  events: SalaryHistoryRelatedItem[];
  requestTypeLabel: string;
  effectiveMonth: string;
  newGross: number | null;
  prevGross: number | null;
  status: string;
  lastActivity: string | null;
};

function groupRelatedHistoryByRequest(history: SalaryHistoryRelatedItem[] | undefined): SalaryHistoryRequestGroup[] {
  if (!history?.length) return [];
  const map = new Map<string, SalaryHistoryRelatedItem[]>();

  history.forEach((h, i) => {
    const d = h.details && typeof h.details === 'object' ? (h.details as Record<string, unknown>) : undefined;
    const raw = d?.requestId;
    const hasReq = raw != null && String(raw).trim() !== '' && String(raw) !== 'undefined';
    const key = hasReq ? `req:${String(raw)}` : `orphan:${i}:${h.event || 'event'}:${h.timestamp || ''}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(h);
  });

  const groups: SalaryHistoryRequestGroup[] = [];

  map.forEach((rawEvents, key) => {
    const events = [...rawEvents].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });

    const finalEv = [...events].reverse().find((e) => e.event === 'promotion_transfer_final_approved');
    const withMonth = events.find((e) => {
      const x = e.details as Record<string, unknown> | undefined;
      return x && typeof x.effectivePayrollYear === 'number' && typeof x.effectivePayrollMonth === 'number';
    });
    const dFinal = (finalEv?.details as Record<string, unknown> | undefined) || undefined;
    const dMonth = (withMonth?.details as Record<string, unknown> | undefined) || undefined;
    const row = formatHistoryRow(dFinal || dMonth);

    const firstRt = events
      .map((e) => (e.details as Record<string, unknown> | undefined)?.requestType)
      .find((t) => typeof t === 'string' && t);
    const requestTypeLabel =
      typeof firstRt === 'string' && firstRt
        ? formatHistoryEventLabel(firstRt)
        : key.startsWith('req:')
          ? 'Promotion / transfer request'
          : formatHistoryEventLabel(events[0]?.event);

    let status = 'Recorded';
    if (events.some((e) => e.event === 'promotion_transfer_rejected')) status = 'Rejected';
    else if (events.some((e) => e.event === 'promotion_transfer_final_approved')) status = 'Approved';
    else if (events.some((e) => (e.event || '').startsWith('promotion_transfer'))) status = 'In progress';
    if (events.length === 1 && events[0]?.event === 'salary_approved') status = 'Salary approved';

    const last = events[events.length - 1];
    const lastActivity = last?.timestamp || null;

    groups.push({
      key,
      requestId: key.startsWith('req:') ? key.slice(4) : null,
      events,
      requestTypeLabel,
      effectiveMonth: row.effectiveMonth,
      newGross: row.newGross,
      prevGross: row.prevGross,
      status,
      lastActivity,
    });
  });

  groups.sort((a, b) => {
    const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
    const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
    return tb - ta;
  });

  return groups;
}

type Props = {
  empNo: string;
  className?: string;
};

/**
 * Gross schedule for payroll (current cycle gross, master record, revisions, related audit events).
 * Used from Employees view dialog (workspace + superadmin).
 */
export default function EmployeeSalaryHistoryPanel({ empNo, className = '' }: Props) {
  const [data, setData] = useState<EmployeeSalaryHistoryData | null>(null);
  const [loading, setLoading] = useState(() => Boolean(String(empNo || '').trim()));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timelineDialog, setTimelineDialog] = useState<SalaryHistoryRequestGroup | null>(null);

  const requestGroups = useMemo(
    () => groupRelatedHistoryByRequest(data?.relatedHistory),
    [data?.relatedHistory]
  );

  useEffect(() => {
    const no = String(empNo || '').trim();
    if (!no) {
      setData(null);
      setErrorMessage(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    void api
      .getEmployeeSalaryHistory(no)
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.data) {
          setData(res.data as EmployeeSalaryHistoryData);
          setErrorMessage(null);
        } else {
          setData(null);
          setErrorMessage(res?.message || 'Unable to load salary history');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [empNo]);

  useEffect(() => {
    if (!timelineDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTimelineDialog(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timelineDialog]);

  if (!String(empNo || '').trim()) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No employee number.</p>;
  }

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading salary information…</p>;
  }

  if (errorMessage) {
    return <p className="text-sm text-amber-800 dark:text-amber-200">{errorMessage}</p>;
  }

  if (!data) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No salary history available.</p>;
  }

  return (
    <div className={`space-y-4 text-sm ${className}`}>
      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">Current pay cycle</p>
          <p className="font-mono text-slate-800 mt-0.5 dark:text-slate-100">{data.currentPayrollMonthLabel || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">Gross used for this cycle</p>
          <p className="font-semibold text-slate-900 mt-0.5 dark:text-slate-100">
            ₹{Number(data.grossUsedForCurrentPayCycle ?? 0).toLocaleString('en-IN')}
          </p>
        </div>
        {data.masterGrossSalary != null &&
          Number(data.masterGrossSalary) !== Number(data.grossUsedForCurrentPayCycle ?? 0) && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">
                Master record (until effective)
              </p>
              <p className="text-amber-800 font-medium mt-0.5 dark:text-amber-200">
                ₹{Number(data.masterGrossSalary).toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-md dark:text-slate-400">
                A higher salary is scheduled for a future payroll month; pay for past and current open cycles still uses the amount on the
                left until that month is processed.
              </p>
            </div>
          )}
      </div>

      {(data.pendingSalaryRequests?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2 dark:text-slate-200">
            Pending approval (promotions &amp; transfers)
          </p>
          <p className="text-[11px] text-slate-500 mb-2 dark:text-slate-400">
            Effective payroll month and gross here reflect the open request on the Promotions &amp; transfers page. After final approval,
            they move into the scheduled revisions list below.
          </p>
          <div className="overflow-x-auto rounded-lg border border-amber-200 dark:border-amber-900/50">
            <table className="w-full text-xs text-left">
              <thead className="bg-amber-50 text-amber-900/80 uppercase tracking-wide dark:bg-amber-950/40 dark:text-amber-200/90">
                <tr>
                  <th className="px-3 py-2">Effective (payroll month)</th>
                  <th className="px-3 py-2">New gross</th>
                  <th className="px-3 py-2">Previous gross</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 dark:divide-amber-900/30">
                {(data.pendingSalaryRequests || []).map((r, i) => (
                  <tr key={String(r.requestId || i)} className="bg-white dark:bg-slate-950">
                    <td className="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-100">
                      {r.effectiveLabel ||
                        (r.effectivePayrollYear != null && r.effectivePayrollMonth != null
                          ? `${r.effectivePayrollYear}-${String(r.effectivePayrollMonth).padStart(2, '0')}`
                          : '—')}
                    </td>
                    <td className="px-3 py-2 dark:text-slate-200">
                      {r.newGrossSalary != null && Number.isFinite(Number(r.newGrossSalary))
                        ? `₹${Number(r.newGrossSalary).toLocaleString('en-IN')}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {r.previousGrossSalary != null && Number.isFinite(Number(r.previousGrossSalary))
                        ? `₹${Number(r.previousGrossSalary).toLocaleString('en-IN')}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-600 dark:text-slate-400">{r.requestType || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-500">
                      {r.updatedAt
                        ? new Date(r.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                        : r.createdAt
                          ? new Date(r.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(data.revisions?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2 dark:text-slate-200">Scheduled / past gross changes</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-500 uppercase tracking-wide dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Effective from (payroll month)</th>
                  <th className="px-3 py-2">New gross</th>
                  <th className="px-3 py-2">Previous gross</th>
                  <th className="px-3 py-2">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {(data.revisions || []).map((r, i) => (
                  <tr key={`${r.effectiveLabel}-${i}`} className="bg-white dark:bg-slate-950">
                    <td className="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-100">{r.effectiveLabel}</td>
                    <td className="px-3 py-2 dark:text-slate-200">₹{Number(r.grossSalary).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {r.previousGrossSalary != null ? `₹${Number(r.previousGrossSalary).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-600 dark:text-slate-400">{r.requestType || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {requestGroups.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2 dark:text-slate-200">Recent approvals &amp; updates</p>
          <p className="text-[11px] text-slate-500 mb-2 dark:text-slate-400">
            One row per promotion / transfer request (same idea as the Promotions &amp; transfers list). Use <strong>View</strong> to open the
            full step-by-step timeline.
          </p>
          <div className="overflow-x-auto rounded-lg border border-indigo-100 dark:border-indigo-900/40">
            <table className="w-full text-xs text-left min-w-[520px]">
              <thead className="bg-indigo-50 text-indigo-900/70 uppercase tracking-wide dark:bg-indigo-950/50 dark:text-indigo-200/80">
                <tr>
                  <th className="px-3 py-2">Request</th>
                  <th className="px-3 py-2">Effective month</th>
                  <th className="px-3 py-2">New gross</th>
                  <th className="px-3 py-2">Previous gross</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Timeline</th>
                  <th className="px-3 py-2">Last activity</th>
                  <th className="px-3 py-2 w-[100px]"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {requestGroups.slice(0, 25).map((g) => {
                  const when = g.lastActivity
                    ? new Date(g.lastActivity).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    : '—';
                  const statusClass =
                    g.status === 'Approved' || g.status === 'Salary approved'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : g.status === 'Rejected'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                        : g.status === 'In progress'
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                  return (
                    <tr key={g.key} className="bg-white dark:bg-slate-950 align-middle">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{g.requestTypeLabel}</p>
                        {g.requestId && (
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate max-w-[200px]" title={g.requestId}>
                            ID {g.requestId}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-100">{g.effectiveMonth}</td>
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                        {g.newGross != null ? `₹${g.newGross.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                        {g.prevGross != null ? `₹${g.prevGross.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                          {g.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{g.events.length} event(s)</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">{when}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setTimelineDialog(g)}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200 dark:hover:bg-indigo-900/80"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {timelineDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="salary-history-timeline-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setTimelineDialog(null)}
          />
          <div className="relative z-[71] w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 flex flex-col">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800 shrink-0">
              <h3 id="salary-history-timeline-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                Request timeline
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{timelineDialog.requestTypeLabel}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Effective <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{timelineDialog.effectiveMonth}</span>
                {timelineDialog.newGross != null && (
                  <>
                    {' '}
                    · New gross{' '}
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      ₹{timelineDialog.newGross.toLocaleString('en-IN')}
                    </span>
                  </>
                )}
                {timelineDialog.requestId && (
                  <span className="block mt-1 font-mono text-[10px] text-slate-400 truncate" title={timelineDialog.requestId}>
                    Request ID: {timelineDialog.requestId}
                  </span>
                )}
              </p>
            </div>
            <div className="overflow-y-auto px-5 py-4 flex-1 min-h-0">
              <ol className="relative space-y-0 border-l border-slate-200 pl-4 dark:border-slate-700">
                {timelineDialog.events.map((h, idx) => {
                  const d = h.details && typeof h.details === 'object' ? (h.details as Record<string, unknown>) : undefined;
                  const row = formatHistoryRow(d);
                  const when = h.timestamp
                    ? new Date(h.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    : '—';
                  const by =
                    [h.performedByName, h.performedByRole].filter(Boolean).join(h.performedByName && h.performedByRole ? ' · ' : '') ||
                    '—';
                  const notes = (h.comments && String(h.comments).trim()) || '';
                  return (
                    <li key={`${h.timestamp}-${idx}`} className="relative pb-6 last:pb-0">
                      <span className="absolute -left-[21px] mt-1.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-indigo-400 bg-white dark:bg-slate-950 dark:border-indigo-500" />
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{formatHistoryEventLabel(h.event)}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{when}</p>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <span className="text-slate-500">Effective month</span>
                          <span className="font-mono text-slate-800 dark:text-slate-100">{row.effectiveMonth}</span>
                          <span className="text-slate-500">Step</span>
                          <span className="text-slate-700 dark:text-slate-300">{row.step}</span>
                          <span className="text-slate-500">By</span>
                          <span className="text-slate-700 dark:text-slate-300 break-words">{by}</span>
                        </div>
                        {notes ? (
                          <p className="mt-2 text-[11px] italic text-slate-600 dark:text-slate-400 border-t border-slate-200/80 dark:border-slate-700 pt-2">
                            {notes}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => setTimelineDialog(null)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
