'use client';

import { useState, useEffect } from 'react';
import { api, BonusBatch } from '@/lib/api';
import { toast } from 'react-toastify';
import Link from 'next/link';
import { FiPlus, FiEye, FiCalendar } from 'react-icons/fi';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

/**
 * Page component that displays and manages bonus batches with filtering, navigation, and creation workflows.
 *
 * Renders a filter UI for start/end months, a table of bonus batches (clickable rows that navigate to batch details),
 * and a modal to create a new bonus batch. The component fetches batches and related metadata on mount and
 * whenever filters change, and it handles creating a batch which refreshes the list on success.
 *
 * @returns The rendered Bonus Batches page as a React element containing filters, the batches table, and the create-batch modal.
 */
export default function BonusBatchesPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<BonusBatch[]>([]);
  const [loading, setLoading] = useState(true);

  // New states for policies, divisions, departments
  const [policies, setPolicies] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  // Filter State
  const [filters, setFilters] = useState({
    startMonth: '',
    endMonth: ''
  });

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBatch, setNewBatch] = useState({
    startMonth: new Date().toISOString().slice(0, 7),
    endMonth: new Date().toISOString().slice(0, 7),
    policyId: '',
    divisionId: '',
    departmentId: '',
  });

  useEffect(() => {
    fetchBatches();
    fetchMetadata();
  }, [filters]); // Added filters to dependency array to refetch when filters change

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const outputFilters: any = {};
      if (filters.startMonth) outputFilters.startMonth = filters.startMonth;
      if (filters.endMonth) outputFilters.endMonth = filters.endMonth;

      const response = await api.getBonusBatches(outputFilters);
      if (response.success && response.data) {
        setBatches(response.data);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch batches');
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [policiesRes, divsRes, deptsRes] = await Promise.all([
        api.getBonusPolicies(),
        api.getDivisions(),
        api.getDepartments()
      ]);
      if (policiesRes.success) setPolicies(policiesRes.data || []);
      if (divsRes.success) setDivisions(divsRes.data || []);
      if (deptsRes.success) setDepartments(deptsRes.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.createBonusBatch({
        startMonth: newBatch.startMonth,
        endMonth: newBatch.endMonth,
        policyId: newBatch.policyId,
        departmentId: newBatch.departmentId || undefined,
        divisionId: newBatch.divisionId || undefined
      });

      if (response.success) {
        toast.success('Bonus Batch Calculation Started!');
        setShowCreateModal(false);
        fetchBatches();
      } else {
        toast.error(response.message || 'Failed to create batch');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error creating batch');
    }
  };

  return (
    <div className='p-6 space-y-6'>
      <div className='flex justify-between items-center'>
        <h1 className='text-2xl font-bold text-slate-800 dark:text-slate-100'>Bonus Batches</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
        >
          <FiPlus /> New Batch
        </button>
      </div>

      {/* Filters */}
      <div className='flex gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm'>
        <input
          type='month'
          className='border rounded px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-600'
          value={filters.startMonth}
          onChange={e => setFilters({ ...filters, startMonth: e.target.value })}
        />
        <span className="self-center text-slate-400">to</span>
        <input
          type='month'
          className='border rounded px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-600'
          value={filters.endMonth}
          onChange={e => setFilters({ ...filters, endMonth: e.target.value })}
        />
        <button onClick={fetchBatches} className='px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 rounded text-sm'>
          Filter
        </button>
      </div>

      {loading ? (
        <div className='text-center py-10'>Loading...</div>
      ) : batches.length === 0 ? (
        <div className='text-center py-10 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700'>
          <p className='text-slate-500'>No bonus batches found.</p>
          <button onClick={() => setShowCreateModal(true)} className='text-blue-600 hover:underline mt-2 inline-block'>
            Calculate your first bonus
          </button>
        </div>
      ) : (
        <div className='bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden'>
          <table className='w-full text-left'>
            <thead className='bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700'>
              <tr>
                <th className='px-6 py-3 text-xs font-medium text-slate-500 uppercase'>Batch Name</th>
                <th className='px-6 py-3 text-xs font-medium text-slate-500 uppercase'>Period</th>
                <th className='px-6 py-3 text-xs font-medium text-slate-500 uppercase'>Policy</th>
                <th className='px-6 py-3 text-xs font-medium text-slate-500 uppercase'>Records</th>
                <th className='px-6 py-3 text-xs font-medium text-slate-500 uppercase'>Amount</th>
                <th className='px-6 py-3 text-xs font-medium text-slate-500 uppercase'>Status</th>
                <th className='px-6 py-3 text-xs font-medium text-slate-500 uppercase'>Created</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-200 dark:divide-slate-700'>
              {batches.map(batch => (
                <tr key={batch._id} className='hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer' onClick={() => router.push(`/superadmin/bonus/batches/${batch._id}`)}>
                  <td className='px-6 py-4 font-medium'>
                    <Link
                      href={`/superadmin/bonus/batches/${batch._id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {batch.batchName}
                    </Link>
                  </td>
                  <td className='px-6 py-4 text-sm text-slate-500'>
                    {batch.startMonth === batch.endMonth ? batch.startMonth : `${batch.startMonth} to ${batch.endMonth}`}
                  </td>
                  <td className='px-6 py-4 text-sm'>{(batch.policy as any)?.name}</td>
                  <td className='px-6 py-4 text-sm'>{batch.totalEmployees}</td>
                  <td className='px-6 py-4 text-sm'>₹{batch.totalBonusAmount?.toLocaleString()}</td>
                  <td className='px-6 py-4'>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${batch.status === 'approved' ? 'bg-green-100 text-green-800' :
                      batch.status === 'frozen' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                      {batch.status.toUpperCase()}
                    </span>
                  </td>
                  <td className='px-6 py-4 text-sm text-slate-500'>
                    {new Date(batch.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4'>
          <div className='bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6'>
            <h2 className='text-xl font-bold mb-4'>Create Bonus Batch</h2>
            <form onSubmit={handleCreate} className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='block text-sm font-medium mb-1'>Start Month</label>
                  <input
                    type='month'
                    required
                    className='w-full border rounded px-3 py-2 dark:bg-slate-900 dark:border-slate-600'
                    value={newBatch.startMonth}
                    onChange={e => setNewBatch({ ...newBatch, startMonth: e.target.value })}
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium mb-1'>End Month</label>
                  <input
                    type='month'
                    required
                    className='w-full border rounded px-3 py-2 dark:bg-slate-900 dark:border-slate-600'
                    value={newBatch.endMonth}
                    onChange={e => setNewBatch({ ...newBatch, endMonth: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className='block text-sm font-medium mb-1'>Policy</label>
                <select
                  required
                  className='w-full border rounded px-3 py-2 dark:bg-slate-900 dark:border-slate-600'
                  value={newBatch.policyId}
                  onChange={e => setNewBatch({ ...newBatch, policyId: e.target.value })}
                >
                  <option value="">Select Policy</option>
                  {policies.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='block text-sm font-medium mb-1'>Division (Optional)</label>
                  <select
                    className='w-full border rounded px-3 py-2 dark:bg-slate-900 dark:border-slate-600'
                    value={newBatch.divisionId}
                    onChange={e => setNewBatch({ ...newBatch, divisionId: e.target.value })}
                  >
                    <option value="">All Divisions</option>
                    {divisions.map(d => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className='block text-sm font-medium mb-1'>Department (Optional)</label>
                  <select
                    className='w-full border rounded px-3 py-2 dark:bg-slate-900 dark:border-slate-600'
                    value={newBatch.departmentId}
                    onChange={e => setNewBatch({ ...newBatch, departmentId: e.target.value })}
                  >
                    <option value="">All Departments</option>
                    {departments.map(d => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className='flex justify-end gap-3 pt-4'>
                <button type='button' onClick={() => setShowCreateModal(false)} className='px-4 py-2 text-slate-600'>Cancel</button>
                <button type='submit' className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'>Calculate & Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}