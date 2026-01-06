'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { api, BonusBatch, BonusRecord } from '@/lib/api';
import { toast } from 'react-toastify';
import { Check, Lock, RefreshCw, AlertCircle, Save, Edit, X } from 'lucide-react';

export default function BonusBatchDetailsPage() {
  const params = useParams();
  const batchId = params.id as string;

  const [batch, setBatch] = useState<BonusBatch | null>(null);
  const [records, setRecords] = useState<BonusRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Recalculation Modal
  const [showRecalcModal, setShowRecalcModal] = useState(false);
  const [recalcReason, setRecalcReason] = useState('');

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(0);
  const [editRemarks, setEditRemarks] = useState('');

  useEffect(() => {
    if (batchId) loadBatch();
  }, [batchId]);

  const loadBatch = async () => {
    try {
      setLoading(true);
      const response = await api.getBonusBatch(batchId);
      if (response.success && response.data) {
        setBatch(response.data.batch);
        setRecords(response.data.records);
      } else {
        toast.error(response.message || 'Failed to load batch');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error loading batch');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (status: 'approved' | 'frozen') => {
    if (!confirm(`Are you sure you want to change status to ${status.toUpperCase()}?`)) return;
    try {
      const response = await api.updateBonusBatchStatus(batchId, status);
      if (response.success) {
        toast.success(`Batch status updated to ${status}`);
        loadBatch();
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  };

  const handleRecalcRequest = async () => {
    if (!recalcReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    try {
      const response = await api.requestBonusRecalculation(batchId, recalcReason);
      if (response.success) {
        toast.success('Recalculation requested successfully');
        setShowRecalcModal(false);
        loadBatch();
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to request recalculation');
    }
  };

  const handleEditRecord = (record: BonusRecord) => {
    if (batch?.status === 'frozen') return;
    setEditingId(record._id);
    setEditValue(record.finalBonus);
    setEditRemarks(record.remarks || '');
  };

  const saveRecord = async (id: string) => {
    try {
      const response = await api.updateBonusRecord(id, {
        finalBonus: editValue,
        remarks: editRemarks
      });
      if (response.success) {
        toast.success('Record updated');
        setEditingId(null);
        // Update local state without reload
        setRecords(records.map(r => r._id === id ? response.data! : r));
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save record');
    }
  };

  if (loading) return <div className="p-10 text-center">Loading Batch Details...</div>;
  if (!batch) return <div className="p-10 text-center text-red-500">Batch not found</div>;

  return (
    <div className='p-6 space-y-6'>
      {/* Header & Stats */}
      <div className='bg-white dark:bg-slate-800 rounded-xl shadow p-6'>
        <div className='flex justify-between items-start'>
          <div>
            <h1 className='text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2'>
              {batch.batchName}
              <span className={`text-sm px-3 py-1 rounded-full border ${batch.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                batch.status === 'frozen' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                  'bg-yellow-100 text-yellow-700 border-yellow-200'
                }`}>
                {batch.status.toUpperCase()}
              </span>
            </h1>
            <p className='text-slate-500 mt-1'>
              Period: <span className='font-semibold'>{batch.startMonth === batch.endMonth ? batch.startMonth : `${batch.startMonth} to ${batch.endMonth}`}</span> |
              Policy: <span className='font-semibold'>{(batch.policy as any)?.name || 'Unknown Policy'}</span>
            </p>
          </div>

          <div className='flex gap-3'>
            {batch.status === 'pending' && (
              <button onClick={() => updateStatus('approved')} className='flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700'>
                <Check size={16} /> Approve
              </button>
            )}
            {batch.status === 'approved' && (
              <button onClick={() => updateStatus('frozen')} className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'>
                <Lock size={16} /> Freeze
              </button>
            )}
            {(batch.status === 'approved' || batch.status === 'pending') && (
              <button onClick={() => setShowRecalcModal(true)} className='flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700'>
                <RefreshCw size={16} /> Recalculate Request
              </button>
            )}
          </div>
        </div>

        {/* Recalculation Status Banner */}
        {batch.recalculationRequest?.isRequested && (
          <div className='mt-4 p-3 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 rounded-lg flex items-center gap-3 text-orange-800 dark:text-orange-200'>
            <AlertCircle size={16} />
            <span>
              <strong>Recalculation Requested</strong>: {batch.recalculationRequest.reason}
              <span className='ml-2 text-sm opacity-75'>({batch.recalculationRequest.status})</span>
            </span>
          </div>
        )}

        <div className='mt-6 grid grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700'>
          <div>
            <div className='text-xs text-slate-500 uppercase'>Total Employees</div>
            <div className='text-xl font-bold'>{records.length}</div>
          </div>
          <div>
            <div className='text-xs text-slate-500 uppercase'>Total Bonus</div>
            <div className='text-xl font-bold'>₹{records.reduce((acc, r) => acc + (r.finalBonus || 0), 0).toLocaleString()}</div>
          </div>
          {/* Add more stats if needed */}
        </div>
      </div>

      {/* Grid */}
      <div className='bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full'>
            <thead className='bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700'>
              <tr>
                <th className='px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider'>Employee</th>
                <th className='px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider'>Month Data</th>
                <th className='px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider'>Attendance %</th>
                <th className='px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider'>Salary Comp.</th>
                <th className='px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider'>System Calc.</th>
                <th className='px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider'>Final Bonus</th>
                <th className='px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider'>Remarks</th>
                <th className='px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider'>Actions</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-200 dark:divide-slate-700'>
              {records.map((record) => (
                <tr key={record._id} className='hover:bg-slate-50 dark:hover:bg-slate-900/50'>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <div className='font-medium text-slate-900 dark:text-slate-100'>{record.employeeId.employee_name}</div>
                    <div className='text-xs text-slate-500'>{record.emp_no}</div>
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-sm text-slate-500'>
                    P:{record.attendanceDays} / T:{record.totalMonthDays}
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${record.attendancePercentage >= 90 ? 'bg-green-100 text-green-800' :
                      record.attendancePercentage >= 75 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                      {record.attendancePercentage}%
                    </span>
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-sm text-slate-500'>
                    ₹{record.salaryComponentValue.toLocaleString()}
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-sm font-medium'>
                    ₹{record.calculatedBonus.toLocaleString()}
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600'>
                    {editingId === record._id ? (
                      <input
                        type="number"
                        className="w-24 border rounded px-1 py-1"
                        value={editValue}
                        onChange={e => setEditValue(Number(e.target.value))}
                      />
                    ) : (
                      `₹${record.finalBonus.toLocaleString()}`
                    )}
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-sm text-slate-500'>
                    {editingId === record._id ? (
                      <input
                        type="text"
                        className="w-full border rounded px-1 py-1"
                        placeholder="Remarks..."
                        value={editRemarks}
                        onChange={e => setEditRemarks(e.target.value)}
                      />
                    ) : (
                      record.remarks || '-'
                    )}
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium'>
                    {batch.status !== 'frozen' && (
                      editingId === record._id ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => saveRecord(record._id)} className='text-green-600 hover:text-green-900'><Save size={18} /></button>
                          <button onClick={() => setEditingId(null)} className='text-red-600 hover:text-red-900'><X size={18} /></button>
                        </div>
                      ) : (
                        <button onClick={() => handleEditRecord(record)} className='text-slate-400 hover:text-blue-600'>
                          <Edit size={18} />
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recalc Modal */}
      {showRecalcModal && (
        <div className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'>
          <div className='bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6'>
            <h3 className='text-lg font-bold mb-4'>Request Recalculation</h3>
            <p className='text-slate-500 mb-4 text-sm'>
              Requesting recalculation will flag this batch for review. You must provide a reason.
            </p>
            <textarea
              className='w-full border rounded-lg p-3 mb-4 dark:bg-slate-900 dark:border-slate-600'
              rows={3}
              placeholder="Reason for recalculation..."
              value={recalcReason}
              onChange={e => setRecalcReason(e.target.value)}
            />
            <div className='flex justify-end gap-3'>
              <button onClick={() => setShowRecalcModal(false)} className='px-4 py-2 text-slate-600'>Cancel</button>
              <button onClick={handleRecalcRequest} className='px-4 py-2 bg-blue-600 text-white rounded-lg'>Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
