'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Download, Search, Settings, ChevronRight, ArrowLeft, ArrowUpRight, CheckCircle2, XCircle, FileText, ArrowRightCircle, ArrowDownCircle, Briefcase, History } from 'lucide-react';

import { api } from '@/lib/api';
import { toast } from 'react-hot-toast';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFixMe = any;

interface TransactionDetail {
    startDate: string;
    endDate: string;
    leaveType: string;
    transactionType: string;
    days: number;
    openingBalance: number;
    closingBalance: number;
    reason: string;
}

interface MonthlySubLedger {
    month: number;
    year: number;
    casualLeave: {
        openingBalance: number;
        accruedThisMonth: number;
        usedThisMonth: number;
        closingBalance: number;
        balance: number;
        earnedCCL?: number;
        expired?: number;
        carryForward?: number;
    };
    earnedLeave: {
        openingBalance: number;
        accruedThisMonth: number;
        usedThisMonth: number;
        closingBalance: number;
        balance: number;
    };
    compensatoryOff: {
        openingBalance: number;
        earned: number;
        used: number;
        expired: number;
        closingBalance: number;
        balance: number;
    };
    totalPaidBalance: number;
    transactions: TransactionDetail[];
}

interface Employee {
    employeeId: string;
    empNo: string;
    employeeName: string;
    designation: string;
    department: string;
    divisionName: string;
    clBalance: number;
    elBalance: number;
    compensatoryOffBalance: number;
    monthlyCLLimit: number;
    presentMonthAllowedLeaves: number;
    pendingCLThisMonth: number;
    cumulativeLeaves: number;
    yearlySummary?: {
        [key: string]: {
            openingBalance: number;
            totalCredits: number;
            totalDebits: number;
            adjustments: number;
            closingBalance: number;
        };
    };

    monthlySubLedgers?: MonthlySubLedger[];
}

type ViewLevel = 'company' | 'employee_months' | 'month_transactions';

