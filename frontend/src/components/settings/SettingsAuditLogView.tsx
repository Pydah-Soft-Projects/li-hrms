'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api, SettingsAudit } from '@/lib/api';
import {
  Search,
  RefreshCw,
  Clock,
  Eye,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
  X,
} from 'lucide-react';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
} from '@/components/settings/SettingsPageShell';
import { settingsLedgerBorder } from '@/lib/settingsUi';
import { loansTableHeadClass, loansTableHeadStyle } from '@/components/loans/LoansPageShell';
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
} from '@/components/loans/LoanDetailDialogShell';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'general', label: 'General' },
  { value: 'company', label: 'Company Profile' },
  { value: 'geofence', label: 'Geofence' },
  { value: 'employee', label: 'Employee' },
  { value: 'leave', label: 'Leaves / OD / CCL' },
  { value: 'leave_policy', label: 'Leave Policy' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'payroll', label: 'Payroll & Statutory' },
  { value: 'loan', label: 'Loans & Advances' },
  { value: 'overtime', label: 'Overtime' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'promotions_transfers', label: 'Promotions & Transfers' },
  { value: 'resignation', label: 'Resignations' },
  { value: 'department', label: 'Department' },
  { value: 'api_keys', label: 'Public API Keys' },
];

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'update', label: 'Update' },
  { value: 'create', label: 'Create' },
  { value: 'delete', label: 'Delete' },
  { value: 'reset', label: 'Reset' },
];

function formatAuditTimestamp(iso: string) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function getActionBadge(action: string) {
  switch (action) {
    case 'create':
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold uppercase text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          Create
        </span>
      );
    case 'update':
      return (
        <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-xs font-semibold uppercase text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
          <Clock className="h-3 w-3" />
          Update
        </span>
      );
    case 'delete':
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold uppercase text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          <XCircle className="h-3 w-3" />
          Delete
        </span>
      );
    case 'reset':
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold uppercase text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <AlertCircle className="h-3 w-3" />
          Reset
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded bg-stone-100 px-2 py-0.5 text-xs font-semibold uppercase text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {action}
        </span>
      );
  }
}

function renderValuePreview(val: any) {
  if (val === null || val === undefined) {
    return <span className="italic text-stone-400">null</span>;
  }
  if (typeof val === 'boolean') {
    return (
      <span className={val ? 'font-mono text-emerald-600 dark:text-emerald-400' : 'font-mono text-rose-600 dark:text-rose-400'}>
        {val ? 'true' : 'false'}
      </span>
    );
  }
  if (typeof val === 'number') {
    return <span className="font-mono text-indigo-600 dark:text-indigo-400">{val}</span>;
  }
  if (typeof val === 'string') {
    const text = val.length > 50 ? `${val.substring(0, 50)}...` : val;
    return <span className="font-mono text-stone-800 dark:text-stone-200">&quot;{text}&quot;</span>;
  }
  return <span className="font-mono text-xs text-stone-500">{Array.isArray(val) ? `Array(${val.length})` : 'Object'}</span>;
}

interface SettingsAuditLogViewProps {
  initialSettingKey?: string;
  initialCategory?: string;
  showHeader?: boolean;
}

