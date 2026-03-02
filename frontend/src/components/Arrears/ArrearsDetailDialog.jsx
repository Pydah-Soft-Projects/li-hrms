import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

const XIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ArrearsDetailDialog = ({ open, onClose, arrearsId, onUpdate }) => {
  const [arrears, setArrears] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (open && arrearsId) {
      loadArrears();
    }
  }, [open, arrearsId]);

  const calculateMonthDifference = (startMonth, endMonth) => {
    if (!startMonth || !endMonth) return 0;
    const [startYear, startM] = startMonth.split('-').map(Number);
    const [endYear, endM] = endMonth.split('-').map(Number);
    return (endYear - startYear) * 12 + (endM - startM) + 1;
  };

  const calculateTotal = (start, end, monthly) => {
    if (!start || !end || !monthly) return 0;
    const months = calculateMonthDifference(start, end);
    return months * parseFloat(monthly);
  };

  const calculateMonthly = (start, end, total) => {
    if (!start || !end || !total) return 0;
    const months = calculateMonthDifference(start, end);
    return months > 0 ? parseFloat(total) / months : 0;
  };

  const loadArrears = () => {
    setLoading(true);
    
    Promise.resolve(api.getArrearsById(arrearsId))
      .then((response) => {
        if (response.success) {
          setArrears(response.data);
          const d = response.data;
          if (d.type === 'direct') {
            setEditData({ totalAmount: d.totalAmount, reason: d.reason });
          } else {
            setEditData({
              startMonth: d.startMonth,
              endMonth: d.endMonth,
              monthlyAmount: d.monthlyAmount,
              totalAmount: d.totalAmount,
              reason: d.reason
            });
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load arrears:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleTransition = (nextStatus) => {
    setActionLoading(true);
    
    Promise.resolve(api.transitionArrears(arrearsId, nextStatus, isEditing ? editData : {}))
      .then((response) => {
        if (response.success) {
          setArrears(response.data);
          setIsEditing(false);
          if (onUpdate) onUpdate();
        }
      })
      .catch((err) => {
        console.error('Failed to transition arrears:', err);
      })
      .finally(() => {
        setActionLoading(false);
      });
  };

  const getNextStatus = () => {
    const transitions = {
      'draft': 'pending_hod',
      'pending_hod': 'pending_hr',
      'pending_hr': 'pending_admin',
      'pending_admin': 'approved'
    };
    return transitions[arrears?.status];
  };

  if (!open) return null;

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

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-900 dark:to-blue-800 px-6 py-6 flex items-center justify-between border-b border-blue-700 dark:border-blue-900">
          <h2 className="text-2xl font-bold text-white">Arrears Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-blue-700 dark:hover:bg-blue-800 rounded-lg transition-colors duration-200"
          >
            <XIcon className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : arrears ? (
          <div className="p-6 space-y-6">
            {/* Employee & Status Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4">Employee Information</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Name</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">{getEmployeeName(arrears.employee)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Employee ID</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{arrears.employee.emp_no}</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 border border-purple-200 dark:border-purple-800">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4">Status</h3>
                <div className="space-y-3">
                  <div>
                    <p className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border ${getStatusColor(arrears.status)}`}>
                      {getStatusLabel(arrears.status)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Created</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{format(new Date(arrears.createdAt), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Amount Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl p-6 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2">TOTAL AMOUNT</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">₹{arrears.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">REMAINING AMOUNT</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">₹{arrears.remainingAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* Reason/Remarks (direct: no period; incremental: period + reason) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {arrears.type !== 'direct' && (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Period</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">From:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{arrears.startMonth ?? '—'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">To:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{arrears.endMonth ?? '—'}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className={`bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700 ${arrears.type === 'direct' ? 'md:col-span-2' : ''}`}>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">{arrears.type === 'direct' ? 'Remarks' : 'Reason'}</h3>
                <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{arrears.reason || '—'}</p>
              </div>
            </div>

            {/* Combined Timeline - Status, Edits, and Approvals */}
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-6">Activity Timeline</h3>
              
              <div className="space-y-6">
                {/* Created Event */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                      <span className="text-lg">📝</span>
                    </div>
                    <div className="w-0.5 h-12 bg-slate-300 dark:bg-slate-600 my-2"></div>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="font-semibold text-slate-900 dark:text-white">Created</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Created by {arrears.createdBy?.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">{format(new Date(arrears.createdAt), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                </div>

                {/* Status Change Events */}
                {arrears.statusHistory && arrears.statusHistory.length > 0 && arrears.statusHistory.map((statusChange, idx) => (
                  <div key={`status-${idx}`} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                        <span className="text-lg">🔄</span>
                      </div>
                      <div className="w-0.5 h-12 bg-slate-300 dark:bg-slate-600 my-2"></div>
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        Status Changed
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Updated by {statusChange.changedBy?.name || 'System'}
                      </p>
                      <div className="mt-2 space-y-1 text-sm bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">From:</span>
                          <span className="font-medium text-slate-900 dark:text-white capitalize">
                            {statusChange.previousStatus?.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">To:</span>
                          <span className="font-medium text-slate-900 dark:text-white capitalize">
                            {statusChange.newStatus?.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        </div>
                        {statusChange.comments && (
                          <div className="pt-1 mt-1 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-slate-700 dark:text-slate-300">{statusChange.comments}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                        {format(new Date(statusChange.changedAt), 'dd MMM yyyy, HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Edit History Events */}
                {arrears.editHistory && arrears.editHistory.length > 0 && arrears.editHistory.map((edit, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                        <span className="text-lg">✏️</span>
                      </div>
                      <div className="w-0.5 h-12 bg-slate-300 dark:bg-slate-600 my-2"></div>
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="font-semibold text-slate-900 dark:text-white">Amount Edited</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Edited by {edit.editedBy?.name || 'Unknown'}
                      </p>
                      <div className="mt-2 space-y-1 text-sm bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Monthly Amount:</span>
                          <span className="font-medium text-slate-900 dark:text-white">
                            ₹{edit.originalMonthlyAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })} → ₹{edit.newMonthlyAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Total Amount:</span>
                          <span className="font-medium text-slate-900 dark:text-white">
                            ₹{edit.originalAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })} → ₹{edit.newAmount?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                          Status: {edit.status?.replace('_', ' ').toUpperCase()}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">{format(new Date(edit.editedAt), 'dd MMM yyyy, HH:mm')}</p>
                    </div>
                  </div>
                ))}

                {/* HOD Approval */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      arrears.hodApproval?.approved === true
                        ? 'bg-emerald-100 dark:bg-emerald-900/30'
                        : arrears.hodApproval?.approved === false
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}>
                      {arrears.hodApproval?.approved === true && <CheckCircleIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />}
                      {arrears.hodApproval?.approved === false && <CloseIcon className="w-6 h-6 text-red-600 dark:text-red-400" />}
                      {arrears.hodApproval?.approved === null && <HourglassEmptyIcon className="w-6 h-6 text-slate-600 dark:text-slate-400" />}
                    </div>
                    <div className="w-0.5 h-12 bg-slate-300 dark:bg-slate-600 my-2"></div>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="font-semibold text-slate-900 dark:text-white">HOD Approval</p>
                    {arrears.hodApproval?.approvedAt ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {arrears.hodApproval.approved ? 'Approved' : 'Rejected'} by {arrears.hodApproval.approvedBy?.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-500">{format(new Date(arrears.hodApproval.approvedAt), 'dd MMM yyyy, HH:mm')}</p>
                        {arrears.hodApproval.comments && (
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                            {arrears.hodApproval.comments}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Pending</p>
                    )}
                  </div>
                </div>

                {/* HR Approval */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      arrears.hrApproval?.approved === true
                        ? 'bg-emerald-100 dark:bg-emerald-900/30'
                        : arrears.hrApproval?.approved === false
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}>
                      {arrears.hrApproval?.approved === true && <CheckCircleIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />}
                      {arrears.hrApproval?.approved === false && <CloseIcon className="w-6 h-6 text-red-600 dark:text-red-400" />}
                      {arrears.hrApproval?.approved === null && <HourglassEmptyIcon className="w-6 h-6 text-slate-600 dark:text-slate-400" />}
                    </div>
                    <div className="w-0.5 h-12 bg-slate-300 dark:bg-slate-600 my-2"></div>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="font-semibold text-slate-900 dark:text-white">HR Approval</p>
                    {arrears.hrApproval?.approvedAt ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {arrears.hrApproval.approved ? 'Approved' : 'Rejected'} by {arrears.hrApproval.approvedBy?.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-500">{format(new Date(arrears.hrApproval.approvedAt), 'dd MMM yyyy, HH:mm')}</p>
                        {arrears.hrApproval.comments && (
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                            {arrears.hrApproval.comments}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Pending</p>
                    )}
                  </div>
                </div>

                {/* Admin Approval */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      arrears.adminApproval?.approved === true
                        ? 'bg-emerald-100 dark:bg-emerald-900/30'
                        : arrears.adminApproval?.approved === false
                        ? 'bg-red-100 dark:bg-red-900/30'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}>
                      {arrears.adminApproval?.approved === true && <CheckCircleIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />}
                      {arrears.adminApproval?.approved === false && <CloseIcon className="w-6 h-6 text-red-600 dark:text-red-400" />}
                      {arrears.adminApproval?.approved === null && <HourglassEmptyIcon className="w-6 h-6 text-slate-600 dark:text-slate-400" />}
                    </div>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="font-semibold text-slate-900 dark:text-white">Admin Approval (Final)</p>
                    {arrears.adminApproval?.approvedAt ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {arrears.adminApproval.approved ? 'Approved' : 'Rejected'} by {arrears.adminApproval.approvedBy?.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-500">{format(new Date(arrears.adminApproval.approvedAt), 'dd MMM yyyy, HH:mm')}</p>
                        {arrears.adminApproval.comments && (
                          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                            {arrears.adminApproval.comments}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Pending</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Settlement History */}
            {arrears.settlementHistory && arrears.settlementHistory.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Settlement History</h3>
                <div className="space-y-3">
                  {arrears.settlementHistory.map((settlement, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          ₹{settlement.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{settlement.month}</p>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{format(new Date(settlement.settledAt), 'dd MMM yyyy')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Edit Mode - Editable Fields */}
            {isEditing && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Edit Arrears Details</h3>
                
                {arrears.type === 'direct' ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Amount (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editData.totalAmount}
                        onChange={(e) => setEditData({...editData, totalAmount: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Remarks</label>
                      <textarea
                        value={editData.reason}
                        onChange={(e) => setEditData({...editData, reason: e.target.value})}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                  </>
                ) : (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Month</label>
                    <input
                      type="month"
                      value={editData.startMonth}
                      onChange={(e) => {
                        const newData = {...editData, startMonth: e.target.value};
                        newData.totalAmount = calculateTotal(newData.startMonth, newData.endMonth, newData.monthlyAmount);
                        setEditData(newData);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">End Month</label>
                    <input
                      type="month"
                      value={editData.endMonth}
                      onChange={(e) => {
                        const newData = {...editData, endMonth: e.target.value};
                        newData.totalAmount = calculateTotal(newData.startMonth, newData.endMonth, newData.monthlyAmount);
                        setEditData(newData);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Monthly Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editData.monthlyAmount}
                      onChange={(e) => {
                        const newData = {...editData, monthlyAmount: parseFloat(e.target.value) || 0};
                        newData.totalAmount = calculateTotal(newData.startMonth, newData.endMonth, newData.monthlyAmount);
                        setEditData(newData);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Total Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editData.totalAmount}
                      onChange={(e) => {
                        const newData = {...editData, totalAmount: parseFloat(e.target.value) || 0};
                        newData.monthlyAmount = calculateMonthly(newData.startMonth, newData.endMonth, newData.totalAmount);
                        setEditData(newData);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Summary in Edit Mode (Incremental only) */}
                {editData.monthlyAmount && editData.totalAmount && editData.startMonth && editData.endMonth && (
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Monthly Amount:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">₹{parseFloat(editData.monthlyAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Number of Months:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{calculateMonthDifference(editData.startMonth, editData.endMonth)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-600 pt-2 mt-2">
                        <span className="font-semibold text-slate-900 dark:text-white">Total Amount:</span>
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">₹{parseFloat(editData.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Reason</label>
                  <textarea
                    value={editData.reason}
                    onChange={(e) => setEditData({...editData, reason: e.target.value})}
                    rows="3"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                </>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-6 border-t border-slate-200 dark:border-slate-700 flex-wrap">
              {!isEditing && ['draft', 'pending_hod', 'pending_hr', 'pending_admin', 'approved'].includes(arrears?.status) && (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-all duration-200 text-sm"
                    disabled={actionLoading}
                  >
                    ✏️ Edit
                  </button>
                  {getNextStatus() && (
                    <button
                      onClick={() => handleTransition(getNextStatus())}
                      className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold transition-all duration-200 text-sm"
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Processing...' : `→ Move to ${getNextStatus().replace('_', ' ').toUpperCase()}`}
                    </button>
                  )}
                </>
              )}
              
              {!isEditing && ['partially_settled', 'settled'].includes(arrears?.status) && (
                <div className="text-sm text-slate-600 dark:text-slate-400 py-2">
                  ℹ️ Editing disabled for settled arrears. Settlement can only be modified through payroll processing.
                </div>
              )}
              
              {isEditing && (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white font-semibold transition-all duration-200 text-sm"
                    disabled={actionLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setActionLoading(true);
                      Promise.resolve(api.editArrears(arrearsId, editData))
                        .then((response) => {
                          if (response.success) {
                            setArrears(response.data);
                            setIsEditing(false);
                            if (onUpdate) onUpdate();
                          }
                        })
                        .catch((err) => {
                          console.error('Failed to update arrears:', err);
                        })
                        .finally(() => {
                          setActionLoading(false);
                        });
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all duration-200 text-sm"
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              )}
              
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold transition-all duration-200"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-500 dark:text-slate-400">Failed to load arrears details</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArrearsDetailDialog;
