'use client';

import { useState, useEffect } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { api } from '@/lib/api';

export default function LeavesPage() {
  const { activeWorkspace, hasPermission, getModuleConfig } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [leaves, setLeaves] = useState<any[]>([]);

  const moduleConfig = getModuleConfig('LEAVE');
  const canCreate = hasPermission('LEAVE', 'canCreate');
  const canApprove = hasPermission('LEAVE', 'canApprove');
  const dataScope = moduleConfig?.dataScope || 'own';

  useEffect(() => {
    fetchLeaves();
  }, [activeWorkspace]);

  const fetchLeaves = async () => {
    try {
      setLoading(true);
      // Fetch based on data scope
      const response = await api.getMyLeaves();
      if (response.success) {
        setLeaves(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching leaves:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-gray-500 mt-1">
            {dataScope === 'own' && 'View and manage your leave requests'}
            {dataScope === 'department' && 'Manage leave requests in your department'}
            {dataScope === 'all' && 'Manage all leave requests'}
          </p>
        </div>
        {canCreate && (
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Apply Leave
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">
            {leaves.filter(l => l.status === 'pending').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Approved</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {leaves.filter(l => l.status === 'approved').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Rejected</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {leaves.filter(l => l.status === 'rejected').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{leaves.length}</p>
        </div>
      </div>

      {/* Leave Requests Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {dataScope === 'own' ? 'My Leave Requests' : 'Leave Requests'}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leaves.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500">No leave requests found</p>
            {canCreate && (
              <button className="mt-4 px-4 py-2 text-blue-600 hover:text-blue-700 font-medium">
                Apply for Leave →
              </button>
            )}
          </div>
        ) : (
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
                    From
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Days
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {leaves.map((leave) => (
                  <tr key={leave._id} className="hover:bg-gray-50">
                    {dataScope !== 'own' && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm">
                            {leave.employeeName?.[0] || 'E'}
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">{leave.employeeName}</p>
                            <p className="text-xs text-gray-500">{leave.employeeId}</p>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {leave.leaveType || leave.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(leave.fromDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(leave.toDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {leave.numberOfDays || leave.days || 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusBadge(leave.status)}`}>
                        {leave.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {canApprove && leave.status === 'pending' && (
                        <div className="flex gap-2">
                          <button className="text-green-600 hover:text-green-700 font-medium">
                            Approve
                          </button>
                          <button className="text-red-600 hover:text-red-700 font-medium">
                            Reject
                          </button>
                        </div>
                      )}
                      {!canApprove && (
                        <button className="text-blue-600 hover:text-blue-700 font-medium">
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

