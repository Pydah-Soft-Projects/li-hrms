'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, Department, Division, Employee, Designation, EmployeeGroup } from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import {
    Search,
    Download,
    Loader2,
    LayoutGrid,
    List,
    ChevronRight,
    Filter,
    X,
    Wallet,
    Undo2,
    PieChart,
    TrendingUp,
    Coins,
    Calendar,
    Users,
    AlertTriangle,
    Banknote,
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import LoanDetailsModal from './loan-details-modal';

interface LoanSummary {
    id: string;
    name: string;
    distributed: number;
    recovered: number;
    outstanding: number;
    interest: number;
    count: number;
    activeCount?: number;
    completedCount?: number;
}

interface PeriodStats {
    approvedCount: number;
    disbursedCount: number;
    disbursedAmount: number;
    recoveredInPeriod: number;
}

interface PayPeriodStats {
    totalEmiDue?: number;
    totalAdvanceDue?: number;
    totalDue?: number;
    employeeCount?: number;
    payPeriodMonth?: string;
    scheduledEmi?: number;
    recoveredEmi?: number;
    scheduledAdvance?: number;
    recoveredAdvance?: number;
    shortfallTotal?: number;
    underpaidEmployees?: {
        emp_no: string;
        employee_name: string;
        scheduledEmi: number;
        recoveredEmi: number;
        scheduledAdvance: number;
        recoveredAdvance: number;
        shortfall: number;
    }[];
}

interface PersonalStats {
    totalCount: number;
    activeCount: number;
    completedCount: number;
    totalDistributed: number;
    totalRecovered: number;
    totalOutstanding: number;
    totalInterestOnLoans?: number;
    interestPaid?: number;
    currentPeriodEmi?: number;
    currentPeriodAdvanceDue?: number;
    payPeriodMonth?: string;
    period?: PeriodStats;
}

interface LoanRecord {
    _id: string;
    emp_no: string;
    employeeId: {
        emp_no: string;
        employee_name: string;
        designation_id?: { name: string };
        designation?: { name: string };
        leftDate?: string;
    };
    requestType: 'loan' | 'salary_advance';
    amount: number;
    loanConfig?: {
        interestRate: number;
        totalInterest: number;
        totalAmount: number;
    };
    repayment: {
        totalPaid: number;
        remainingBalance: number;
        status: string;
    };
    status: string;
    appliedAt: string;
    disbursement?: {
        disbursedAt: string;
    };
    department?: { name: string };
    division_id?: { name: string };
}

