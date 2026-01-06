'use client';

import { useState, useEffect } from 'react';
import { api, BonusBatch } from '@/lib/api';
import { toast } from 'react-toastify';
import Link from 'next/link';
import { FiPlus, FiEye, FiCalendar } from 'react-icons/fi';
import { format } from 'date-fns';

export default function BonusBatchesPage() {
  const [batches, setBatches] = useState<BonusBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const response = await api.getBonusBatches();
      if (response.success && response.data) {
        setBatches(response.data);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch batches');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'frozen': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      default: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    }
  };

  return (
    <div className='p-6 space-y-6'>
      <div className='flex justify-between items-center'>
        <h1 className='text-2xl font-bold text-slate-800 dark:text-slate-100'>Bonus Batches</h1>
        <Link
          href='/superadmin/bonus/calculator'
          className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
        >
          <FiPlus /> New Calculation
        </Link>
      </div>

      {loading ? (
        <div className='text-center py-10'>Loading...</div>
      ) : batches.length === 0 ? (
        <div className='text-center py-10 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700'>
          <p className='text-slate-500'>No bonus batches found.</p>
          <Link href='/superadmin/bonus/calculator' className='text-blue-600 hover:underline mt-2 inline-block'>
            Calculate your first bonus
          </Link>
        </div>
      ) : (
        <div className='bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden'>
          <table className='w-full text-left border-collapse'>
            <thead className='bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-medium'>
              <tr>
                <th className='p-4'>Batch Name</th>
                <th className='p-4'>Period</th>
                <th className='p-4'>Policy</th>
                <th className='p-4 text-center'>Employees</th>
                <th className='p-4 text-right'>Total Amount</th>
                <th className='p-4'>Status</th>
                <th className='p-4'>Actions</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-100 dark:divide-slate-700'>
              {batches.map((batch) => (
                <tr key={batch._id} className='hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors'>
                  <td className='p-4 font-medium text-slate-800 dark:text-slate-200'>
                    {batch.batchName}
                  </td>
                  <td className='p-4 text-slate-600 dark:text-slate-400'>
                    <div className='flex items-center gap-2'>
                      <FiCalendar className='text-slate-400' />
                      {batch.month}
                    </div>
                  </td>
                  <td className='p-4 text-slate-600 dark:text-slate-400'>
                    {batch.policy && typeof batch.policy === 'object' ? batch.policy.name : 'Unknown Policy'}
                  </td>
                  <td className='p-4 text-center text-slate-600 dark:text-slate-400'>
                    {batch.totalEmployees}
                  </td>
                  <td className='p-4 text-right font-medium text-slate-800 dark:text-slate-200'>
                    ₹{batch.totalBonusAmount?.toLocaleString()}
                  </td>
                  <td className='p-4'>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(batch.status)}`}>
                      {batch.status}
                    </span>
                  </td>
                  <td className='p-4'>
                    <Link
                      href={`/superadmin/bonus/batches/${batch._id}`}
                      className='p-2 text-blue-600 hover:bg-blue-50 rounded-lg inline-flex items-center gap-1 transition-colors'
                    >
                      <FiEye /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
