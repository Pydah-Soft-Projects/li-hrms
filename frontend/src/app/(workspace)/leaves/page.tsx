'use client';

import { useState, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';

// Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

interface LeaveApplication {
  _id: string;
  employeeId: { _id: string; first_name: string; last_name: string; emp_no: string };
  leaveType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  purpose: string;
  contactNumber: string;
  status: string;
  department?: { name: string };
  designation?: { name: string };
  appliedAt: string;
  appliedBy?: { _id: string; name: string; email: string };
  workflow?: {
    nextApprover: string;
    history: any[];
  };
}

interface ODApplication {
  _id: string;
  employeeId: { first_name: string; last_name: string; emp_no: string };
  odType: string;
  fromDate: string;
  toDate: string;
  numberOfDays: number;
  purpose: string;
  placeVisited: string;
  contactNumber: string;
  status: string;
  department?: { name: string };
  designation?: { name: string };
  appliedAt: string;
  assignedBy?: { name: string };
  workflow?: {
    nextApprover: string;
    history: any[];
  };
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-700';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700';
    case 'hod_approved':
      return 'bg-blue-100 text-blue-700';
    case 'rejected':
    case 'hod_rejected':
    case 'hr_rejected':
      return 'bg-red-100 text-red-700';
    case 'cancelled':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function LeavesPage() {
  const { activeWorkspace, hasPermission, getModuleConfig } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'leaves' | 'od' | 'pending'>('leaves');
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [ods, setODs] = useState<ODApplication[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveApplication[]>([]);
  const [pendingODs, setPendingODs] = useState<ODApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const leaveModuleConfig = getModuleConfig('LEAVE');
  const odModuleConfig = getModuleConfig('OD');
  const canCreateLeave = hasPermission('LEAVE', 'canCreate');
  const canCreateOD = hasPermission('OD', 'canCreate');
  const canApprove = hasPermission('LEAVE', 'canApprove') || hasPermission('OD', 'canApprove');
  const dataScope = leaveModuleConfig?.dataScope || odModuleConfig?.dataScope || 'own';

  useEffect(() => {
    loadData();
  }, [activeWorkspace]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      // Load based on data scope
      if (dataScope === 'own') {
        // Load user's own leaves/ODs
        const [leavesRes, odsRes] = await Promise.all([
          api.getMyLeaves(),
          api.getMyODs().catch(() => ({ success: false, data: [] })),
        ]);

        if (leavesRes.success) setLeaves(leavesRes.data || []);
        if (odsRes.success) setODs(odsRes.data || []);
      } else {
        // Load all leaves/ODs (for HR/HOD)
        const [leavesRes, odsRes, pendingLeavesRes, pendingODsRes] = await Promise.all([
          api.getLeaves({ limit: 50 }).catch(() => ({ success: false, data: [] })),
          api.getODs({ limit: 50 }).catch(() => ({ success: false, data: [] })),
          api.getPendingLeaveApprovals().catch(() => ({ success: false, data: [] })),
          api.getPendingODApprovals().catch(() => ({ success: false, data: [] })),
        ]);

        if (leavesRes.success) setLeaves(leavesRes.data || []);
        if (odsRes.success) setODs(odsRes.data || []);
        if (pendingLeavesRes.success) setPendingLeaves(pendingLeavesRes.data || []);
        if (pendingODsRes.success) setPendingODs(pendingODsRes.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, type: 'leave' | 'od', action: 'approve' | 'reject', comments: string = '') => {
    if (!canApprove) {
      setError('You do not have permission to perform this action');
      return;
    }

    try {
      let response;
      if (type === 'leave') {
        response = await api.processLeaveAction(id, action, comments);
      } else {
        response = await api.processODAction(id, action, comments);
      }

      if (response.success) {
        setSuccess(`${type === 'leave' ? 'Leave' : 'OD'} ${action}ed successfully`);
        loadData();
      } else {
        setError(response.error || 'Action failed');
      }
    } catch (err: any) {
      setError(err.message || 'Action failed');
    }
  };

  const totalPending = pendingLeaves.length + pendingODs.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave & OD Management</h1>
          <p className="text-gray-500 mt-1">
            {dataScope === 'own' && 'View and manage your leave and OD requests'}
            {dataScope === 'department' && 'Manage leave and OD requests in your department'}
            {dataScope === 'all' && 'Manage all leave and OD requests'}
          </p>
        </div>
        {(canCreateLeave || canCreateOD) && (
          <div className="flex gap-2">
            {canCreateLeave && (
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                <PlusIcon />
                Apply Leave
              </button>
            )}
            {canCreateOD && (
              <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2">
                <PlusIcon />
                Apply OD
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-700 hover:text-red-900">×</button>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="text-green-700 hover:text-green-900">×</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <CalendarIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{leaves.length}</div>
              <div className="text-sm text-gray-500">Total Leaves</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
              <BriefcaseIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{ods.length}</div>
              <div className="text-sm text-gray-500">Total ODs</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-yellow-100 flex items-center justify-center text-yellow-600">
              <ClockIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{totalPending}</div>
              <div className="text-sm text-gray-500">Pending Approvals</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
              <CheckIcon />
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {leaves.filter(l => l.status === 'approved').length + ods.filter(o => o.status === 'approved').length}
              </div>
              <div className="text-sm text-gray-500">Approved</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'leaves'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <CalendarIcon />
              Leaves ({leaves.length})
            </span>
          </button>
          <button
            onClick={() => setActiveTab('od')}
            className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
              activeTab === 'od'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <BriefcaseIcon />
              On Duty ({ods.length})
            </span>
          </button>
          {canApprove && (
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2.5 font-medium text-sm transition-all border-b-2 -mb-px ${
                activeTab === 'pending'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <ClockIcon />
                Pending Approvals ({totalPending})
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {activeTab === 'leaves' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {dataScope !== 'own' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Days
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applied Date
                  </th>
                  {canApprove && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {leaves.map((leave) => (
                  <tr key={leave._id} className="hover:bg-gray-50">
                    {dataScope !== 'own' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm">
                            {leave.employeeId?.first_name?.[0] || 'E'}
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">
                              {leave.employeeId?.first_name} {leave.employeeId?.last_name}
                            </p>
                            <p className="text-xs text-gray-500">{leave.employeeId?.emp_no}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                      {leave.leaveType?.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(leave.fromDate)} - {formatDate(leave.toDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {leave.numberOfDays}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(leave.status)}`}>
                        {leave.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(leave.appliedAt)}
                    </td>
                    {canApprove && leave.status === 'pending' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'approve')}
                            className="text-green-600 hover:text-green-700 font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'reject')}
                            className="text-red-600 hover:text-red-700 font-medium"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                    {canApprove && leave.status !== 'pending' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">—</td>
                    )}
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={dataScope !== 'own' ? (canApprove ? 7 : 6) : (canApprove ? 6 : 5)} className="px-6 py-8 text-center text-gray-500">
                      No leave applications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'od' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {dataScope !== 'own' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Employee
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Place
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applied Date
                  </th>
                  {canApprove && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ods.map((od) => (
                  <tr key={od._id} className="hover:bg-gray-50">
                    {dataScope !== 'own' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-medium text-sm">
                            {od.employeeId?.first_name?.[0] || 'E'}
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">
                              {od.employeeId?.first_name} {od.employeeId?.last_name}
                            </p>
                            <p className="text-xs text-gray-500">{od.employeeId?.emp_no}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                      {od.odType?.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 max-w-[200px] truncate">
                      {od.placeVisited}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(od.fromDate)} - {formatDate(od.toDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(od.status)}`}>
                        {od.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(od.appliedAt)}
                    </td>
                    {canApprove && od.status === 'pending' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(od._id, 'od', 'approve')}
                            className="text-green-600 hover:text-green-700 font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(od._id, 'od', 'reject')}
                            className="text-red-600 hover:text-red-700 font-medium"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                    {canApprove && od.status !== 'pending' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">—</td>
                    )}
                  </tr>
                ))}
                {ods.length === 0 && (
                  <tr>
                    <td colSpan={dataScope !== 'own' ? (canApprove ? 7 : 6) : (canApprove ? 6 : 5)} className="px-6 py-8 text-center text-gray-500">
                      No OD applications found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'pending' && canApprove && (
          <div className="p-6 space-y-4">
            {/* Pending Leaves */}
            {pendingLeaves.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <CalendarIcon />
                  Pending Leaves ({pendingLeaves.length})
                </h3>
                <div className="space-y-3">
                  {pendingLeaves.map((leave) => (
                    <div key={leave._id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-gray-900">
                              {leave.employeeId?.first_name} {leave.employeeId?.last_name}
                            </span>
                            <span className="text-xs text-gray-500">({leave.employeeId?.emp_no})</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(leave.status)}`}>
                              {leave.status?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <div><strong>Type:</strong> {leave.leaveType} | <strong>Days:</strong> {leave.numberOfDays}</div>
                            <div><strong>From:</strong> {formatDate(leave.fromDate)} <strong>To:</strong> {formatDate(leave.toDate)}</div>
                            <div><strong>Reason:</strong> {leave.purpose}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'approve')}
                            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 flex items-center gap-1"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(leave._id, 'leave', 'reject')}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 flex items-center gap-1"
                          >
                            <XIcon /> Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending ODs */}
            {pendingODs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <BriefcaseIcon />
                  Pending ODs ({pendingODs.length})
                </h3>
                <div className="space-y-3">
                  {pendingODs.map((od) => (
                    <div key={od._id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-gray-900">
                              {od.employeeId?.first_name} {od.employeeId?.last_name}
                            </span>
                            <span className="text-xs text-gray-500">({od.employeeId?.emp_no})</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(od.status)}`}>
                              {od.status?.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <div><strong>Type:</strong> {od.odType} | <strong>Days:</strong> {od.numberOfDays}</div>
                            <div><strong>Place:</strong> {od.placeVisited}</div>
                            <div><strong>From:</strong> {formatDate(od.fromDate)} <strong>To:</strong> {formatDate(od.toDate)}</div>
                            <div><strong>Purpose:</strong> {od.purpose}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(od._id, 'od', 'approve')}
                            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 flex items-center gap-1"
                          >
                            <CheckIcon /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(od._id, 'od', 'reject')}
                            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 flex items-center gap-1"
                          >
                            <XIcon /> Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {totalPending === 0 && (
              <div className="text-center py-12 text-gray-500">
                No pending approvals
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