export default function LoanReportsTab({ 
    defaultRequestType = 'loan' 
}: { 
    defaultRequestType?: 'loan' | 'salary_advance' 
}) {
    const isSpecialized = !!defaultRequestType;
    const [loading, setLoading] = useState(false);
    const [fetchingFilters, setFetchingFilters] = useState(false);
    const [records, setRecords] = useState<LoanRecord[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);

    // View & Tab states
    const [viewMode, setViewMode] = useState<'detailed' | 'abstract'>('abstract');
    const [abstractGroupBy, setAbstractGroupBy] = useState<'division' | 'department' | 'designation' | 'employee_group' | 'employee'>('division');
    
    // Pagination states
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [limit] = useState(50);
    const [reportStats, setReportStats] = useState({
        totalDistributed: 0,
        totalRecovered: 0,
        totalOutstanding: 0,
        totalInterest: 0,
        activeCount: 0,
        completedCount: 0,
        totalCount: 0,
        activeOutstandingInterest: 0,
    });
    const [periodStats, setPeriodStats] = useState<PeriodStats>({
        approvedCount: 0,
        disbursedCount: 0,
        disbursedAmount: 0,
        recoveredInPeriod: 0,
    });
    const [payPeriod, setPayPeriod] = useState<{
        current?: PayPeriodStats;
        last?: PayPeriodStats;
        currentPayMonth?: string;
        lastPayMonth?: string;
    }>({});
    const [personalStats, setPersonalStats] = useState<PersonalStats | null>(null);

    // Filter states
    const [divisionIds, setDivisionIds] = useState<string[]>([]);
    const [departmentIds, setDepartmentIds] = useState<string[]>([]);
    const [employeeIds, setEmployeeIds] = useState<string[]>([]);
    const [designationIds, setDesignationIds] = useState<string[]>([]);
    const [employeeGroupIds, setEmployeeGroupIds] = useState<string[]>([]);
    const [requestType, setRequestType] = useState<string>(defaultRequestType || '');
    const [status, setStatus] = useState<string>('');

    // Date filters
    const [dateMode, setDateMode] = useState<'pay_cycle' | 'monthly' | 'range'>('pay_cycle');
    const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
    const [endDate, setEndDate] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
    const [payrollStartDay, setPayrollStartDay] = useState<number>(1);

    // Export modal
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf'>('pdf');
    const [exportMode, setExportMode] = useState<'detailed' | 'summary'>('detailed');
    const [exportGroupBy, setExportGroupBy] = useState<string>('division');
    
    // Drill-down states
    const [drilldownLevel, setDrilldownLevel] = useState<'all' | 'division' | 'department' | 'employee'>('all');
    const [summaries, setSummaries] = useState<LoanSummary[]>([]);
    const [selectedLoan, setSelectedLoan] = useState<LoanRecord | null>(null);

    const effectiveDates = useMemo(() => {
        if (dateMode === 'monthly') {
            const start = dayjs(`${selectedYear}-${selectedMonth}-01`).format('YYYY-MM-DD');
            const end = dayjs(`${selectedYear}-${selectedMonth}-01`).endOf('month').format('YYYY-MM-DD');
            return { start, end };
        }
        if (dateMode === 'pay_cycle') {
            const startDay = payrollStartDay;
            const year = parseInt(selectedYear);
            const month = parseInt(selectedMonth);
            if (startDay === 1) {
                return {
                    start: dayjs(`${year}-${month}-01`).format('YYYY-MM-DD'),
                    end: dayjs(`${year}-${month}-01`).endOf('month').format('YYYY-MM-DD'),
                };
            }
            const currentMonthStart = dayjs(`${year}-${month}-${startDay}`);
            const prevMonthStart = currentMonthStart.subtract(1, 'month');
            return {
                start: prevMonthStart.format('YYYY-MM-DD'),
                end: currentMonthStart.subtract(1, 'day').format('YYYY-MM-DD'),
            };
        }
        return { start: startDate, end: endDate };
    }, [dateMode, selectedYear, selectedMonth, payrollStartDay, startDate, endDate]);

    const buildReportParams = useCallback((pageToLoad: number = page) => {
        let groupBy: string | undefined;
        if (viewMode === 'abstract') {
            if (drilldownLevel === 'all') groupBy = abstractGroupBy;
            else if (drilldownLevel === 'division') groupBy = 'department';
            else if (drilldownLevel === 'department') groupBy = 'employee';
        }

        return {
            page: pageToLoad,
            limit,
            groupBy,
            divisionId: divisionIds.join(','),
            departmentId: departmentIds.join(','),
            employeeId: employeeIds.join(','),
            designationId: designationIds.join(','),
            employeeGroupId: employeeGroupIds.join(','),
            requestType: requestType || undefined,
            status: status || undefined,
            startDate: effectiveDates.start,
            endDate: effectiveDates.end,
        };
    }, [page, limit, viewMode, drilldownLevel, abstractGroupBy, divisionIds, departmentIds, employeeIds, designationIds, employeeGroupIds, requestType, status, effectiveDates.start, effectiveDates.end]);

    const loadReport = useCallback(async (pageToLoad: number = page) => {
        setLoading(true);
        try {
            const response = await api.getLoanReportSummary(buildReportParams(pageToLoad));
            if (response.success) {
                setRecords(response.data || []);
                setTotalPages(response.totalPages || 1);
                setTotalCount(response.total || 0);
                setSummaries(response.summaries || []);
                if (response.stats) setReportStats(response.stats);
                if (response.periodStats) setPeriodStats(response.periodStats);
                if (response.payPeriod) setPayPeriod(response.payPeriod);
                setPersonalStats(response.personalStats || null);
            } else {
                toast.error(response.message || 'Failed to load report');
            }
        } catch (error) {
            console.error('Error loading loan report:', error);
            toast.error('Error loading report');
        } finally {
            setLoading(false);
        }
    }, [buildReportParams, page]);

    useEffect(() => {
        loadInitialFilters();
    }, []);

    useEffect(() => {
        loadReport(1);
    }, [loadReport]);

    const loadInitialFilters = async () => {
        setFetchingFilters(true);
        try {
            const [divRes, desRes, grpRes, settingRes] = await Promise.all([
                api.getDivisions(true),
                api.getAllDesignations(),
                api.getEmployeeGroups(true),
                api.getSetting('payroll_cycle_start_day'),
            ]);
            if (divRes.success) setDivisions(divRes.data || []);
            if (desRes.success) setDesignations(desRes.data || []);
            if (grpRes.success) setEmployeeGroups(grpRes.data || []);
            if (settingRes?.success && settingRes.data?.value) {
                setPayrollStartDay(parseInt(settingRes.data.value));
            }
        } catch (error) {
            console.error('Error loading initial filters:', error);
        } finally {
            setFetchingFilters(false);
        }
    };

    const handleDivisionChange = async (ids: string[]) => {
        setDivisionIds(ids);
        setDepartmentIds([]);
        setEmployeeIds([]);
        setDepartments([]);
        setEmployees([]);

        if (ids.length > 0) {
            setDrilldownLevel('division');
            const selectedDivs = divisions.filter(d => ids.includes(d._id));
            const allDepts: Department[] = [];
            
            selectedDivs.forEach(div => {
                if (div.departments && Array.isArray(div.departments)) {
                    div.departments.forEach(dept => {
                        if (typeof dept === 'object' && dept !== null) {
                            if (dept.isActive !== false) {
                                allDepts.push(dept as Department);
                            }
                        }
                    });
                }
            });

            const uniqueDepts = Array.from(new Map(allDepts.map(item => [item._id, item])).values());
            const sortedDepts = uniqueDepts.sort((a, b) => a.name.localeCompare(b.name));
            setDepartments(sortedDepts);
        } else {
            setDrilldownLevel('all');
        }
    };

    const handleDepartmentChange = async (ids: string[]) => {
        setDepartmentIds(ids);
        setEmployeeIds([]);
        setEmployees([]);

        if (ids.length > 0) {
            setDrilldownLevel('department');
            try {
                const res = await api.getEmployeesSummary({
                    department_ids: ids.join(','),
                    is_active: true,
                    limit: 5000,
                    page: 1,
                });
                if (res.success) {
                    setEmployees(res.data || []);
                } else {
                    setEmployees([]);
                }
            } catch (error) {
                console.error('Error loading employees:', error);
            }
        } else {
            setDrilldownLevel(divisionIds.length === 0 ? 'all' : 'division');
        }
    };

    const handleExport = async (format: 'xlsx' | 'pdf' = 'xlsx', options?: { exportMode?: string; groupBy?: string }) => {
        const toastId = toast.loading(`Preparing your ${format.toUpperCase()} report...`);
        try {
            const params: any = {
                ...buildReportParams(1),
                exportMode: options?.exportMode || exportMode,
                groupBy: options?.groupBy || (exportMode === 'summary' ? exportGroupBy : undefined),
            };
            delete params.page;
            delete params.limit;

            let blob;
            if (format === 'xlsx') {
                blob = await api.exportLoanReport(params);
            } else {
                blob = await api.exportLoanReportPDF(params);
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const fileNamePrefix = requestType === 'salary_advance' ? 'salary_advance' : 'loan';
            const scopeSuffix = exportMode === 'summary' ? `_${exportGroupBy}` : employeeIds.length === 1 ? '_personal' : '';
            a.download = `${fileNamePrefix}_report${scopeSuffix}_${effectiveDates.start}_to_${effectiveDates.end}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            setShowExportModal(false);
            toast.success(`${format.toUpperCase()} report downloaded successfully`, { id: toastId });
        } catch (error: any) {
            console.error('Export error:', error);
            toast.error(error.message || 'Export failed', { id: toastId });
        }
    };

    const navigateTo = (level: 'all' | 'division' | 'department' | 'employee', id?: string) => {
        if (level === 'employee') {
            setViewMode('detailed');
            if (id) setEmployeeIds([id]);
            setDrilldownLevel('employee');
        } else {
            setViewMode('abstract');
            if (level === 'all') {
                setDivisionIds([]);
                setDepartmentIds([]);
                setEmployeeIds([]);
                setDrilldownLevel('all');
            } else if (level === 'division') {
                if (id) {
                    setDivisionIds([id]);
                    handleDivisionChange([id]);
                }
                setDepartmentIds([]);
                setEmployeeIds([]);
                setDrilldownLevel('division');
            } else if (level === 'department') {
                if (id) {
                    setDepartmentIds([id]);
                    handleDepartmentChange([id]);
                }
                setEmployeeIds([]);
                setDrilldownLevel('department');
            }
        }
        setPage(1);
    };

    const getBreadcrumbs = () => {
        const baseLabel = requestType === 'salary_advance' ? 'Salary Advances' : 'Loans Report';
        const items = [{ label: baseLabel, level: 'all', id: 'all' }];
        if (divisionIds.length === 1) {
            const div = divisions.find(d => d._id === divisionIds[0]);
            items.push({ label: div?.name || 'Division', level: 'division', id: divisionIds[0] });
        }
        if (departmentIds.length === 1) {
            const dept = departments.find(d => d._id === departmentIds[0]);
            items.push({ label: dept?.name || 'Department', level: 'department', id: departmentIds[0] });
        }
        if (employeeIds.length === 1) {
            items.push({ label: 'Employee Detail', level: 'employee', id: employeeIds[0] });
        }
        return items;
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    function renderAbstractView() {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all duration-300">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-between items-center">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
                        {drilldownLevel === 'all'
                            ? `Summary by ${abstractGroupBy.replace('_', ' ')}`
                            : drilldownLevel === 'division'
                                ? 'Summary by Department'
                                : 'Summary by Employee'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Double-click row to drill-down</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {drilldownLevel === 'all'
                                        ? abstractGroupBy.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
                                        : (drilldownLevel === 'division' ? 'Department' : 'Employee')}
                                </th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Distributed</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Recovered</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Outstanding</th>
                                {requestType !== 'salary_advance' && <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Interest</th>}
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Active</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Closed</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Count</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading && summaries.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                                        <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Gathering Stats...</p>
                                    </td>
                                </tr>
                            ) : summaries.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-20 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        No data found
                                    </td>
                                </tr>
                            ) : summaries.map((item) => (
                                <tr
                                    key={item.id}
                                    className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer select-none"
                                    onDoubleClick={() => {
                                        if (abstractGroupBy === 'division' && drilldownLevel === 'all') navigateTo('division', item.id);
                                        else if (drilldownLevel === 'division') navigateTo('department', item.id);
                                        else if (drilldownLevel === 'department' || abstractGroupBy === 'employee') navigateTo('employee', item.id);
                                        else if (abstractGroupBy === 'designation') setDesignationIds([item.id]);
                                        else if (abstractGroupBy === 'employee_group') setEmployeeGroupIds([item.id]);
                                    }}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 font-black text-[10px]">
                                                {drilldownLevel === 'all' ? 'DIV' : (drilldownLevel === 'division' ? 'DEPT' : 'EMP')}
                                            </div>
                                            <span className="text-xs font-black text-slate-900 dark:text-white group-hover:translate-x-1 transition-transform">{item.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-right text-xs font-bold text-slate-900 dark:text-white">
                                        {formatCurrency(item.distributed)}
                                    </td>
                                    <td className="px-4 py-4 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(item.recovered)}
                                    </td>
                                    <td className="px-4 py-4 text-right text-xs font-bold text-rose-600 dark:text-rose-400">
                                        {formatCurrency(item.outstanding)}
                                    </td>
                                    {requestType !== 'salary_advance' && (
                                        <td className="px-4 py-4 text-right text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                            {formatCurrency(item.interest)}
                                        </td>
                                    )}
                                    <td className="px-4 py-4 text-center text-xs font-bold text-blue-600">{item.activeCount ?? 0}</td>
                                    <td className="px-4 py-4 text-center text-xs font-bold text-emerald-600">{item.completedCount ?? 0}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {item.count}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    function renderDetailedView() {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-200 dark:bg-slate-800/30 dark:border-slate-800">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Employee</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Amount</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Recovered</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Balance</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
                                        <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Updating Records...</p>
                                    </td>
                                </tr>
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        No data found
                                    </td>
                                </tr>
                            ) : (
                                records.map((loan) => (
                                    <tr 
                                        key={loan._id} 
                                        onClick={() => setSelectedLoan(loan)}
                                        className="hover:bg-indigo-50/50 transition-all dark:hover:bg-indigo-900/20 cursor-pointer group"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="min-w-0" title={[String(loan.employeeId?.employee_name || 'N/A' || '—'), ((typeof loan.employeeId?.designation_id === 'object' && loan.employeeId?.designation_id?.name) ? String(loan.employeeId.designation_id.name) : (typeof loan.employeeId?.designation === 'object' && loan.employeeId?.designation?.name) ? String(loan.employeeId.designation.name) : ''), String(loan.employeeId?.emp_no || '')].filter(Boolean).join(' · ')}>
  <div className={`font-semibold truncate text-slate-900 dark:text-white text-sm`}>
    {loan.employeeId?.employee_name || 'N/A' || '—'}
  </div>
  {((typeof loan.employeeId?.designation_id === 'object' && loan.employeeId?.designation_id?.name) ? String(loan.employeeId.designation_id.name) : (typeof loan.employeeId?.designation === 'object' && loan.employeeId?.designation?.name) ? String(loan.employeeId.designation.name) : '') ? (
    <div className="mt-1 truncate text-[9px] font-medium italic text-slate-600 dark:text-slate-400">
      {((typeof loan.employeeId?.designation_id === 'object' && loan.employeeId?.designation_id?.name) ? String(loan.employeeId.designation_id.name) : (typeof loan.employeeId?.designation === 'object' && loan.employeeId?.designation?.name) ? String(loan.employeeId.designation.name) : '')}
    </div>
  ) : null}
  {loan.employeeId?.emp_no ? (
    <div className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400">{loan.employeeId?.emp_no}</div>
  ) : null}
  {loan.employeeId?.leftDate ? (
    <div className="mt-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
      Left{' '}
      {new Date(loan.employeeId.leftDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
    </div>
  ) : null}
</div>
                                            <p className="text-[10px] text-slate-400 font-bold mt-0.5">{loan.employeeId?.emp_no || loan.emp_no}</p>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                                                loan.requestType === 'loan' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30'
                                            }`}>
                                                {loan.requestType === 'loan' ? 'Loan' : 'Advance'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-right text-xs font-black text-slate-900 dark:text-white">
                                            {formatCurrency(loan.amount)}
                                        </td>
                                        <td className="px-4 py-4 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                            {formatCurrency(loan.repayment?.totalPaid || 0)}
                                        </td>
                                        <td className="px-4 py-4 text-right text-xs font-bold text-rose-600 dark:text-rose-400">
                                            {formatCurrency(loan.repayment?.remainingBalance || 0)}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                                                loan.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
                                                loan.status === 'active' || loan.status === 'disbursed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' :
                                                'bg-slate-100 text-slate-700 dark:bg-slate-800'
                                            }`}>
                                                {loan.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                                            {loan.disbursement?.disbursedAt ? dayjs(loan.disbursement.disbursedAt).format('DD MMM YYYY') : dayjs(loan.appliedAt).format('DD MMM YYYY')}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-200 flex items-center justify-between dark:bg-slate-800/30 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        Total Records: {totalCount}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1 || loading}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-slate-200 rounded-xl hover:bg-white disabled:opacity-50 transition-all dark:border-slate-700 dark:text-slate-300"
                        >
                            Prev
                        </button>
                        <span className="text-xs font-black text-slate-900 dark:text-white">{page} / {totalPages}</span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || loading}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-slate-200 rounded-xl hover:bg-white disabled:opacity-50 transition-all dark:border-slate-700 dark:text-slate-300"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col space-y-8 animate-in fade-in duration-500">
            {/* Header section with breadcrumbs and actions */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        {getBreadcrumbs().map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                                <button
                                    onClick={() => navigateTo(item.level as any, item.id === 'all' ? undefined : item.id)}
                                    className={`hover:text-indigo-600 transition-colors ${idx === getBreadcrumbs().length - 1 ? 'text-indigo-600' : ''}`}
                                >
                                    {item.label}
                                </button>
                            </div>
                        ))}
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {requestType === 'salary_advance' ? 'Salary Advance Analytics' : 'Loan Analytics'}
                    </h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setViewMode('abstract')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'abstract' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <LayoutGrid className="h-4 w-4" />
                            Summary
                        </button>
                        <button
                            onClick={() => setViewMode('detailed')}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'detailed' ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <List className="h-4 w-4" />
                            Detailed
                        </button>
                    </div>

                    <div className="h-10 w-px bg-slate-200 dark:bg-slate-800 mx-2 hidden xl:block" />

                    <button
                        onClick={() => { setExportFormat('xlsx'); setShowExportModal(true); }}
                        className="h-11 px-5 rounded-2xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-emerald-100 dark:shadow-none hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95"
                    >
                        <Download className="h-4 w-4" />
                        Export XLSX
                    </button>
                    <button
                        onClick={() => { setExportFormat('pdf'); setShowExportModal(true); }}
                        className="h-11 px-5 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-rose-100 dark:shadow-none hover:bg-rose-700 transition-all flex items-center gap-2 active:scale-95"
                    >
                        <Download className="h-4 w-4" />
                        Export PDF
                    </button>
                </div>
            </div>

            {/* Period banner */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50">
                <Calendar className="h-4 w-4 text-indigo-600" />
                <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest">
                    Report Period: {dayjs(effectiveDates.start).format('DD MMM YYYY')} – {dayjs(effectiveDates.end).format('DD MMM YYYY')}
                </span>
                {payPeriod.currentPayMonth && (
                    <span className="text-[10px] font-bold text-slate-500 ml-auto">
                        Current Pay Period: {payPeriod.currentPayMonth}
                    </span>
                )}
            </div>

            {/* Lifetime Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <Banknote className="h-24 w-24 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Distributed</p>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(reportStats.totalDistributed)}</h3>
                    <div className="mt-4 flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Active Disbursals</span>
                    </div>
                </div>
                <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <Undo2 className="h-24 w-24 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Recovered</p>
                    <h3 className="text-2xl font-black text-emerald-600">{formatCurrency(reportStats.totalRecovered)}</h3>
                    <div className="mt-4 flex items-center gap-2">
                        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tight">
                            {reportStats.totalDistributed > 0 ? ((reportStats.totalRecovered / reportStats.totalDistributed) * 100).toFixed(1) : '0.0'}% Recovery
                        </span>
                    </div>
                </div>
                <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-rose-500/5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <PieChart className="h-24 w-24 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Outstanding</p>
                    <h3 className="text-2xl font-black text-rose-600">{formatCurrency(reportStats.totalOutstanding)}</h3>
                    <div className="mt-4 flex items-center gap-2">
                        <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tight">Pending Principal</span>
                    </div>
                </div>
                
                {requestType === 'salary_advance' ? (
                    <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                            <Coins className="h-24 w-24 text-slate-900 dark:text-white" />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active / Closed</p>
                        <h3 className="text-2xl font-black text-amber-600">{reportStats.activeCount} / {reportStats.completedCount}</h3>
                        <div className="mt-4 flex items-center gap-2">
                            <span className="text-[9px] font-bold text-amber-500 uppercase tracking-tight">{reportStats.totalCount} total advances</span>
                        </div>
                    </div>
                ) : (
                    <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 dark:bg-slate-900 dark:border-slate-800 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                            <TrendingUp className="h-24 w-24 text-slate-900 dark:text-white" />
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Interest Due</p>
                        <h3 className="text-2xl font-black text-indigo-600">{formatCurrency(reportStats.activeOutstandingInterest || 0)}</h3>
                        <div className="mt-4 flex items-center gap-2">
                            <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tight">{reportStats.activeCount} active · {reportStats.completedCount} closed</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Period Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-violet-50 dark:bg-violet-950/20 rounded-2xl p-4 border border-violet-100 dark:border-violet-900/30">
                    <p className="text-[9px] font-black text-violet-500 uppercase tracking-widest">Approved (Period)</p>
                    <p className="text-xl font-black text-violet-700 dark:text-violet-300 mt-1">{periodStats.approvedCount}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-2xl p-4 border border-purple-100 dark:border-purple-900/30">
                    <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest">Disbursed (Period)</p>
                    <p className="text-xl font-black text-purple-700 dark:text-purple-300 mt-1">{periodStats.disbursedCount}</p>
                    <p className="text-[9px] font-bold text-purple-400 mt-0.5">{formatCurrency(periodStats.disbursedAmount)}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-900/30">
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Recovered (Period)</p>
                    <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{formatCurrency(periodStats.recoveredInPeriod)}</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-950/20 rounded-2xl p-4 border border-rose-100 dark:border-rose-900/30">
                    <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">To Recover</p>
                    <p className="text-xl font-black text-rose-700 dark:text-rose-300 mt-1">{formatCurrency(reportStats.totalOutstanding)}</p>
                </div>
            </div>

            {/* Pay Period EMI / Advance Recovery */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:bg-slate-900 dark:border-slate-800">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                        <Wallet className="h-4 w-4 text-amber-500" />
                        Current Pay Period — {payPeriod.current?.payPeriodMonth || payPeriod.currentPayMonth || '—'}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        {requestType !== 'salary_advance' && (
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Total EMI Due</p>
                                <p className="text-lg font-black text-slate-900 dark:text-white">{formatCurrency(payPeriod.current?.totalEmiDue || 0)}</p>
                            </div>
                        )}
                        {requestType !== 'loan' && (
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Advance Due</p>
                                <p className="text-lg font-black text-amber-600">{formatCurrency(payPeriod.current?.totalAdvanceDue || 0)}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Employees</p>
                            <p className="text-lg font-black text-indigo-600">{payPeriod.current?.employeeCount || 0}</p>
                        </div>
                    </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:bg-slate-900 dark:border-slate-800">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                        <Undo2 className="h-4 w-4 text-emerald-500" />
                        Last Pay Period — {payPeriod.last?.payPeriodMonth || payPeriod.lastPayMonth || '—'}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        {requestType !== 'salary_advance' && (
                            <>
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">EMI Scheduled</p>
                                    <p className="text-lg font-black text-slate-900 dark:text-white">{formatCurrency(payPeriod.last?.scheduledEmi || 0)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">EMI Recovered</p>
                                    <p className="text-lg font-black text-emerald-600">{formatCurrency(payPeriod.last?.recoveredEmi || 0)}</p>
                                </div>
                            </>
                        )}
                        {requestType !== 'loan' && (
                            <>
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Advance Scheduled</p>
                                    <p className="text-lg font-black text-slate-900 dark:text-white">{formatCurrency(payPeriod.last?.scheduledAdvance || 0)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Advance Recovered</p>
                                    <p className="text-lg font-black text-emerald-600">{formatCurrency(payPeriod.last?.recoveredAdvance || 0)}</p>
                                </div>
                            </>
                        )}
                        <div className="col-span-2">
                            <p className="text-[9px] font-bold text-rose-400 uppercase flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Shortfall
                            </p>
                            <p className="text-lg font-black text-rose-600">{formatCurrency(payPeriod.last?.shortfallTotal || 0)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Personal Stats (when single employee selected) */}
            {personalStats && employeeIds.length === 1 && (
                <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-6 dark:bg-indigo-950/20 dark:border-indigo-800">
                    <h3 className="text-xs font-black text-indigo-700 dark:text-indigo-300 uppercase tracking-widest flex items-center gap-2 mb-4">
                        <Users className="h-4 w-4" />
                        Personal Loan Summary
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        <div><p className="text-[9px] font-bold text-slate-500 uppercase">Total Taken</p><p className="font-black text-slate-900 dark:text-white">{formatCurrency(personalStats.totalDistributed)}</p></div>
                        <div><p className="text-[9px] font-bold text-slate-500 uppercase">Returned</p><p className="font-black text-emerald-600">{formatCurrency(personalStats.totalRecovered)}</p></div>
                        <div><p className="text-[9px] font-bold text-slate-500 uppercase">Outstanding</p><p className="font-black text-rose-600">{formatCurrency(personalStats.totalOutstanding)}</p></div>
                        <div><p className="text-[9px] font-bold text-slate-500 uppercase">Active / Closed</p><p className="font-black">{personalStats.activeCount} / {personalStats.completedCount}</p></div>
                        {requestType !== 'salary_advance' && (
                            <>
                                <div><p className="text-[9px] font-bold text-slate-500 uppercase">Interest Paid</p><p className="font-black text-indigo-600">{formatCurrency(personalStats.interestPaid || 0)}</p></div>
                                <div><p className="text-[9px] font-bold text-slate-500 uppercase">EMI This Period</p><p className="font-black text-amber-600">{formatCurrency(personalStats.currentPeriodEmi || 0)}</p></div>
                            </>
                        )}
                        {requestType === 'salary_advance' && (
                            <div><p className="text-[9px] font-bold text-slate-500 uppercase">Advance This Period</p><p className="font-black text-amber-600">{formatCurrency(personalStats.currentPeriodAdvanceDue || 0)}</p></div>
                        )}
                    </div>
                </div>
            )}

            {/* Underpaid employees last period */}
            {(payPeriod.last?.underpaidEmployees?.length || 0) > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/30 overflow-hidden dark:bg-rose-950/10 dark:border-rose-900/30">
                    <div className="px-6 py-4 border-b border-rose-100 dark:border-rose-900/30 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-rose-500" />
                        <h3 className="text-xs font-black text-rose-700 dark:text-rose-300 uppercase tracking-widest">
                            Underpaid Last Pay Period ({payPeriod.last?.underpaidEmployees?.length})
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="bg-rose-100/50 dark:bg-rose-900/20">
                                    <th className="px-4 py-3 font-black text-[9px] uppercase text-rose-600">Employee</th>
                                    <th className="px-4 py-3 font-black text-[9px] uppercase text-rose-600 text-right">Scheduled EMI</th>
                                    <th className="px-4 py-3 font-black text-[9px] uppercase text-rose-600 text-right">Recovered EMI</th>
                                    <th className="px-4 py-3 font-black text-[9px] uppercase text-rose-600 text-right">Shortfall</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rose-100 dark:divide-rose-900/20">
                                {payPeriod.last?.underpaidEmployees?.slice(0, 20).map((u, i) => (
                                    <tr key={i} className="hover:bg-rose-50 dark:hover:bg-rose-900/10">
                                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{u.employee_name} <span className="text-slate-400 font-normal">({u.emp_no})</span></td>
                                        <td className="px-4 py-3 text-right">{formatCurrency(u.scheduledEmi)}</td>
                                        <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(u.recoveredEmi)}</td>
                                        <td className="px-4 py-3 text-right font-black text-rose-600">{formatCurrency(u.shortfall)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 items-start">
                <div className="xl:col-span-1 space-y-6 sticky top-24">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800 flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Filter className="h-4 w-4" />
                                Filters
                            </h4>
                            {(divisionIds.length > 0 || departmentIds.length > 0 || employeeIds.length > 0) && (
                                <button
                                    onClick={() => {
                                        setDivisionIds([]);
                                        setDepartmentIds([]);
                                        setEmployeeIds([]);
                                        setDrilldownLevel('all');
                                    }}
                                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                >
                                    <X className="h-4 w-4 text-slate-400" />
                                </button>
                            )}
                        </div>
                        <div className="p-6 space-y-6">
                            {/* Date Period */}
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Period Mode</label>
                                <select
                                    value={dateMode}
                                    onChange={(e) => setDateMode(e.target.value as any)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold p-3 focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="pay_cycle">Pay Cycle</option>
                                    <option value="monthly">Calendar Month</option>
                                    <option value="range">Custom Range</option>
                                </select>
                            </div>
                            {dateMode !== 'range' ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Month</label>
                                        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold p-2.5">
                                            {Array.from({ length: 12 }, (_, i) => (
                                                <option key={i + 1} value={String(i + 1)}>{dayjs().month(i).format('MMM')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">Year</label>
                                        <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold p-2.5">
                                            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={String(y)}>{y}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">From</label>
                                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold p-2.5" />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block">To</label>
                                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold p-2.5" />
                                    </div>
                                </div>
                            )}

                            <div className="h-px bg-slate-100 dark:bg-slate-800" />

                            <MultiSelect
                                label="Division"
                                options={divisions.map(d => ({ id: d._id, name: d.name }))}
                                selectedIds={divisionIds}
                                onChange={handleDivisionChange}
                                loading={fetchingFilters}
                            />
                            <MultiSelect
                                label="Department"
                                options={departments.map(d => ({ id: d._id, name: d.name }))}
                                selectedIds={departmentIds}
                                onChange={handleDepartmentChange}
                                disabled={divisionIds.length === 0}
                            />
                            <MultiSelect
                                label="Employee"
                                options={employees.map(e => ({ id: e._id, name: `${e.employee_name} (${e.emp_no})` }))}
                                selectedIds={employeeIds}
                                onChange={(ids: string[]) => {
                                    setEmployeeIds(ids);
                                    if (ids.length > 0) setDrilldownLevel('employee');
                                    else if (departmentIds.length > 0) setDrilldownLevel('department');
                                }}
                                disabled={departmentIds.length === 0}
                            />

                            <MultiSelect
                                label="Designation"
                                options={designations.map(d => ({ id: d._id, name: d.name }))}
                                selectedIds={designationIds}
                                onChange={setDesignationIds}
                            />

                            <MultiSelect
                                label="Employee Group"
                                options={employeeGroups.map(g => ({ id: g._id, name: g.name }))}
                                selectedIds={employeeGroupIds}
                                onChange={setEmployeeGroupIds}
                            />

                            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />

                            {viewMode === 'abstract' && drilldownLevel === 'all' && (
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Group Summary By</label>
                                    <select
                                        value={abstractGroupBy}
                                        onChange={(e) => setAbstractGroupBy(e.target.value as any)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold p-3 focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="division">Division</option>
                                        <option value="department">Department</option>
                                        <option value="designation">Designation</option>
                                        <option value="employee_group">Employee Group</option>
                                        <option value="employee">Employee</option>
                                    </select>
                                </div>
                            )}

                            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />

                            {!isSpecialized && (
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                        Request Type
                                    </label>
                                    <select
                                        value={requestType}
                                        onChange={(e) => setRequestType(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold p-3 focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                                    >
                                        <option value="">All Types</option>
                                        <option value="loan">Loan Only</option>
                                        <option value="salary_advance">Salary Advance Only</option>
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                                    {requestType === 'salary_advance' ? 'Advance Status' : 'Loan Status'}
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-bold p-3 focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                                >
                                    <option value="">Active/Completed</option>
                                    <option value="active">Active</option>
                                    <option value="completed">Completed</option>
                                    <option value="disbursed">Disbursed (Awaiting EMI)</option>
                                    <option value="all">Include Pending/Rejected</option>
                                </select>
                            </div>

                            <button
                                onClick={() => loadReport(1)}
                                className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                Refresh Reports
                            </button>
                        </div>
                    </div>
                </div>

                {/* Primary Report View */}
                <div className="xl:col-span-3">
                    {viewMode === 'abstract' ? renderAbstractView() : renderDetailedView()}
                </div>

                {/* Detailed Loan Modal */}
                {selectedLoan && (
                    <LoanDetailsModal 
                        loan={selectedLoan} 
                        onClose={() => setSelectedLoan(null)} 
                    />
                )}

                {/* Export Modal */}
                {showExportModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Export Report</h3>
                                <button onClick={() => setShowExportModal(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                    <X className="h-5 w-5 text-slate-400" />
                                </button>
                            </div>
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Export Type</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setExportMode('detailed')}
                                            className={`py-3 rounded-xl text-xs font-black uppercase ${exportMode === 'detailed' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}
                                        >
                                            Detailed List
                                        </button>
                                        <button
                                            onClick={() => setExportMode('summary')}
                                            className={`py-3 rounded-xl text-xs font-black uppercase ${exportMode === 'summary' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}
                                        >
                                            Grouped Summary
                                        </button>
                                    </div>
                                </div>
                                {exportMode === 'summary' && (
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Group By</label>
                                        <select
                                            value={exportGroupBy}
                                            onChange={(e) => setExportGroupBy(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-bold p-3"
                                        >
                                            <option value="division">Division Wise</option>
                                            <option value="department">Department Wise</option>
                                            <option value="designation">Designation Wise</option>
                                            <option value="employee_group">Employee Group Wise</option>
                                            <option value="employee">Employee Wise</option>
                                        </select>
                                    </div>
                                )}
                                <p className="text-[10px] text-slate-500">
                                    Period: {dayjs(effectiveDates.start).format('DD MMM YYYY')} – {dayjs(effectiveDates.end).format('DD MMM YYYY')}
                                    {employeeIds.length === 1 && ' · Personal report'}
                                </p>
                                <button
                                    onClick={() => handleExport(exportFormat)}
                                    className="w-full py-4 rounded-2xl bg-rose-600 text-white text-xs font-black uppercase tracking-widest hover:bg-rose-700 flex items-center justify-center gap-2"
                                >
                                    <Download className="h-4 w-4" />
                                    Download {exportFormat.toUpperCase()}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
