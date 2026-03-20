import React from 'react';

interface ResignationModalProps {
    employee: { employee_name: string; emp_no: string };
    leftDateForm: { leftDate: string; leftReason: string; requestType?: 'resignation' | 'termination' };
    setLeftDateForm: (form: { leftDate: string; leftReason: string; requestType?: 'resignation' | 'termination' }) => void;
    resignationNoticePeriodDays: number;
    error: string;
    success: string;
    onSubmit: (e: React.FormEvent) => void;
    onClose: () => void;
    allowedToTerminate?: boolean;
}

export default function ResignationModal({
    employee,
    leftDateForm,
    setLeftDateForm,
    resignationNoticePeriodDays,
    error,
    success,
    onSubmit,
    onClose,
    allowedToTerminate = false,
}: ResignationModalProps) {
    const isTermination = leftDateForm.requestType === 'termination';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-50 w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950/95">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                            {isTermination ? 'Terminate Employee' : 'Resignation'}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {employee.employee_name} ({employee.emp_no}) — {isTermination ? 'Enter termination date and remarks.' : 'Enter last working date and remarks.'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
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

                {success && (
                    <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                        {success}
                    </div>
                )}

                <form onSubmit={onSubmit} className="space-y-4">
                    {allowedToTerminate && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Request Type
                            </label>
                            <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setLeftDateForm({ ...leftDateForm, requestType: 'resignation' })}
                                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${!isTermination
                                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                                        }`}
                                >
                                    Resignation
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLeftDateForm({
                                        ...leftDateForm,
                                        requestType: 'termination',
                                        leftDate: new Date().toISOString().split('T')[0]
                                    })}
                                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${isTermination
                                        ? 'bg-white text-red-600 shadow-sm dark:bg-slate-700 dark:text-red-400'
                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                                        }`}
                                >
                                    Termination
                                </button>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {isTermination ? 'Termination date' : 'Last working date'} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="date"
                            required
                            value={leftDateForm.leftDate}
                            onChange={(e) => setLeftDateForm({ ...leftDateForm, leftDate: e.target.value })}
                            readOnly={!isTermination}
                            min={!isTermination ? (() => {
                                const d = new Date();
                                d.setDate(d.getDate() + resignationNoticePeriodDays);
                                return d.toISOString().split('T')[0];
                            })() : undefined}
                            className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${!isTermination ? 'bg-slate-50 cursor-not-allowed' : ''}`}
                        />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {isTermination
                                ? 'The employee will be deactivated immediately on this date.'
                                : 'They will be included in pay register until this month, then excluded from future months.'}
                        </p>
                        {!isTermination && resignationNoticePeriodDays > 0 && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                Notice period: {resignationNoticePeriodDays} day(s). Last working date must be at least {resignationNoticePeriodDays} days from today.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {isTermination ? 'Remarks for termination' : 'Remarks for resignation'} (Optional)
                        </label>
                        <textarea
                            value={leftDateForm.leftReason}
                            onChange={(e) => setLeftDateForm({ ...leftDateForm, leftReason: e.target.value })}
                            rows={3}
                            placeholder={isTermination ? "Enter reason for termination..." : "Enter remarks for resignation..."}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-all focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className={`rounded-xl bg-gradient-to-r ${isTermination ? 'from-red-600 to-red-700 shadow-red-600/30' : 'from-red-500 to-orange-500 shadow-red-500/30'} px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95`}
                        >
                            {isTermination ? 'Terminate Employee' : 'Submit Resignation'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
