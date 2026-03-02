import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { api } from '@/lib/api';

const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const FilterIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const ArrearsReport = ({ onViewDetails, employees = [] }) => {
  const [arrears, setArrears] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    employee: '',
    searchTerm: ''
  });
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    settled: 0,
    totalAmount: 0,
    remainingAmount: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    
    Promise.resolve(api.getArrears({ limit: 100 }))
      .then((response) => {
        if (response.success) {
          const data = response.data || [];
          setArrears(data);
          calculateStats(data);
        }
      })
      .catch((err) => {
        console.error('Failed to load arrears:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const calculateStats = (data) => {
    const stats = {
      total: data.length,
      pending: data.filter(ar => ['pending_hod', 'pending_hr', 'pending_admin'].includes(ar.status)).length,
      approved: data.filter(ar => ar.status === 'approved').length,
      settled: data.filter(ar => ar.status === 'settled').length,
      totalAmount: data.reduce((sum, ar) => sum + ar.totalAmount, 0),
      remainingAmount: data.reduce((sum, ar) => sum + ar.remainingAmount, 0)
    };
    setStats(stats);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800';
      case 'pending_hod':
      case 'pending_hr':
      case 'pending_admin':
        return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800';
      case 'rejected':
        return 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
      case 'partially_settled':
        return 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
      case 'settled':
        return 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
      default:
        return 'bg-slate-50 text-slate-700 border border-slate-200 dark:bg-slate-900/20 dark:text-slate-400 dark:border-slate-800';
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      draft: 'Draft',
      pending_hod: 'Pending HOD',
      pending_hr: 'Pending HR',
      pending_admin: 'Pending Admin',
      approved: 'Approved',
      rejected: 'Rejected',
      partially_settled: 'Partially Settled',
      settled: 'Settled',
      cancelled: 'Cancelled'
    };
    return labels[status] || status;
  };

  const getEmployeeName = (emp) => {
    if (emp.employee_name) return emp.employee_name;
    if (emp.first_name && emp.last_name) return `${emp.first_name} ${emp.last_name}`;
    if (emp.first_name) return emp.first_name;
    return emp.emp_no;
  };

  const filteredArrears = arrears.filter(ar => {
    if (filters.status !== 'all' && ar.status !== filters.status) return false;
    if (filters.employee && ar.employee._id !== filters.employee) return false;
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      return (
        getEmployeeName(ar.employee).toLowerCase().includes(searchLower) ||
        ar.employee.emp_no.toLowerCase().includes(searchLower) ||
        ar.reason.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Arrears', value: stats.total, color: 'from-blue-500 to-blue-600', icon: '📋' },
          { label: 'Pending Approval', value: stats.pending, color: 'from-amber-500 to-orange-600', icon: '⏳' },
          { label: 'Approved', value: stats.approved, color: 'from-emerald-500 to-green-600', icon: '✓' },
          { label: 'Settled', value: stats.settled, color: 'from-green-500 to-emerald-600', icon: '✓✓' }
        ].map((stat, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 p-6 border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center text-white text-xl`}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Amount Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl p-6 border border-emerald-200 dark:border-emerald-800">
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2">TOTAL ARREARS AMOUNT</p>
          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">₹{stats.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-amber-200 dark:border-amber-800">
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">REMAINING TO SETTLE</p>
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">₹{stats.remainingAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FilterIcon />
          <h3 className="font-semibold text-slate-900 dark:text-white">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="pending_hod">Pending HOD</option>
              <option value="pending_hr">Pending HR</option>
              <option value="pending_admin">Pending Admin</option>
              <option value="approved">Approved</option>
              <option value="settled">Settled</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Employee</label>
            <select
              value={filters.employee}
              onChange={(e) => setFilters(prev => ({ ...prev, employee: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
            >
              <option value="">All Employees</option>
              {employees.map(emp => (
                <option key={emp._id} value={emp._id}>
                  {getEmployeeName(emp)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search by name, ID, or reason..."
              value={filters.searchTerm}
              onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
              className="w-full px-4 py-2 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredArrears.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">No arrears found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-white">Employee</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-white">Period</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-white">Amount</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900 dark:text-white">Remaining</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-white">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900 dark:text-white">Created</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-slate-900 dark:text-white">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredArrears.map((ar, idx) => (
                  <tr
                    key={ar._id}
                    className={`border-b border-slate-200 dark:border-slate-700 transition-colors duration-200 ${
                      idx % 2 === 0
                        ? 'bg-white dark:bg-slate-800'
                        : 'bg-slate-50 dark:bg-slate-900/50'
                    } hover:bg-blue-50 dark:hover:bg-blue-900/20`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                          {getEmployeeName(ar.employee).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{getEmployeeName(ar.employee)}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{ar.employee.emp_no}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{ar.type === 'direct' ? '—' : `${ar.startMonth || '—'} to ${ar.endMonth || '—'}`}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-white">
                      ₹{ar.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                        ar.remainingAmount > 0
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}>
                        ₹{ar.remainingAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(ar.status)}`}>
                        {getStatusLabel(ar.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {format(new Date(ar.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => onViewDetails?.(ar._id)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors duration-200"
                      >
                        <EyeIcon />
                        View
                      </button>
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
};

export default ArrearsReport;