export default function LeaveRegisterPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

    const [elEnabled, setElEnabled] = useState<boolean | null>(null);

    // Drill-down State
    const [viewLevel, setViewLevel] = useState<ViewLevel>('company');
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [selectedMonthLedger, setSelectedMonthLedger] = useState<MonthlySubLedger | null>(null);

    // Modals
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [adjustmentData, setAdjustmentData] = useState({
        employeeId: '', employeeName: '', empNo: '', clBalance: 0, newBalance: '', reason: ''
    });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await api.getLeaveSettings('leave');
                if (!cancelled && res?.success && res.data?.settings?.earnedLeave) {
                    setElEnabled(res.data.settings.earnedLeave.enabled !== false);
                }
            } catch {
                if (!cancelled) setElEnabled(null);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const fetchLeaveRegister = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.getLeaveRegister({ balanceAsOf: true, year: selectedYear });
            
            if (data.success) {
                const responseData = data as unknown as { data?: AnyFixMe[] };
                const formattedEmployees = (responseData.data || []).map((emp: AnyFixMe) => {
                    const employee = emp.employee || {};
                    const subLedgers = emp.monthlySubLedgers || [];
                    const latestLedger = subLedgers.length > 0 ? subLedgers[subLedgers.length - 1] : {};

                    return {
                        employeeId: employee.id || emp.employeeId?._id || emp.employeeId?.id || emp.employeeId,
                        empNo: employee.empNo ?? emp.empNo,
                        employeeName: employee.name ?? emp.employeeName,
                        designation: employee.designation ?? emp.designation,
                        department: employee.department ?? emp.department,
                        divisionName: employee.division ?? emp.divisionName ?? 'N/A',
                        clBalance: latestLedger.casualLeave?.balance ?? 0,
                        elBalance: latestLedger.earnedLeave?.balance ?? 0,
                        compensatoryOffBalance: latestLedger.compensatoryOff?.balance ?? 0,
                        monthlyCLLimit: emp.monthlyCLLimit ?? latestLedger.casualLeave?.monthlyCLLimit ?? 0,
                        presentMonthAllowedLeaves: emp.monthlyAllowedLimit ?? latestLedger.monthlyAllowedLimit ?? ((latestLedger.casualLeave?.allowedRemaining ?? 0) + (latestLedger.compensatoryOff?.balance ?? 0)),
                        pendingCLThisMonth: emp.pendingCLThisMonth ?? latestLedger.casualLeave?.pendingThisMonth ?? 0,

                        cumulativeLeaves: latestLedger.totalPaidBalance ?? 0,
                        yearlySummary: emp.yearlySummary,
                        monthlySubLedgers: emp.monthlySubLedgers
                    };
                });
                setEmployees(formattedEmployees);
            } else {
                toast.error('Failed to fetch leave register');
            }
        } catch (error) {
            console.error('Error fetching leave register:', error);
            toast.error('Error fetching leave register');
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    useEffect(() => {
        if (viewLevel === 'company') {
            fetchLeaveRegister();
        }
    }, [fetchLeaveRegister, viewLevel]);

    const filteredEmployees = useMemo(() => {
        if (!searchTerm.trim()) return employees;
        const term = searchTerm.toLowerCase().trim();
        return employees.filter(emp =>
            (emp.employeeName || '').toLowerCase().includes(term) ||
            (emp.empNo || '').toLowerCase().includes(term) ||
            (emp.department || '').toLowerCase().includes(term)
        );
    }, [employees, searchTerm]);

    // CSV Downloads
    const downloadCSV = (headers: string[], rows: (string|number)[][], filename: string) => {
        const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c ?? ''}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    };

    const exportCompanyCSV = () => {
        const headers = ['Employee Name', 'Emp No', 'Designation', 'Department', 'CL', 'EL', 'Comp Off', 'Total Leaves'];
        const rows = filteredEmployees.map(e => [
            e.employeeName, e.empNo, e.designation, e.department, e.clBalance, e.elBalance, e.compensatoryOffBalance, e.cumulativeLeaves
        ]);
        downloadCSV(headers, rows, `Leave_Register_${selectedYear}.csv`);
        toast.success(`Exported ${filteredEmployees.length} employees`);
    };

    const exportEmployeeMonthsCSV = () => {
        if (!selectedEmployee) return;
        const headers = ['Month', 'CL Op', 'CL Crs', 'CL Dbs', 'CL Cl', 'EL Op', 'EL Crs', 'EL Dbs', 'EL Cl', 'CCL Op', 'CCL Crs', 'CCL Dbs', 'CCL Cl'];
        const rows = (selectedEmployee.monthlySubLedgers || []).map(m => [
            `${new Date(0, m.month - 1).toLocaleString('default', { month: 'short' })} ${m.year}`,
            m.casualLeave.openingBalance, m.casualLeave.accruedThisMonth, m.casualLeave.usedThisMonth, m.casualLeave.closingBalance,
            m.earnedLeave.openingBalance, m.earnedLeave.accruedThisMonth, m.earnedLeave.usedThisMonth, m.earnedLeave.closingBalance,
            m.compensatoryOff.openingBalance, m.compensatoryOff.earned, m.compensatoryOff.used, m.compensatoryOff.closingBalance,
        ]);
        downloadCSV(headers, rows, `${selectedEmployee.employeeName}_Monthly_${selectedYear}.csv`);
        toast.success(`Exported months for ${selectedEmployee.employeeName}`);
    };

    const exportTransactionsCSV = () => {
        if (!selectedEmployee || !selectedMonthLedger) return;
        const monthName = new Date(0, selectedMonthLedger.month - 1).toLocaleString('default', { month: 'long' });
        const headers = ['Date', 'Type', 'Txn', 'Days', 'Opening', 'Closing', 'Reason'];
        const rows = selectedMonthLedger.transactions.map(t => [
            new Date(t.startDate).toLocaleDateString(), t.leaveType, t.transactionType, t.days, t.openingBalance, t.closingBalance, t.reason || 'N/A'
        ]);
        downloadCSV(headers, rows, `${selectedEmployee.employeeName}_Transactions_${monthName}.csv`);
        toast.success(`Exported transactions for ${monthName}`);
    };

    // Drill-down Handlers
    const handleEmployeeClick = async (employee: Employee) => {
        try {
            toast.loading('Loading employee ledger...', { id: 'ledger-load' });
            // Always refetch to ensure we have the most 100% up-to-date monthly data
            const data = await api.getEmployeeRegister(employee.employeeId);
            if (data.success && data.data) {
                setSelectedEmployee({
                    ...employee,
                    monthlySubLedgers: data.data.monthlySubLedgers,
                    yearlySummary: data.data.yearlySummary
                });
                setViewLevel('employee_months');
            } else {
                toast.error('Failed to load employee ledger');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error loading ledger');
        } finally {
            toast.dismiss('ledger-load');
        }
    };

    const handleMonthClick = (ledger: MonthlySubLedger) => {
        setSelectedMonthLedger(ledger);
        setViewLevel('month_transactions');
    };

    // Render Components
    const renderCompanyLevel = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">Company Leave Register</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">High-level overview of employee leave balances for {selectedYear}</p>
                </div>
                <div className="flex items-center gap-3">
                    {elEnabled && (
                        <button
                            onClick={async () => {
                                const res = await api.updateAllEL({ month: new Date().getMonth() + 1, year: selectedYear });
                                if (res.success) {
                                    toast.success('Earned leaves calculated');
                                    fetchLeaveRegister();
                                } else toast.error('Failed to calculate EL');
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/20 rounded-xl transition-colors text-sm font-semibold"
                        >
                            <Settings className="w-4 h-4" /> Calculate EL Cycle
                        </button>
                    )}
                    <button
                        onClick={exportCompanyCSV}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 rounded-xl hover:-translate-y-0.5 transition-all text-sm font-semibold"
                    >
                        <Download className="w-4 h-4" /> Export Summary
                    </button>
                </div>
            </div>

            <section className="bg-white/60 dark:bg-[#1E293B]/60 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-800/50 p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search employees..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-11 pr-4 py-3 w-full rounded-xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-800/50 focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                        />
                    </div>
                    <div className="flex items-center justify-end">
                        <div className="flex items-center gap-2">
                            <div className="relative inline-flex items-center">
                                <Calendar className="absolute left-3.5 text-gray-400 w-4 h-4" />
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                    className="pl-10 pr-10 py-2.5 rounded-xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-800/50 focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-gray-700 dark:text-gray-200 cursor-pointer appearance-none text-sm"
                                >
                                    {Array.from({ length: 12 }, (_, i) => (
                                        <option key={i + 1} value={i + 1}>
                                            {new Date(0, i).toLocaleString('default', { month: 'long' })}
                                        </option>
                                    ))}
                                </select>
                                <ChevronRight className="absolute right-3 w-4 h-4 text-gray-400 pointer-events-none rotate-90" />
                            </div>

                            <div className="relative inline-flex items-center">
                                <Calendar className="absolute left-3.5 text-gray-400 w-4 h-4" />
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                    className="pl-10 pr-10 py-2.5 rounded-xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-800/50 focus:ring-2 focus:ring-indigo-500 transition-all font-bold text-gray-700 dark:text-gray-200 cursor-pointer appearance-none text-sm"
                                >
                                    {[2024, 2025, 2026, 2027].map(year => (
                                        <option key={year} value={year}>{year} Financial Year</option>
                                    ))}
                                </select>
                                <ChevronRight className="absolute right-3.5 w-4 h-4 text-gray-400 pointer-events-none rotate-90" />
                            </div>
                        </div>

                    </div>
                </div>
            </section>

            <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-[#fcfdff] dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800">
                            <tr>
                                <th rowSpan={2} className="px-4 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Employee Info</th>
                                <th colSpan={1} className="px-4 py-2 text-center text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50/20 border-x border-gray-100 dark:border-gray-800">Casual Leave (CL)</th>
                                <th colSpan={1} className="px-4 py-2 text-center text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-50/20 border-r border-gray-100 dark:border-gray-800">Earned Leave (EL)</th>
                                <th colSpan={1} className="px-4 py-2 text-center text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-50/20 border-r border-gray-100 dark:border-gray-800">Comp. Off (CCL)</th>
                                <th rowSpan={2} className="px-4 py-4 text-center text-[11px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50/50 dark:bg-indigo-900/20 border-l border-indigo-100 dark:border-indigo-900/30">Monthly Limit</th>
                                <th rowSpan={2} className="px-4 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                <th className="px-4 py-2 text-[10px] font-medium text-gray-400 text-center uppercase border-x border-gray-100 dark:border-gray-800">Month Ledger • Yearly Audit</th>
                                <th className="px-4 py-2 text-[10px] font-medium text-gray-400 text-center uppercase border-r border-gray-100 dark:border-gray-800">Month Ledger • Yearly Audit</th>
                                <th className="px-4 py-2 text-[10px] font-medium text-gray-400 text-center uppercase border-r border-gray-100 dark:border-gray-800">Month Ledger • Yearly Audit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                            {filteredEmployees.map((emp) => {
                                const selectedSub = emp.monthlySubLedgers?.find(s => s.month === selectedMonth && s.year === selectedYear);

                                
                                const renderLedgerCell = (current: AnyFixMe, yearly: AnyFixMe, accentColor: string) => (



                                    <td className={`p-0 border-r border-gray-100 dark:border-gray-800 align-top`}>
                                        <div className="flex divide-x divide-gray-50 dark:divide-gray-800/50 h-full min-h-[100px]">
                                            {/* Monthly View */}
                                            <div className="flex-1 p-3 bg-white dark:bg-transparent">
                                                <div className="text-[9px] font-bold text-gray-300 uppercase mb-2">Month Ledger</div>
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-[10px]"><span className="text-gray-400">Opening</span><span className="font-semibold text-gray-600">{current?.openingBalance || 0}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-emerald-500 font-medium">CR (+)</span><span className="font-bold text-emerald-600">+{(current?.accruedThisMonth || 0) + (current?.earned || 0) + (current?.earnedCCL || 0)}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-rose-500 font-medium">DR (-)</span><span className="font-bold text-rose-600">-{(current?.usedThisMonth || 0) + (current?.used || 0) + (current?.expired || 0)}</span></div>
                                                    <div className="pt-1 mt-1 border-t border-gray-50 border-dotted flex justify-between items-center text-[11px]">
                                                        <span className="font-bold text-gray-400">Bal</span>
                                                        <span className={`px-1.5 py-0.5 rounded font-black bg-${accentColor}-50 text-${accentColor}-700 dark:bg-${accentColor}-900/30 dark:text-${accentColor}-300 shadow-sm border border-${accentColor}-100 dark:border-${accentColor}-800/50`}>
                                                            {current?.balance || 0}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Yearly View */}
                                            <div className="flex-1 p-3 bg-gray-50/30 dark:bg-gray-800/20">
                                                <div className="text-[9px] font-bold text-gray-300 uppercase mb-2">Yearly Audit</div>
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between text-[10px]"><span className="text-gray-400 text-[9px] uppercase font-bold tracking-tighter">Op</span><span className="font-medium text-gray-400">{yearly?.openingBalance || 0}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-emerald-500 text-[9px] uppercase font-bold tracking-tighter">CR</span><span className="text-emerald-600">+{yearly?.totalCredits || 0}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-rose-500 text-[9px] uppercase font-bold tracking-tighter">DR</span><span className="text-rose-600">-{yearly?.totalDebits || 0}</span></div>
                                                    <div className="flex justify-between text-[10px] border-t border-gray-200/50 dark:border-gray-700 pt-1 mt-1"><span className="text-indigo-500 font-bold text-[9px] uppercase tracking-tighter">Adj</span><span className="font-bold text-indigo-600">{yearly?.adjustments > 0 ? `+${yearly.adjustments}` : yearly?.adjustments || 0}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                );


                                return (
                                    <tr key={emp.employeeId} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition-colors group">
                                        <td className="px-4 py-4 align-top">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm ring-4 ring-indigo-50 dark:ring-indigo-900/20 shrink-0">
                                                    {emp.employeeName?.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-gray-900 dark:text-gray-100 truncate leading-tight mb-1">{emp.employeeName}</div>
                                                    <div className="text-[10px] text-gray-400 font-medium tracking-tight mb-2">ID: {emp.empNo}</div>
                                                    <div className="space-y-1">
                                                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 dark:bg-slate-800 rounded-md text-[9px] text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700">
                                                            <Briefcase size={10} className="text-slate-400" />
                                                            <span className="truncate max-w-[80px]">{emp.designation}</span>
                                                        </div>
                                                        <div className="block text-[9px] text-gray-400 pl-2 border-l-2 border-indigo-100 dark:border-indigo-900">
                                                            {emp.department}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        
                                        {renderLedgerCell(selectedSub?.casualLeave, emp.yearlySummary?.CL, "indigo")}
                                        {renderLedgerCell(selectedSub?.earnedLeave, emp.yearlySummary?.EL, "emerald")}
                                        {renderLedgerCell(selectedSub?.compensatoryOff, emp.yearlySummary?.CCL, "amber")}

                                        <td className="px-4 py-4 text-center align-top bg-indigo-50/30 dark:bg-indigo-900/10 border-l border-indigo-100 dark:border-indigo-900/30">
                                            <div className="flex flex-col items-center justify-center h-full gap-2 pt-2">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-tighter mb-1">Entitlement</span>
                                                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 leading-none">
                                                        {selectedSub?.monthlyAllowedLimit ?? 0}
                                                    </div>
                                                    <span className="text-[9px] text-indigo-400/80 font-medium whitespace-nowrap">Leaves Left</span>
                                                </div>
                                                <div className="w-full h-1.5 bg-indigo-100 dark:bg-indigo-900/50 rounded-full overflow-hidden mt-1">
                                                    <div 
                                                        className="h-full bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]" 
                                                        style={{ width: `${Math.min(100, ((selectedSub?.monthlyAllowedLimit ?? 0) / (selectedSub?.casualLeave?.monthlyCLLimit || 1)) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>


                                        <td className="px-4 py-4 text-center align-top">
                                            <div className="flex flex-col gap-2">
                                                <button 
                                                    onClick={() => handleEmployeeClick(emp)}
                                                    className="p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-lg transition-colors border border-transparent hover:border-indigo-100 shadow-sm bg-white dark:bg-gray-800" title="View Detailed History"
                                                >
                                                    <History size={16} />
                                                </button>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setShowAdjustModal(true); setAdjustmentData(prev => ({...prev, employeeId: emp.employeeId, employeeName: emp.employeeName, empNo: emp.empNo, clBalance: emp.clBalance, newBalance: String(emp.clBalance)})); }}
                                                    className="p-2 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 rounded-lg transition-colors border border-transparent hover:border-emerald-100 shadow-sm bg-white dark:bg-gray-800" title="Manual Adjustment"
                                                >
                                                    <Settings size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {filteredEmployees.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500 font-medium">No employees found matching the current filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );

    const renderEmployeeMonthsLevel = () => {
        if (!selectedEmployee) return null;
        const stats = selectedEmployee.yearlySummary || {};

        return (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-500 fill-mode-both">
                {/* Breadcrumbs & Header */}
                <div className="flex flex-col gap-4">
                    <button onClick={() => setViewLevel('company')} className="self-start flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Back to Company Overview
                    </button>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-500/30">
                                {selectedEmployee.employeeName?.charAt(0)}
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{selectedEmployee.employeeName}</h1>
                                <p className="text-gray-500 dark:text-gray-400 font-medium">{selectedEmployee.designation} • {selectedEmployee.empNo}</p>
                            </div>
                        </div>
                        <button
                            onClick={exportEmployeeMonthsCSV}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 rounded-xl hover:-translate-y-0.5 transition-all text-sm font-semibold"
                        >
                            <Download className="w-4 h-4" /> Export Monthly Data
                        </button>
                    </div>
                </div>

                {/* Yearly Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {[
                        { type: 'CL', label: 'Casual Leave', color: 'indigo', data: stats.CL },
                        { type: 'EL', label: 'Earned Leave', color: 'emerald', data: stats.EL },
                        { type: 'CCL', label: 'Compensatory Off', color: 'amber', data: stats.CCL }
                    ].map(({ type, label, color, data }) => (
                        <div key={type} className={`bg-white dark:bg-[#1E293B] rounded-2xl p-6 border-l-4 border-${color}-500 shadow-sm relative overflow-hidden`}>
                            <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${color}-50 dark:bg-${color}-500/10 rounded-full blur-2xl pointer-events-none`}></div>
                            <h3 className={`text-${color}-600 dark:text-${color}-400 font-bold uppercase tracking-wider text-sm mb-4`}>{label} Yearly Breakdown</h3>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <div className="flex items-center gap-1 text-gray-500 text-xs mb-1 font-medium"><ArrowDownCircle className="w-3 h-3 text-emerald-500" /> Earned</div>
                                    <div className="text-xl font-bold text-gray-900 dark:text-white">{data?.totalCredits || 0}</div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1 text-gray-500 text-xs mb-1 font-medium"><ArrowUpRight className="w-3 h-3 text-rose-500" /> Taken</div>
                                    <div className="text-xl font-bold text-gray-900 dark:text-white">{data?.totalDebits || 0}</div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1 text-gray-500 text-xs mb-1 font-medium"><Settings className="w-3 h-3 text-gray-400" /> Adjustments</div>
                                    <div className="text-xl font-bold text-gray-900 dark:text-white">{data?.adjustments || 0}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Months Grid */}
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 mt-8">Monthly Sub-Ledgers</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {(selectedEmployee.monthlySubLedgers || []).map((m, idx) => {
                        const monthName = new Date(0, m.month - 1).toLocaleString('default', { month: 'long' });
                        return (
                            <div 
                                key={idx} 
                                onClick={() => handleMonthClick(m)}
                                className="group relative bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:shadow-xl hover:border-indigo-500/30 transition-all cursor-pointer overflow-hidden transform hover:-translate-y-1"
                            >
                                <div className="flex items-center justify-between mb-5">
                                    <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <Calendar className="w-5 h-5 text-indigo-500" /> {monthName} {m.year}
                                    </h4>
                                    <div className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-lg">
                                        {m.transactions.length} Txns
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    {/* Casual Leave Accounting */}
                                    <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Casual Leave</span>
                                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">Bal: {m.casualLeave.balance}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                                            <div className="flex flex-col"><span className="text-gray-400">Op</span><span className="font-semibold text-gray-600">{m.casualLeave.openingBalance}</span></div>
                                            <div className="flex flex-col"><span className="text-emerald-500">CR (+)</span><span className="font-bold text-emerald-600">+{m.casualLeave.accruedThisMonth + (m.casualLeave.earnedCCL || 0)}</span></div>
                                            <div className="flex flex-col"><span className="text-rose-500">DR (-)</span><span className="font-bold text-rose-600">-{m.casualLeave.usedThisMonth + (m.casualLeave.expired || 0)}</span></div>
                                        </div>
                                    </div>

                                    {/* Earned Leave Accounting */}
                                    <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Earned Leave</span>
                                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded">Bal: {m.earnedLeave.balance}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                                            <div className="flex flex-col"><span className="text-gray-400">Op</span><span className="font-semibold text-gray-600">{m.earnedLeave.openingBalance}</span></div>
                                            <div className="flex flex-col"><span className="text-emerald-500">CR (+)</span><span className="font-bold text-emerald-600">+{m.earnedLeave.accruedThisMonth}</span></div>
                                            <div className="flex flex-col"><span className="text-rose-500">DR (-)</span><span className="font-bold text-rose-600">-{m.earnedLeave.usedThisMonth}</span></div>
                                        </div>
                                    </div>

                                    {/* Comp Off Accounting */}
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Comp. Off</span>
                                            <span className="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded">Bal: {m.compensatoryOff.balance}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                                            <div className="flex flex-col"><span className="text-gray-400">Op</span><span className="font-semibold text-gray-600">{m.compensatoryOff.openingBalance}</span></div>
                                            <div className="flex flex-col"><span className="text-emerald-500">CR (+)</span><span className="font-bold text-emerald-600">+{m.compensatoryOff.earned}</span></div>
                                            <div className="flex flex-col"><span className="text-rose-500">DR (-)</span><span className="font-bold text-rose-600">-{m.compensatoryOff.used + (m.compensatoryOff.expired || 0)}</span></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                        <ChevronRight className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderTransactionLevel = () => {

        if (!selectedEmployee || !selectedMonthLedger) return null;
        const monthName = new Date(0, selectedMonthLedger.month - 1).toLocaleString('default', { month: 'long' });

        return (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-500 fill-mode-both">
                <div className="flex flex-col gap-4">
                    <button onClick={() => setViewLevel('employee_months')} className="self-start flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Back to Monthly Overview
                    </button>
                    
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                                {monthName} {selectedMonthLedger.year} Transactions
                            </h1>
                            <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">Ledger details for {selectedEmployee.employeeName}</p>
                        </div>
                        <button
                            onClick={exportTransactionsCSV}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 rounded-xl hover:-translate-y-0.5 transition-all text-sm font-semibold"
                        >
                            <Download className="w-4 h-4" /> Export Txns to CSV
                        </button>
                    </div>
                </div>

                <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm mt-6">
                    {selectedMonthLedger.transactions.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-800">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Date Range</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Leave Code</th>
                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Activity</th>
                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Impact</th>
                                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Ledger Math</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-1/4">Reason Context</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                                    {selectedMonthLedger.transactions.map((tx, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400" />
                                                    {new Date(tx.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                                    {tx.endDate && tx.endDate !== tx.startDate && ` - ${new Date(tx.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-left">
                                                <span className={`inline-flex items-center justify-center px-2.5 py-1 text-xs font-bold rounded-lg ${
                                                    tx.leaveType === 'CL' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' :
                                                    tx.leaveType === 'EL' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' :
                                                    'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                                                }`}>{tx.leaveType}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full ${
                                                    tx.transactionType === 'CREDIT' ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20' :
                                                    tx.transactionType === 'DEBIT' ? 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-900/20' :
                                                    'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-900/20'
                                                }`}>
                                                    {tx.transactionType === 'CREDIT' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                                    {tx.transactionType === 'DEBIT' && <XCircle className="w-3.5 h-3.5" />}
                                                    {tx.transactionType === 'ADJUSTMENT' && <Settings className="w-3.5 h-3.5" />}
                                                    {tx.transactionType}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`text-lg font-black ${
                                                    tx.transactionType === 'DEBIT' ? 'text-rose-500' : 'text-emerald-500'
                                                }`}>
                                                    {tx.transactionType === 'DEBIT' ? '-' : '+'}{tx.days}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-center gap-3">
                                                    <span className="text-gray-400 font-medium">{tx.openingBalance}</span>
                                                    <ArrowRightCircle className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                                                    <span className="text-gray-900 dark:text-white font-bold">{tx.closingBalance}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                <div className="flex items-start gap-2 max-w-sm">
                                                    <FileText className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                                                    <span className="truncate group-hover:whitespace-normal group-hover:break-words transition-all duration-300">{tx.reason || 'No description provided'}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 px-4">
                            <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-400">
                                <Calendar className="w-8 h-8 opacity-50" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Activity Found</h3>
                            <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm text-center">There are no leave transactions recorded for {selectedEmployee.employeeName} in {monthName}.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (loading && employees.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-100 dark:border-gray-800 border-t-indigo-600 dark:border-t-indigo-500"></div>
                <p className="text-gray-500 font-medium animate-pulse">Loading Ledger Engine...</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto pb-12">
            {viewLevel === 'company' && renderCompanyLevel()}
            {viewLevel === 'employee_months' && renderEmployeeMonthsLevel()}
            {viewLevel === 'month_transactions' && renderTransactionLevel()}

            {/* Adjust Modal (Kept Simple) */}
            {showAdjustModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-[#1E293B] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Adjust CL Balance</h2>
                            <p className="text-gray-500 text-sm mt-1">{adjustmentData.employeeName} ({adjustmentData.empNo})</p>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl">
                                <span className="font-semibold text-gray-600 dark:text-gray-300">Current Balance</span>
                                <span className="font-bold text-xl text-indigo-600 dark:text-indigo-400">{adjustmentData.clBalance}</span>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">New Target Balance</label>
                                <input type="number" step={0.5} value={adjustmentData.newBalance} onChange={(e) => setAdjustmentData({ ...adjustmentData, newBalance: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Adjustment Reason</label>
                                <textarea value={adjustmentData.reason} onChange={(e) => setAdjustmentData({ ...adjustmentData, reason: e.target.value })} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent" rows={3} placeholder="Why is this balance changing?" />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
                            <button onClick={() => setShowAdjustModal(false)} className="px-5 py-2.5 font-bold text-gray-600 hover:bg-gray-200/50 rounded-xl transition-colors">Cancel</button>
                            <button onClick={async () => {
                                const newBal = parseFloat(adjustmentData.newBalance);
                                if (isNaN(newBal) || newBal < 0 || !adjustmentData.reason.trim()) return toast.error('Invalid input');
                                const res = await api.adjustLeaveBalance({ employeeId: adjustmentData.employeeId, leaveType: 'CL', amount: newBal, transactionType: 'ADJUSTMENT', reason: adjustmentData.reason.trim() });
                                if (res.success) { toast.success('Adjusted'); setShowAdjustModal(false); fetchLeaveRegister(); } else toast.error('Error');
                            }} className="px-5 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md rounded-xl transition-all">Apply Adjustment</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