export default function SettingsAuditLogView({
  initialSettingKey = '',
  initialCategory = '',
  showHeader = false,
}: SettingsAuditLogViewProps) {
  const [audits, setAudits] = useState<SettingsAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(initialSettingKey);
  const [category, setCategory] = useState(initialCategory);
  const [action, setAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected audit for inspection
  const [inspectedAudit, setInspectedAudit] = useState<SettingsAudit | null>(null);

  const fetchAudits = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getSettingsAudits({
        settingKey: selectedKey || undefined,
        category: category || undefined,
        action: action || undefined,
        search: search.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit,
      });

      if (res.success && res.data) {
        setAudits(res.data);
        setTotal(res.pagination?.total || 0);
        setTotalPages(res.pagination?.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch settings audits:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedKey, category, action, search, startDate, endDate, page, limit]);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  const handleResetFilters = () => {
    setSearch('');
    setSelectedKey('');
    setCategory('');
    setAction('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <SettingsPanel>
      {showHeader && (
        <SettingsPanelHeader
          section="Governance & Security"
          title="Settings Audit Trail"
          subtitle="Track every change to application settings, who made it, and what changed"
        />
      )}

      {/* Filters Toolbar */}
      <SettingsSectionCard className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search box */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search by setting key, user name, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full border border-stone-200 bg-white py-2 pl-9 pr-3 text-xs placeholder-stone-400 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
            />
          </div>

          {/* Category Dropdown */}
          <div className="min-w-[150px]">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="w-full border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Action Dropdown */}
          <div className="min-w-[120px]">
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className="w-full border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold uppercase text-stone-400">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            />
          </div>

          {/* End Date */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold uppercase text-stone-400">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            />
          </div>

          {/* Refresh & Reset Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchAudits}
              disabled={loading}
              title="Refresh"
              className="inline-flex items-center gap-1 border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {(search || selectedKey || category || action || startDate || endDate) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 border border-stone-200 bg-white px-2.5 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        {selectedKey && (
          <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
            <span>Filtered by key:</span>
            <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {selectedKey}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedKey('');
                setPage(1);
              }}
              className="text-stone-400 hover:text-stone-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </SettingsSectionCard>

      {/* Audit Table */}
      <SettingsSectionCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={loansTableHeadClass()} style={loansTableHeadStyle()}>
              <tr>
                <th className="py-2.5 pl-4 pr-3 text-[10px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  Timestamp
                </th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  Setting Key
                </th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  Category
                </th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  Action
                </th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  Changed By
                </th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  Changes
                </th>
                <th className="py-2.5 pl-3 pr-4 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  Inspect
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-900">
              {loading && audits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-stone-400">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-stone-400" />
                    Loading audit trail...
                  </td>
                </tr>
              ) : audits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-stone-400">
                    No setting audit records found.
                  </td>
                </tr>
              ) : (
                audits.map((item) => (
                  <tr
                    key={item._id}
                    className="transition hover:bg-stone-50/80 dark:hover:bg-stone-900/40"
                  >
                    <td className="whitespace-nowrap py-3 pl-4 pr-3 font-mono text-[11px] text-stone-500 dark:text-stone-400">
                      {formatAuditTimestamp(item.timestamp)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs font-semibold text-stone-900 dark:text-stone-100">
                        {item.settingKey}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                        {item.category}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{getActionBadge(item.action)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-stone-900 dark:text-stone-100">
                          {item.performedByName || 'System'}
                        </span>
                        {item.performedByEmail && (
                          <span className="text-[10px] text-stone-400">{item.performedByEmail}</span>
                        )}
                        {item.performedByRole && (
                          <span className="text-[9px] font-semibold uppercase text-stone-400">
                            {item.performedByRole}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[280px] px-3 py-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <div className="truncate max-w-[120px]" title={JSON.stringify(item.previousValue)}>
                          {renderValuePreview(item.previousValue)}
                        </div>
                        <ArrowRight className="h-3 w-3 shrink-0 text-stone-400" />
                        <div className="truncate max-w-[120px]" title={JSON.stringify(item.newValue)}>
                          {renderValuePreview(item.newValue)}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-3 pl-3 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => setInspectedAudit(item)}
                        className="inline-flex items-center gap-1 border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
                      >
                        <Eye className="h-3 w-3" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-xs text-stone-500 dark:text-stone-400"
          style={settingsLedgerBorder}
        >
          <div>
            Showing {audits.length} of {total} changes
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 disabled:opacity-40 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <span className="font-mono text-xs text-stone-700 dark:text-stone-300">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 disabled:opacity-40 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </SettingsSectionCard>

      {/* Inspect Modal Dialog */}
      {inspectedAudit && (
        <LoanDetailDialog open={!!inspectedAudit} onClose={() => setInspectedAudit(null)} maxWidth="max-w-4xl">
          <LoanDetailDialogHeader
            title={`Setting Audit: ${inspectedAudit.settingKey}`}
            badge={inspectedAudit.category}
            onClose={() => setInspectedAudit(null)}
          />
          <LoanDetailDialogBody>
            <div className="space-y-4 text-xs">
              {/* Metadata Summary */}
            <div className="grid grid-cols-1 gap-3 rounded border border-stone-200 bg-stone-50 p-3 sm:grid-cols-2 dark:border-stone-800 dark:bg-stone-900">
              <div>
                <p className="text-[10px] font-semibold uppercase text-stone-400">Action</p>
                <p className="mt-0.5">{getActionBadge(inspectedAudit.action)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-stone-400">Timestamp</p>
                <p className="mt-0.5 font-mono text-xs text-stone-800 dark:text-stone-200">
                  {formatAuditTimestamp(inspectedAudit.timestamp)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-stone-400">Changed By</p>
                <p className="mt-0.5 font-medium text-stone-900 dark:text-stone-100">
                  {inspectedAudit.performedByName || 'System'}
                  {inspectedAudit.performedByRole && (
                    <span className="ml-1 text-[10px] text-stone-500">
                      ({inspectedAudit.performedByRole})
                    </span>
                  )}
                </p>
                {inspectedAudit.performedByEmail && (
                  <p className="text-[11px] text-stone-500">{inspectedAudit.performedByEmail}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-stone-400">Description</p>
                <p className="mt-0.5 text-stone-700 dark:text-stone-300">
                  {inspectedAudit.description || '-'}
                </p>
              </div>
              {inspectedAudit.ipAddress && (
                <div>
                  <p className="text-[10px] font-semibold uppercase text-stone-400">IP Address</p>
                  <p className="mt-0.5 font-mono text-xs text-stone-600 dark:text-stone-400">
                    {inspectedAudit.ipAddress}
                  </p>
                </div>
              )}
            </div>

            {/* Before vs After comparison */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Previous Value */}
              <div className="overflow-hidden rounded border border-rose-200 dark:border-rose-900/60">
                <div className="bg-rose-50 px-3 py-1.5 font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  Previous Value (Before)
                </div>
                <div className="max-h-72 overflow-y-auto bg-white p-3 font-mono text-xs dark:bg-stone-950">
                  <pre className="whitespace-pre-wrap break-all text-stone-800 dark:text-stone-200">
                    {inspectedAudit.previousValue !== null && inspectedAudit.previousValue !== undefined
                      ? JSON.stringify(inspectedAudit.previousValue, null, 2)
                      : 'null'}
                  </pre>
                </div>
              </div>

              {/* New Value */}
              <div className="overflow-hidden rounded border border-emerald-200 dark:border-emerald-900/60">
                <div className="bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  New Value (After)
                </div>
                <div className="max-h-72 overflow-y-auto bg-white p-3 font-mono text-xs dark:bg-stone-950">
                  <pre className="whitespace-pre-wrap break-all text-stone-800 dark:text-stone-200">
                    {inspectedAudit.newValue !== null && inspectedAudit.newValue !== undefined
                      ? JSON.stringify(inspectedAudit.newValue, null, 2)
                      : 'null'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </LoanDetailDialogBody>
        </LoanDetailDialog>
      )}
    </SettingsPanel>
  );
}
