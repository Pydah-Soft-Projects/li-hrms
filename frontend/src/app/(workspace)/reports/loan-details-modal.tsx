'use client';

import React from 'react';
import { 
    X, 
    Calendar, 
    User, 
    CreditCard, 
    TrendingUp, 
    DollarSign, 
    CheckCircle2, 
    Clock, 
    FileText, 
    History,
    MessageSquare,
    AlertCircle,
    Building2,
    Briefcase
} from 'lucide-react';
import dayjs from 'dayjs';

interface LoanDetailsModalProps {
    loan: any;
    onClose: () => void;
}

export default function LoanDetailsModal({ loan, onClose }: LoanDetailsModalProps) {
    if (!loan) return null;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
            case 'active':
            case 'disbursed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'rejected': return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
            case 'cancelled': return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
            default: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
                onClick={onClose} 
            />

            {/* Modal Container */}
            <div className="relative z-[110] flex w-full max-w-4xl flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl dark:bg-slate-900 transition-all scale-100 opacity-100">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-8 py-6 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-inner ${
                            loan.requestType === 'loan' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-amber-500/10 text-amber-600'
                        }`}>
                            {loan.requestType === 'loan' ? <CreditCard className="h-6 w-6" /> : <TrendingUp className="h-6 w-6" />}
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                                {loan.requestType === 'loan' ? 'Loan Details' : 'Salary Advance Details'}
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${getStatusColor(loan.status)}`}>
                                    {loan.status}
                                </span>
                            </h2>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Ref: {loan._id?.toString().slice(-8).toUpperCase()}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="rounded-2xl p-3 text-slate-400 hover:bg-white hover:text-slate-600 hover:shadow-sm dark:hover:bg-slate-800 transition-all"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto p-8 max-h-[75vh]">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                        {/* Financial Cards */}
                        <div className="p-5 rounded-3xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/30">
                            <div className="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3">
                                <DollarSign className="h-3 w-3" />
                                Principal
                            </div>
                            <div className="text-2xl font-black text-slate-900 dark:text-white">
                                {formatCurrency(loan.amount)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold mt-1">Requested Amount</div>
                        </div>

                        <div className="p-5 rounded-3xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100/50 dark:border-emerald-800/30">
                            <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3">
                                <CheckCircle2 className="h-3 w-3" />
                                Recovered
                            </div>
                            <div className="text-2xl font-black text-slate-900 dark:text-white">
                                {formatCurrency(loan.repayment?.totalPaid || 0)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold mt-1">Total Paid So Far</div>
                        </div>

                        <div className="p-5 rounded-3xl bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100/50 dark:border-rose-800/30">
                            <div className="flex items-center gap-2 text-[10px] font-black text-rose-500 uppercase tracking-widest mb-3">
                                <AlertCircle className="h-3 w-3" />
                                Outstanding
                            </div>
                            <div className="text-2xl font-black text-slate-900 dark:text-white">
                                {formatCurrency(loan.repayment?.remainingBalance || 0)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold mt-1">Pending Balance</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        {/* Left Column: Details */}
                        <div className="space-y-8">
                            {/* Applicant Section */}
                            <section>
                                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <User className="h-4 w-4 text-indigo-500" />
                                    Applicant Information
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Name</p>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{loan.employeeId?.employee_name || 'N/A'}</p>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Emp No</p>
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{loan.employeeId?.emp_no || loan.emp_no}</p>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Division</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <Building2 className="h-3 w-3 text-slate-400" />
                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{loan.division_id?.name || 'N/A'}</p>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Department</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <Briefcase className="h-3 w-3 text-slate-400" />
                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{loan.department?.name || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Loan Config Section */}
                            <section>
                                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-indigo-500" />
                                    Loan Configuration
                                </h3>
                                <div className="p-6 rounded-3xl border border-slate-100 dark:border-slate-800 space-y-4">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Duration</span>
                                        <span className="font-black text-slate-900 dark:text-white">{loan.duration} Months</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Interest Rate</span>
                                        <span className="font-black text-slate-900 dark:text-white">{loan.loanConfig?.interestRate || 0}%</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Total Interest</span>
                                        <span className="font-black text-emerald-600">{formatCurrency(loan.loanConfig?.totalInterest || 0)}</span>
                                    </div>
                                    <div className="pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex justify-between items-center text-sm">
                                        <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-widest">Total Payable</span>
                                        <span className="text-base font-black text-indigo-600">{formatCurrency(loan.amount + (loan.loanConfig?.totalInterest || 0))}</span>
                                    </div>
                                </div>
                            </section>

                            {/* Applied Reason Section */}
                            <section>
                                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-indigo-500" />
                                    Purpose & Reason
                                </h3>
                                <div className="p-6 rounded-3xl bg-slate-50/50 dark:bg-slate-800/30 text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed italic border-l-4 border-indigo-500">
                                    "{loan.reason || 'No reason provided'}"
                                </div>
                            </section>
                        </div>

                        {/* Right Column: Timeline & Workflow */}
                        <div className="space-y-8">
                            <section>
                                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <History className="h-4 w-4 text-indigo-500" />
                                    Approval Timeline
                                </h3>
                                <div className="space-y-6 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
                                    {/* Application Step */}
                                    <div className="relative pl-10">
                                        <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center border-2 border-white dark:border-slate-900 text-emerald-600">
                                            <CheckCircle2 className="h-3 w-3" />
                                        </div>
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tighter">Application Submitted</h4>
                                            <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{dayjs(loan.appliedAt).format('DD MMM, YYYY')}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 font-bold mb-3">By {loan.employeeId?.employee_name || 'Employee'}</p>
                                    </div>

                                    {/* History Steps */}
                                    {loan.workflow?.history?.filter((h: any) => h.action !== 'submitted').reverse().map((step: any, i: number) => (
                                        <div key={i} className="relative pl-10">
                                            <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center border-2 border-white dark:border-slate-900 text-blue-600 shadow-sm">
                                                <History className="h-3 w-3" />
                                            </div>
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tighter">{step.step} - {step.action}</h4>
                                                <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{dayjs(step.timestamp).format('DD MMM, HH:mm')}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 font-bold mb-2">By {step.actionByName || 'System'}</p>
                                            
                                            {step.comments && (
                                                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-600 dark:text-slate-400 flex items-start gap-2 border border-slate-100 dark:border-slate-800">
                                                    <MessageSquare className="h-3 w-3 mt-0.5 text-slate-300" />
                                                    <p>{step.comments}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Current/Next Step */}
                                    {['pending', 'hod_approved', 'manager_approved', 'hr_approved'].includes(loan.status) && (
                                        <div className="relative pl-10 pb-2">
                                            <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center border-2 border-white dark:border-slate-900 text-amber-600 animate-pulse shadow-sm">
                                                <Clock className="h-3 w-3" />
                                            </div>
                                            <div className="mb-1">
                                                <h4 className="text-xs font-black text-amber-600 uppercase tracking-tighter">Awaiting {loan.workflow?.nextApprover?.toUpperCase() || 'Next Approval'}</h4>
                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Status: {loan.status.replace('_', ' ')}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Disbursement Step */}
                                    {(loan.status === 'disbursed' || loan.status === 'active' || loan.status === 'completed') && (
                                        <div className="relative pl-10">
                                            <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center border-2 border-white dark:border-slate-900 text-emerald-600 shadow-sm">
                                                <CreditCard className="h-3 w-3" />
                                            </div>
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className="text-xs font-black text-emerald-600 uppercase tracking-tighter">Funds Disbursed</h4>
                                                <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">
                                                    {loan.disbursement?.disbursedAt ? dayjs(loan.disbursement.disbursedAt).format('DD MMM, YYYY') : ''}
                                                </span>
                                            </div>
                                            {loan.disbursement?.transactionReference && (
                                                <p className="text-[10px] text-slate-500 font-bold mb-1">Ref: {loan.disbursement.transactionReference}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex gap-4 p-8 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
                    <button 
                        onClick={onClose}
                        className="flex-1 rounded-[1.5rem] bg-white border border-slate-200 px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400"
                    >
                        Close
                    </button>
                    <button 
                        onClick={() => window.print()}
                        className="flex-1 rounded-[1.5rem] bg-indigo-600 px-6 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 hover:shadow-indigo-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        <FileText className="h-4 w-4" />
                        Print Summary
                    </button>
                </div>
            </div>
        </div>
    );
}
