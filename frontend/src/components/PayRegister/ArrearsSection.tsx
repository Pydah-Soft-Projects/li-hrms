import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { api } from '@/lib/api';

const ChevronDownIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

interface ArrearsData {
  _id: string;
  startMonth: string;
  endMonth: string;
  totalAmount: number;
  remainingAmount: number;
  status: string;
  reason: string;
}

const ArrearsSection = ({ employeeId, month, onSettlement }: { employeeId: string; month: string; onSettlement?: (data: any) => void }) => {
  const [arrears, setArrears] = useState<ArrearsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [settlements, setSettlements] = useState<Record<string, number>>({});
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [selectedArrearsId, setSelectedArrearsId] = useState<string | null>(null);

  useEffect(() => {
    if (employeeId && month) {
      loadArrears();
    }
  }, [employeeId, month]);

  const loadArrears = () => {
    setLoading(true);
    
    Promise.resolve(api.getPendingArrears(employeeId))
      .then((response: any) => {
        if (response.success) {
          const approvedArrears = (response.data as ArrearsData[])?.filter(ar => ar.status === 'approved' || ar.status === 'partially_settled') || [];
          setArrears(approvedArrears);
          
          // Initialize settlements
          const initialSettlements: Record<string, number> = {};
          approvedArrears.forEach(ar => {
            initialSettlements[ar._id] = 0;
          });
          setSettlements(initialSettlements);
        }
      })
      .catch((err: any) => {
        console.error('Failed to load arrears:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleSettlementChange = (arrearsId: string, amount: string) => {
    const maxAmount = arrears.find((ar: any) => ar._id === arrearsId)?.remainingAmount || 0;
    const validAmount = Math.min(Math.max(0, parseFloat(amount) || 0), maxAmount);
    setSettlements(prev => ({
      ...prev,
      [arrearsId]: validAmount
    }));
  };

  const handleSplit = (arrearsId: string) => {
    setSelectedArrearsId(arrearsId);
    setShowSplitDialog(true);
  };

  const totalSettlement = Object.values(settlements).reduce((sum: number, val: number) => sum + val, 0);

  if (!employeeId || !month) return null;

  if (arrears.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-200 border-b border-slate-200 dark:border-slate-700"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-semibold">
            ₹
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-slate-900 dark:text-white">Arrears Settlement</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">{arrears.length} pending arrears</p>
          </div>
        </div>
        <div className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDownIcon />
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-6 space-y-6">
          {/* Arrears List */}
          <div className="space-y-4">
            {arrears.map(ar => (
              <div key={ar._id} className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{ar.startMonth} to {ar.endMonth}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{ar.reason}</p>
                  </div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
                    ar.status === 'approved'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                      : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                  }`}>
                    {ar.status === 'approved' ? 'Approved' : 'Partially Settled'}
                  </span>
                </div>

                {/* Amount Details */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Total</p>
                    <p className="font-semibold text-slate-900 dark:text-white">₹{ar.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Settled</p>
                    <p className="font-semibold text-slate-900 dark:text-white">₹{(ar.totalAmount - ar.remainingAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Remaining</p>
                    <p className="font-semibold text-slate-900 dark:text-white">₹{ar.remainingAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>

                {/* Settlement Input */}
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Settle Amount (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={ar.remainingAmount}
                      value={settlements[ar._id] || 0}
                      onChange={(e) => handleSettlementChange(ar._id, e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none transition-colors duration-200"
                    />
                  </div>
                  <button
                    onClick={() => handleSplit(ar._id)}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-medium flex items-center gap-2 transition-all duration-200 text-sm"
                  >
                    <PlusIcon />
                    Split
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Settlement for this month</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">₹{totalSettlement.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
              </div>
              <button
                onClick={() => onSettlement?.(Object.entries(settlements).filter(([_, amount]) => amount > 0).map(([id, amount]) => ({ arrearsId: id, amount })))}
                className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={totalSettlement === 0}
              >
                Apply Settlement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArrearsSection;
