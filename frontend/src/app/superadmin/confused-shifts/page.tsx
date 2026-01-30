'use client';

import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import Spinner from '@/components/Spinner';

interface ConfusedShift {
  _id: string;
  employeeNumber: string;
  date: string;
  inTime: string;
  outTime: string | null;
  possibleShifts: Array<{
    shiftId: { _id: string; name: string; startTime: string; endTime: string; duration: number; gracePeriod: number };
    shiftName: string;
    startTime: string;
    endTime: string;
    matchReason: string;
  }>;
  allAvailableShifts?: Array<{
    _id: string;
    name: string;
    startTime: string;
    endTime: string;
    duration: number;
    gracePeriod?: number;
  }>;
  status: 'pending' | 'resolved' | 'dismissed';
  assignedShiftId?: { _id: string; name: string; startTime: string; endTime: string; duration: number };
  reviewedBy?: { _id: string; name: string; email: string };
  reviewedAt?: string;
  reviewComments?: string;
  employee?: {
    emp_no: string;
    employee_name: string;
    department?: { _id: string; name: string };
    designation?: { _id: string; name: string };
  };
}

interface Shift {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  duration: number;
}

export default function ConfusedShiftsPage() {
  const [confusedShifts, setConfusedShifts] = useState<ConfusedShift[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ConfusedShift | null>(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [reviewComments, setReviewComments] = useState('');
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filters, setFilters] = useState({
    status: 'pending',
    startDate: '',
    endDate: '',
  });
  const [stats, setStats] = useState({ pending: 0, resolved: 0, dismissed: 0, total: 0 });

  useEffect(() => {
    loadShifts();
    loadStats();
    loadConfusedShifts();
  }, []); // Load shifts and stats only once on mount

  useEffect(() => {
    loadConfusedShifts();
  }, [filters]); // Reload confused shifts when filters change

  const loadConfusedShifts = async () => {
    try {
      setLoading(true);
      const response = await api.getConfusedShifts({
        status: filters.status,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        page: 1,
        limit: 100,
      });
      if (response.success) {
        setConfusedShifts(response.data || []);
      }
    } catch (err) {
      console.error('Error loading confused shifts:', err);
      setError('Failed to load confused shifts');
    } finally {
      setLoading(false);
    }
  };

  const loadShifts = async () => {
    try {
      const response = await api.getShifts(true);
      if (response.success) {
        setShifts(response.data || []);
      }
    } catch (err) {
      console.error('Error loading shifts:', err);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.getConfusedShiftStats();
      console.log('Stats API Response:', response); // Debug log
      if (response.success && response.data) {
        const newStats = {
          pending: response.data.pending || 0,
          resolved: response.data.resolved || 0,
          dismissed: response.data.dismissed || 0,
          total: response.data.total || (response.data.pending + response.data.resolved + response.data.dismissed) || 0,
        };
        console.log('Setting stats to:', newStats); // Debug log
        setStats(newStats);
      } else {
        console.error('Stats response error:', response);
        // Set default stats if response is invalid
        setStats({ pending: 0, resolved: 0, dismissed: 0, total: 0 });
      }
    } catch (err) {
      console.error('Error loading stats:', err);
      setError('Failed to load statistics');
      // Set default stats on error
      setStats({ pending: 0, resolved: 0, dismissed: 0, total: 0 });
    }
  };

  const handleResolve = async () => {
    if (!selectedRecord || !selectedShiftId) {
      setError('Please select a shift to assign');
      return;
    }

    try {
      setResolving(true);
      setError('');
      setSuccess('');
      const response = await api.resolveConfusedShift(selectedRecord._id, selectedShiftId, reviewComments);
      if (response.success) {
        setSuccess('Shift assigned successfully');
        setShowResolveDialog(false);
        setSelectedRecord(null);
        setSelectedShiftId('');
        setReviewComments('');
        loadConfusedShifts();
        loadStats();
      } else {
        setError(response.message || 'Failed to assign shift');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setResolving(false);
    }
  };

  const handleDismiss = async (record: ConfusedShift) => {
    const result = await Swal.fire({
      title: 'Dismiss Record',
      text: 'Are you sure you want to dismiss this record?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, dismiss it!'
    });

    if (!result.isConfirmed) return;

    try {
      const response = await api.dismissConfusedShift(record._id);
      if (response.success) {
        setSuccess('Record dismissed successfully');
        loadConfusedShifts();
        loadStats();
      } else {
        setError(response.message || 'Failed to dismiss record');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleAutoAssignAll = async () => {
    const pendingCount = confusedShifts.filter(cs => cs.status === 'pending').length;
    if (pendingCount === 0) {
      setError('No pending confused shifts to assign');
      return;
    }

    const result = await Swal.fire({
      title: 'Auto Assign All',
      text: `This will auto-assign the nearest shift to all ${pendingCount} pending confused shifts based on their in-time. Continue?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#aaa',
      confirmButtonText: 'Yes, proceed'
    });

    if (!result.isConfirmed) return;

    try {
      setResolving(true);
      setError('');
      setSuccess('');
      const response = await api.autoAssignAllConfusedShifts();
      if (response.success) {
        setSuccess(response.message || `Successfully auto-assigned ${response.data?.assigned || 0} shifts`);
        loadConfusedShifts();
        loadStats();
      } else {
        setError(response.message || 'Failed to auto-assign shifts');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setResolving(false);
    }
  };

  const openResolveDialog = (record: ConfusedShift) => {
    setSelectedRecord(record);
    setSelectedShiftId('');
    setReviewComments('');
    setShowResolveDialog(true);
    setError('');
    setSuccess('');
  };

  return (
    <div className="relative min-h-screen">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-green-50/40 via-green-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200/80 bg-white/95 px-6 py-5 shadow-[0_8px_26px_rgba(16,185,129,0.08)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-3xl">
              Confused Shifts Review
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Review and manually assign shifts for ambiguous attendance records
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAutoAssignAll}
              disabled={resolving || confusedShifts.filter(cs => cs.status === 'pending').length === 0}
              className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resolving ? (
                <>
                  <div className="mr-2 inline h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Auto Assigning...
                </>
              ) : (
                <>
                  <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Auto Assign All
                </>
              )}
            </button>
            <button
              onClick={() => {
                loadStats();
                loadConfusedShifts();
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50/50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Pending Review</p>
            <p className="mt-1 text-2xl font-bold text-yellow-900 dark:text-yellow-300">
              {typeof stats.pending === 'number' ? stats.pending : 0}
            </p>
          </div>
          <div className="rounded-2xl border border-green-200 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <p className="text-xs font-medium text-green-700 dark:text-green-400">Resolved</p>
            <p className="mt-1 text-2xl font-bold text-green-900 dark:text-green-300">
              {typeof stats.resolved === 'number' ? stats.resolved : 0}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-400">Dismissed</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {typeof stats.dismissed === 'number' ? stats.dismissed : 0}
            </p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Total</p>
            <p className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-300">
              {typeof stats.total === 'number' ? stats.total : 0}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ status: 'pending', startDate: '', endDate: '' })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${success
            ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
            }`}>
            {success || error}
          </div>
        )}

        {/* Confused Shifts List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/95 py-16 shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
            <Spinner />
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Loading confused shifts...</p>
          </div>
        ) : confusedShifts.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white/95 p-12 text-center shadow-lg dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-green-100 dark:from-green-900/30 dark:to-green-900/30">
              <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">No confused shifts found</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">All attendance records have been processed</p>
          </div>
        ) : (
          <div className="space-y-4">
            {confusedShifts.map((record) => (
              <div
                key={record._id}
                className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg dark:border-slate-800 dark:bg-slate-950/95"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-4 flex items-center gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {record.employee?.employee_name || record.employeeNumber}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {record.employeeNumber} • {record.employee?.department?.name || '-'} • {record.employee?.designation?.name || '-'}
                        </p>
                      </div>
                      <div className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                        {record.status.toUpperCase()}
                      </div>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Date</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {new Date(record.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">In-Time</p>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {new Date(record.inTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {record.outTime && (
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Out-Time</p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {new Date(record.outTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mb-4">
                      <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">All Available Shifts:</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {record.allAvailableShifts && record.allAvailableShifts.length > 0 ? (
                          record.allAvailableShifts.map((shift, idx) => {
                            const isPossible = record.possibleShifts.some(
                              ps => {
                                const psShiftId = typeof ps.shiftId === 'string'
                                  ? ps.shiftId
                                  : (ps.shiftId as any)?._id;
                                return psShiftId?.toString() === shift._id?.toString();
                              }
                            );
                            return (
                              <div
                                key={shift._id || idx}
                                className={`rounded-xl border p-3 ${isPossible
                                  ? 'border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-900/30'
                                  : 'border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/50'
                                  }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                      {shift.name}
                                      {isPossible && (
                                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                          Possible Match
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {shift.startTime} - {shift.endTime} ({shift.duration}h)
                                    </p>
                                  </div>
                                </div>
                                {isPossible && (
                                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                                    {record.possibleShifts.find(ps => {
                                      const psShiftId = typeof ps.shiftId === 'string'
                                        ? ps.shiftId
                                        : (ps.shiftId as any)?._id;
                                      return psShiftId?.toString() === shift._id?.toString();
                                    })?.matchReason}
                                  </p>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-400">No shifts available</p>
                        )}
                      </div>
                    </div>

                    {record.status === 'resolved' && record.assignedShiftId && (
                      <div className="mb-4 rounded-xl border border-green-200 bg-green-50/50 p-3 dark:border-green-800 dark:bg-green-900/20">
                        <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Assigned Shift:</p>
                        <p className="text-sm font-semibold text-green-900 dark:text-green-300">
                          {record.assignedShiftId.name} ({record.assignedShiftId.startTime} - {record.assignedShiftId.endTime})
                        </p>
                        {record.reviewedBy && (
                          <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                            Reviewed by {record.reviewedBy.name} on {new Date(record.reviewedAt || '').toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {record.status === 'pending' && (
                    <div className="ml-4 flex flex-col gap-2">
                      <button
                        onClick={() => openResolveDialog(record)}
                        className="rounded-xl bg-gradient-to-r from-green-500 to-green-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600"
                      >
                        Assign Shift
                      </button>
                      <button
                        onClick={() => handleDismiss(record)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Resolve Dialog */}
        {showResolveDialog && selectedRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowResolveDialog(false)} />
            <div className="relative z-50 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    Assign Shift
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {selectedRecord.employee?.employee_name || selectedRecord.employeeNumber} - {new Date(selectedRecord.date).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => setShowResolveDialog(false)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-red-200 hover:text-red-500 dark:border-slate-700 dark:bg-slate-900"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Attendance Details:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">In-Time:</span>{' '}
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {new Date(selectedRecord.inTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {selectedRecord.outTime && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Out-Time:</span>{' '}
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {new Date(selectedRecord.outTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Select Shift *
                  </label>
                  <select
                    value={selectedShiftId}
                    onChange={(e) => setSelectedShiftId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Select a shift</option>
                    {shifts.map((shift) => (
                      <option key={shift._id} value={shift._id}>
                        {shift.name} ({shift.startTime} - {shift.endTime}) - {shift.duration}h
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Comments (Optional)
                  </label>
                  <textarea
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 resize-none"
                    placeholder="Add any comments about this assignment..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleResolve}
                    disabled={!selectedShiftId || resolving}
                    className="flex-1 rounded-2xl bg-gradient-to-r from-green-500 to-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resolving ? 'Assigning...' : 'Assign Shift'}
                  </button>
                  <button
                    onClick={() => setShowResolveDialog(false)}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

