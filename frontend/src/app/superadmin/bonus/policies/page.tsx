'use client';

import { useState, useEffect } from 'react';
import { api, BonusPolicy } from '@/lib/api';
import { toast } from 'react-toastify';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX } from 'react-icons/fi';

export default function BonusPoliciesPage() {
  const [policies, setPolicies] = useState<BonusPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<BonusPolicy | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<BonusPolicy>>({
    name: '',
    description: '',
    policyType: 'attendance_regular',
    salaryComponent: 'gross_salary',
    tiers: [{ minPercentage: 0, maxPercentage: 100, bonusMultiplier: 0, flatAmount: 0 }],
    isActive: true,
  });

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const response = await api.getBonusPolicies();
      if (response.success && response.data) {
        setPolicies(response.data);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch policies');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      policyType: 'attendance_regular',
      salaryComponent: 'gross_salary',
      tiers: [{ minPercentage: 0, maxPercentage: 100, bonusMultiplier: 0, flatAmount: 0 }],
      isActive: true,
    });
    setEditingPolicy(null);
    setShowForm(false);
  };

  const handleEdit = (policy: BonusPolicy) => {
    setEditingPolicy(policy);
    setFormData(policy);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this policy?')) return;
    try {
      const response = await api.deleteBonusPolicy(id);
      if (response.success) {
        toast.success('Policy deleted');
        fetchPolicies();
      } else {
        toast.error(response.message || 'Failed to delete');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error deleting policy');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPolicy) {
        const response = await api.updateBonusPolicy(editingPolicy._id, formData);
        if (response.success) {
          toast.success('Policy updated');
          fetchPolicies();
          resetForm();
        } else {
          toast.error(response.message || 'Failed to update');
        }
      } else {
        const response = await api.createBonusPolicy(formData);
        if (response.success) {
          toast.success('Policy created');
          fetchPolicies();
          resetForm();
        } else {
          toast.error(response.message || 'Failed to create');
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Error saving policy');
    }
  };

  const updateTier = (index: number, field: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const newTiers = [...(formData.tiers || [])];
    newTiers[index] = { ...newTiers[index], [field]: numValue };
    setFormData({ ...formData, tiers: newTiers });
  };

  const addTier = () => {
    setFormData({
      ...formData,
      tiers: [...(formData.tiers || []), { minPercentage: 0, maxPercentage: 0, bonusMultiplier: 0, flatAmount: 0 }],
    });
  };

  const removeTier = (index: number) => {
    const newTiers = [...(formData.tiers || [])];
    newTiers.splice(index, 1);
    setFormData({ ...formData, tiers: newTiers });
  };

  return (
    <div className='p-6 space-y-6'>
      <div className='flex justify-between items-center'>
        <h1 className='text-2xl font-bold text-slate-800 dark:text-slate-100'>Bonus Policies</h1>
        <button
          onClick={() => setShowForm(true)}
          className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
        >
          <FiPlus /> New Policy
        </button>
      </div>

      {/* Form Modal/Overlay */}
      {showForm && (
        <div className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto'>
          <div className='bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto'>
            <div className='p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-800 z-10'>
              <h2 className='text-xl font-bold text-slate-800 dark:text-slate-100'>
                {editingPolicy ? 'Edit Policy' : 'Create New Policy'}
              </h2>
              <button onClick={resetForm} className='text-slate-500 hover:text-slate-700'>
                <FiX size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className='p-6 space-y-6'>
              <div className='grid grid-cols-2 gap-4'>
                <div className='col-span-2'>
                  <label className='block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1'>Policy Name</label>
                  <input
                    type='text'
                    required
                    className='w-full px-3 py-2 border rounded-lg dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className='col-span-2'>
                  <label className='block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1'>Description</label>
                  <textarea
                    className='w-full px-3 py-2 border rounded-lg dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1'>Policy Type</label>
                  <select
                    className='w-full px-3 py-2 border rounded-lg dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                    value={formData.policyType}
                    onChange={(e) => setFormData({ ...formData, policyType: e.target.value as any })}
                  >
                    <option value='attendance_regular'>Attendance Based (Regular)</option>
                    <option value='payroll_based'>Payroll Based</option>
                  </select>
                </div>
                <div>
                  <label className='block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1'>Salary Component</label>
                  <select
                    className='w-full px-3 py-2 border rounded-lg dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                    value={formData.salaryComponent}
                    onChange={(e) => setFormData({ ...formData, salaryComponent: e.target.value as any })}
                  >
                    <option value='gross_salary'>Gross Salary</option>
                    <option value='basic'>Basic Pay</option>
                    <option value='fixed_pay'>Fixed Pay</option>
                    <option value='ctc'>CTC</option>
                  </select>
                </div>
              </div>

              <div>
                <div className='flex justify-between items-center mb-2'>
                  <label className='block text-sm font-medium text-slate-700 dark:text-slate-300'>Bonus Tiers</label>
                  <button type='button' onClick={addTier} className='text-sm text-blue-600 hover:text-blue-700'>
                    + Add Tier
                  </button>
                </div>
                <div className='space-y-3'>
                  {formData.tiers?.map((tier, index) => (
                    <div key={index} className='flex gap-2 items-end p-3 bg-slate-50 dark:bg-slate-900 rounded-lg'>
                      <div>
                        <label className='text-xs text-slate-500'>Min %</label>
                        <input
                          type='number'
                          className='w-20 px-2 py-1 text-sm border rounded dark:bg-slate-800'
                          value={tier.minPercentage}
                          onChange={(e) => updateTier(index, 'minPercentage', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className='text-xs text-slate-500'>Max %</label>
                        <input
                          type='number'
                          className='w-20 px-2 py-1 text-sm border rounded dark:bg-slate-800'
                          value={tier.maxPercentage}
                          onChange={(e) => updateTier(index, 'maxPercentage', e.target.value)}
                        />
                      </div>
                      <div className='flex-1'>
                        <label className='text-xs text-slate-500'>Multiplier (x)</label>
                        <input
                          type='number'
                          step='0.01'
                          className='w-full px-2 py-1 text-sm border rounded dark:bg-slate-800'
                          value={tier.bonusMultiplier}
                          onChange={(e) => updateTier(index, 'bonusMultiplier', e.target.value)}
                        />
                      </div>
                      <div className='flex-1'>
                        <label className='text-xs text-slate-500'>Flat Amount</label>
                        <input
                          type='number'
                          className='w-full px-2 py-1 text-sm border rounded dark:bg-slate-800'
                          value={tier.flatAmount}
                          onChange={(e) => updateTier(index, 'flatAmount', e.target.value)}
                        />
                      </div>
                      <button
                        type='button'
                        onClick={() => removeTier(index)}
                        className='p-2 text-red-500 hover:bg-red-50 rounded'
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className='flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700'>
                <button
                  type='button'
                  onClick={resetForm}
                  className='px-4 py-2 text-slate-600 hover:text-slate-800'
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2'
                >
                  <FiSave /> Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className='text-center py-10'>Loading...</div>
      ) : (
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {policies.map((policy) => (
            <div key={policy._id} className='bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5'>
              <div className='flex justify-between items-start mb-4'>
                <div>
                  <h3 className='font-bold text-lg text-slate-800 dark:text-slate-100'>{policy.name}</h3>
                  <span className='text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'>
                    {policy.policyType === 'attendance_regular' ? 'Attendance Based' : 'Payroll Based'}
                  </span>
                </div>
                <div className='flex gap-2'>
                  <button onClick={() => handleEdit(policy)} className='p-2 text-slate-400 hover:text-blue-600'>
                    <FiEdit2 />
                  </button>
                  <button onClick={() => handleDelete(policy._id)} className='p-2 text-slate-400 hover:text-red-600'>
                    <FiTrash2 />
                  </button>
                </div>
              </div>

              <p className='text-sm text-slate-500 dark:text-slate-400 mb-4 h-10 line-clamp-2'>{policy.description || 'No description'}</p>

              <div className='space-y-2'>
                <div className='text-xs font-semibold text-slate-500 uppercase'>Tiers Preview</div>
                {policy.tiers.slice(0, 3).map((tier, i) => (
                  <div key={i} className='flex justify-between text-sm'>
                    <span>{tier.minPercentage}% - {tier.maxPercentage}%</span>
                    <span className='font-medium text-slate-700 dark:text-slate-300'>
                      {tier.bonusMultiplier > 0 ? `${tier.bonusMultiplier}x` : ''}
                      {tier.bonusMultiplier > 0 && tier.flatAmount ? ' + ' : ''}
                      {tier.flatAmount ? `₹${tier.flatAmount}` : ''}
                    </span>
                  </div>
                ))}
                {policy.tiers.length > 3 && (
                  <div className='text-xs text-slate-400 text-center'>+ {policy.tiers.length - 3} more tiers</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
