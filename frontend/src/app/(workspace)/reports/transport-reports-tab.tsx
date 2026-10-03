'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { api } from '@/lib/api';
import {
  Bus,
  Search,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  IndianRupee,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  MapPin,
  Calendar,
  User,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Route,
  Users,
  LogIn,
  LogOut,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

interface TransportRequest {
  _id: string;
  emp_no: string;
  employee_name: string;
  route_id?: string;
  route_name?: string;
  stage_name?: string;
  bus_id?: string;
  fare?: number;
  status: string;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  raised_by?: string;
  raised_by_id?: string;
  academic_year?: string;
  application_number?: string;
  application_serial?: number;
  application_college_code?: string;
  application_course_code?: string;
  request_date?: string;
  created_at?: string;
  updated_at?: string;
  new_id_card_needed?: boolean;
  not_interested?: boolean;
  expiry_reason?: string | null;
  not_interested_reason?: string | null;
  employeeDetails?: {
    id: string;
    fullName: string;
    department: string;
    designation: string;
    college: string;
    email: string;
    mobileNumber: string;
    photo?: string;
    status: string;
  } | null;
}

interface BusEmployee {
  emp_no: string;
  employee_name: string;
  department: string;
  designation: string;
  stage_name: string;
  photo?: string | null;
  mobileNumber?: string;
  inTime: string;
  outTime: string;
  attendanceStatus: string;
}

interface BusReport {
  _id: string;
  busNumber: string;
  routeId: string;
  routeName: string;
  firstInTime: string;
  lastOutTime: string;
  totalKms: number;
  isLateArrival: boolean;
  syncStatus: string;
  passengerCount: number;
  employees: BusEmployee[];
}

interface SummaryData {
  totalRequests: number;
  approvedCount: number;
  cancelledCount: number;
  expiredCount: number;
  pendingCount: number;
  totalFare: number;
}

interface BusSummaryData {
  totalBuses: number;
  onTimeBuses: number;
  lateBuses: number;
  totalPassengers: number;
}

export default function TransportReportsTab() {
  const [subView, setSubView] = useState<'requests' | 'bus_wise'>('requests');

  // --- Sub-View 1: Employee Transport Requests State ---
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [exportingRequests, setExportingRequests] = useState(false);
  const [requests, setRequests] = useState<TransportRequest[]>([]);
  const [searchRequests, setSearchRequests] = useState('');
  const [debouncedSearchRequests, setDebouncedSearchRequests] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [academicYearFilter, setAcademicYearFilter] = useState('all');
  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([]);
  const [pageRequests, setPageRequests] = useState(1);
  const [limitRequests, setLimitRequests] = useState(25);
  const [paginationRequests, setPaginationRequests] = useState({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
  });
  const [summaryRequests, setSummaryRequests] = useState<SummaryData>({
    totalRequests: 0,
    approvedCount: 0,
    cancelledCount: 0,
    expiredCount: 0,
    pendingCount: 0,
    totalFare: 0,
  });
  const [selectedRequest, setSelectedRequest] = useState<TransportRequest | null>(null);

  // --- Sub-View 2: Bus Wise Daily Activity State ---
  const [loadingBusReports, setLoadingBusReports] = useState(true);
  const [busReports, setBusReports] = useState<BusReport[]>([]);
  const [searchBus, setSearchBus] = useState('');
  const [debouncedSearchBus, setDebouncedSearchBus] = useState('');
  const [onlyLate, setOnlyLate] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [pageBus, setPageBus] = useState(1);
  const [limitBus, setLimitBus] = useState(25);
  const [paginationBus, setPaginationBus] = useState({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
  });
  const [summaryBus, setSummaryBus] = useState<BusSummaryData>({
    totalBuses: 0,
    onTimeBuses: 0,
    lateBuses: 0,
    totalPassengers: 0,
  });
  const [expandedBusIds, setExpandedBusIds] = useState<Record<string, boolean>>({});

  // --- DB Connection Status ---
  const [dbConnected, setDbConnected] = useState<boolean>(true);
  const [dbMessage, setDbMessage] = useState<string>('');

  // Debounce Search Inputs
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchRequests(searchRequests);
      setPageRequests(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchRequests]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchBus(searchBus);
      setPageBus(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchBus]);

  // Fetch Requests Data
  const fetchRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const res: any = await api.getTransportReports({
        search: debouncedSearchRequests,
        status: statusFilter,
        academicYear: academicYearFilter,
        page: pageRequests,
        limit: limitRequests,
      });

      if (res && res.success) {
        if (res.dbConnected === false) {
          setDbConnected(false);
          setDbMessage(res.message || 'Transport Database is not configured in backend .env');
        } else {
          setDbConnected(true);
          setDbMessage('');
        }
        setRequests(res.data || []);
        if (res.pagination) setPaginationRequests(res.pagination);
        if (res.summary) setSummaryRequests(res.summary);
        if (res.availableAcademicYears) setAvailableAcademicYears(res.availableAcademicYears);
      } else {
        toast.error(res?.message || 'Failed to load transport requests');
      }
    } catch (err: any) {
      console.error('Error loading transport requests:', err);
      setDbConnected(false);
      setDbMessage('Error contacting transport API');
    } finally {
      setLoadingRequests(false);
    }
  }, [debouncedSearchRequests, statusFilter, academicYearFilter, pageRequests, limitRequests]);

  // Fetch Bus Wise Data
  const fetchBusReports = useCallback(async () => {
    try {
      setLoadingBusReports(true);
      const res: any = await api.getBusWiseReports({
        date: selectedDate,
        search: debouncedSearchBus,
        onlyLate,
        page: pageBus,
        limit: limitBus,
      });

      if (res && res.success) {
        if (res.dbConnected === false) {
          setDbConnected(false);
          setDbMessage(res.message || 'Transport Database is not configured in backend .env');
        } else {
          setDbConnected(true);
          setDbMessage('');
        }
        setBusReports(res.data || []);
        if (res.date) setSelectedDate(res.date);
        if (res.pagination) setPaginationBus(res.pagination);
        if (res.summary) setSummaryBus(res.summary);
        if (res.availableDates) setAvailableDates(res.availableDates);
      } else {
        toast.error(res?.message || 'Failed to load bus wise daily activity');
      }
    } catch (err: any) {
      console.error('Error loading bus wise reports:', err);
      setDbConnected(false);
      setDbMessage('Error contacting transport API');
    } finally {
      setLoadingBusReports(false);
    }
  }, [selectedDate, debouncedSearchBus, onlyLate, pageBus, limitBus]);

  useEffect(() => {
    if (subView === 'requests') {
      fetchRequests();
    } else {
      fetchBusReports();
    }
  }, [subView, fetchRequests, fetchBusReports]);

  // Export Requests to Excel
  const handleExportRequests = async () => {
    try {
      setExportingRequests(true);
      toast.loading('Generating Excel export...', { id: 'transport-export' });
      await api.exportTransportReports({
        search: debouncedSearchRequests,
        status: statusFilter,
        academicYear: academicYearFilter,
      });
      toast.success('Transport report downloaded successfully', { id: 'transport-export' });
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error(err.message || 'Failed to export transport report', { id: 'transport-export' });
    } finally {
      setExportingRequests(false);
    }
  };

  const toggleExpandBus = (id: string) => {
    setExpandedBusIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const resetRequestFilters = () => {
    setSearchRequests('');
    setDebouncedSearchRequests('');
    setStatusFilter('all');
    setAcademicYearFilter('all');
    setPageRequests(1);
  };

  const resetBusFilters = () => {
    setSearchBus('');
    setDebouncedSearchBus('');
    setOnlyLate(false);
    setPageBus(1);
  };

  const getStatusBadge = (status: string) => {
    const st = (status || '').toLowerCase();
    switch (st) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Approved
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            Cancelled
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Expired
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <AlertCircle className="w-3.5 h-3.5 text-blue-500" />
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Navigation Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900/90 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-600 text-white shadow-md shadow-violet-600/20">
            <Bus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              Transport Management & Reports
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Employee transport allocations, routes, and daily bus activity tracking
            </p>
          </div>
        </div>

        {/* View Switcher Sub-Tabs */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/70 dark:border-slate-700/60 select-none">
          <button
            onClick={() => setSubView('requests')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
              subView === 'requests'
                ? 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 shadow-sm scale-[1.01]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Bus className="w-4 h-4" />
            <span>Transport Requests</span>
          </button>

          <button
            onClick={() => setSubView('bus_wise')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
              subView === 'bus_wise'
                ? 'bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 shadow-sm scale-[1.01]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Route className="w-4 h-4" />
            <span>Bus Wise Daily Activity</span>
          </button>
        </div>
      </div>

      {/* Database Unconfigured Warning Notice */}
      {!dbConnected && (
        <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              Transport Database Not Configured
            </h4>
            <p className="text-xs mt-1 text-amber-700 dark:text-amber-300 font-medium">
              {dbMessage || 'TRANSPORT_MONGODB_URI is not configured in backend .env. Please set the transport database URI to view live transport reports.'}
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: EMPLOYEE TRANSPORT REQUESTS */}
      {/* ========================================================================= */}
      {subView === 'requests' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Action Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              Employee Transport Allocations
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchRequests}
                disabled={loadingRequests}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRequests ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={handleExportRequests}
                disabled={exportingRequests || requests.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 disabled:opacity-50 rounded-xl transition-all shadow-sm shadow-violet-500/20"
              >
                {exportingRequests ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total Requests
                </span>
                <div className="p-2 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                  <Bus className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {summaryRequests.totalRequests}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Approved</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                  {summaryRequests.approvedCount}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Cancelled
                </span>
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                  <XCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
                  {summaryRequests.cancelledCount}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Expired</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
                  {summaryRequests.expiredCount}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm relative overflow-hidden col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total Fare
                </span>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
                  ₹{summaryRequests.totalFare.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="p-3 bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchRequests}
                onChange={(e) => setSearchRequests(e.target.value)}
                placeholder="Search by Employee Name, Emp No, Route, Stage, Bus ID..."
                className="w-full pl-10 pr-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              {searchRequests && (
                <button
                  onClick={() => setSearchRequests('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPageRequests(1);
                }}
                className="py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="all">All Statuses</option>
                <option value="approved">Approved</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
                <option value="pending">Pending</option>
              </select>

              {availableAcademicYears.length > 0 && (
                <select
                  value={academicYearFilter}
                  onChange={(e) => {
                    setAcademicYearFilter(e.target.value);
                    setPageRequests(1);
                  }}
                  className="py-2 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                >
                  <option value="all">All Academic Years</option>
                  {availableAcademicYears.map((ay) => (
                    <option key={ay} value={ay}>
                      {ay}
                    </option>
                  ))}
                </select>
              )}

              {(debouncedSearchRequests || statusFilter !== 'all' || academicYearFilter !== 'all') && (
                <button
                  onClick={resetRequestFilters}
                  className="px-3 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl font-medium transition-all"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">Employee</th>
                    <th className="py-3.5 px-4">Application</th>
                    <th className="py-3.5 px-4">Route & Stage</th>
                    <th className="py-3.5 px-4">Bus ID</th>
                    <th className="py-3.5 px-4">Fare</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  {loadingRequests ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="py-4 px-4"><div className="h-4 w-4 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800"></div>
                            <div className="space-y-1">
                              <div className="h-3 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div>
                              <div className="h-2.5 w-16 bg-slate-100 dark:bg-slate-800/60 rounded"></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4"><div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-3 w-36 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-3 w-12 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded-full"></div></td>
                        <td className="py-4 px-4 text-right"><div className="h-7 w-16 bg-slate-200 dark:bg-slate-800 rounded ml-auto"></div></td>
                      </tr>
                    ))
                  ) : requests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center">
                        <div className="max-w-xs mx-auto text-center space-y-2">
                          <Bus className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            No Transport Requests Found
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Try adjusting your search query or status filter.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    requests.map((item, idx) => {
                      const sNo = (paginationRequests.page - 1) * paginationRequests.limit + idx + 1;
                      return (
                        <tr
                          key={item._id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                        >
                          <td className="py-3.5 px-4 font-semibold text-slate-400">{sNo}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {item.employeeDetails?.photo ? (
                                <img
                                  src={item.employeeDetails.photo}
                                  alt={item.employee_name}
                                  className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 font-bold flex items-center justify-center text-xs border border-violet-200 dark:border-violet-800">
                                  {(item.employee_name || 'E').substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span>{item.employeeDetails?.fullName || item.employee_name}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                  <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-600 dark:text-slate-300">
                                    #{item.emp_no}
                                  </span>
                                  {item.employeeDetails?.department && (
                                    <span>• {item.employeeDetails.department}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-900 dark:text-white font-mono text-[11px]">
                              {item.application_number || 'N/A'}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {item.request_date
                                ? dayjs(item.request_date).format('DD MMM YYYY')
                                : 'N/A'}{' '}
                              • {item.academic_year || ''}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
                              {item.route_id && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  {item.route_id}
                                </span>
                              )}
                              <span className="truncate max-w-[200px]" title={item.route_name}>
                                {item.route_name || 'N/A'}
                              </span>
                            </div>
                            {item.stage_name && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                                <span className="truncate max-w-[200px]">{item.stage_name}</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                              {item.bus_id || 'Unassigned'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                            {item.fare && item.fare > 0 ? (
                              `₹${item.fare.toLocaleString('en-IN')}`
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                                Free
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4">{getStatusBadge(item.status)}</td>

                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setSelectedRequest(item)}
                              className="px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/60 dark:hover:bg-violet-900/60 rounded-xl transition-all border border-violet-200/80 dark:border-violet-800"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {!loadingRequests && requests.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={limitRequests}
                    onChange={(e) => {
                      setLimitRequests(Number(e.target.value));
                      setPageRequests(1);
                    }}
                    className="py-1 px-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>
                    Showing {(paginationRequests.page - 1) * paginationRequests.limit + 1} to{' '}
                    {Math.min(paginationRequests.page * paginationRequests.limit, paginationRequests.total)} of{' '}
                    {paginationRequests.total} entries
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPageRequests((p) => Math.max(1, p - 1))}
                    disabled={paginationRequests.page <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 font-medium text-slate-700 dark:text-slate-300">
                    Page {paginationRequests.page} of {paginationRequests.totalPages || 1}
                  </span>
                  <button
                    onClick={() => setPageRequests((p) => Math.min(paginationRequests.totalPages, p + 1))}
                    disabled={paginationRequests.page >= paginationRequests.totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2: BUS WISE DAILY ACTIVITY */}
      {/* ========================================================================= */}
      {subView === 'bus_wise' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Action Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Route className="w-4 h-4 text-indigo-500" />
              Bus Daily Activity & Passenger Attendance
            </h3>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
              {/* Date selector */}
              <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl shadow-sm text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="shrink-0">Date:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setPageBus(1);
                  }}
                  className="bg-transparent focus:outline-none text-slate-900 dark:text-white font-mono font-medium w-[130px] cursor-pointer text-xs"
                />
              </div>

              <button
                onClick={fetchBusReports}
                disabled={loadingBusReports}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all shadow-sm shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingBusReports ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Total Buses Operating
                </span>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                  <Bus className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {summaryBus.totalBuses}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">On-Time Buses</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                  {summaryBus.onTimeBuses}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Late Arrival</span>
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
                  {summaryBus.lateBuses}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Assigned Passengers</span>
                <div className="p-2 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-2xl font-black text-violet-600 dark:text-violet-400 tracking-tight">
                  {summaryBus.totalPassengers}
                </span>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-3 bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchBus}
                onChange={(e) => setSearchBus(e.target.value)}
                placeholder="Search by Bus Number, Route ID, or Route Name..."
                className="w-full pl-10 pr-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
              {searchBus && (
                <button
                  onClick={() => setSearchBus('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Only Late Switch Toggle Button */}
            <button
              type="button"
              onClick={() => {
                setOnlyLate((prev) => !prev);
                setPageBus(1);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shrink-0 select-none ${
                onlyLate
                  ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800 shadow-sm ring-2 ring-rose-500/20'
                  : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
            >
              <AlertTriangle
                className={`w-3.5 h-3.5 ${onlyLate ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}
              />
              <span>Only Late Buses (&gt; 09:00 AM)</span>
              
              {/* iOS / Material Style Toggle Switch */}
              <div
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  onlyLate ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    onlyLate ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </button>
          </div>

          {/* Expandable Bus Table */}
          <div className="bg-white dark:bg-slate-900/90 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 px-4 w-10"></th>
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">Bus Number</th>
                    <th className="py-3.5 px-4">Route Info</th>
                    <th className="py-3.5 px-4">Bus In Time</th>
                    <th className="py-3.5 px-4">Bus Out Time</th>
                    <th className="py-3.5 px-4">Distance</th>
                    <th className="py-3.5 px-4">Passengers</th>
                    <th className="py-3.5 px-4 text-right">Employees</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  {loadingBusReports ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="py-4 px-4"><div className="h-4 w-4 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-4 w-4 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4"><div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded"></div></td>
                        <td className="py-4 px-4 text-right"><div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded ml-auto"></div></td>
                      </tr>
                    ))
                  ) : busReports.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center">
                        <div className="max-w-xs mx-auto text-center space-y-2">
                          <Bus className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            No Bus Daily Activity Found
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {onlyLate
                              ? `No late buses (> 09:00 AM) found for date ${selectedDate}.`
                              : `No GPS daily logs available for date ${selectedDate}.`}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    busReports.map((bus, idx) => {
                      const sNo = (paginationBus.page - 1) * paginationBus.limit + idx + 1;
                      const isExpanded = !!expandedBusIds[bus._id];

                      return (
                        <Fragment key={bus._id}>
                          {/* Main Bus Row */}
                          <tr
                            onClick={() => toggleExpandBus(bus._id)}
                            className={`cursor-pointer transition-colors ${
                              bus.isLateArrival
                                ? 'bg-rose-50/60 dark:bg-rose-950/30 border-l-4 border-l-rose-500 hover:bg-rose-100/60 dark:hover:bg-rose-900/40'
                                : isExpanded
                                ? 'bg-violet-50/50 dark:bg-violet-950/20 border-l-4 border-l-violet-500'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-3.5 px-4 text-slate-400">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-violet-600" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-semibold text-slate-400">{sNo}</td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg border ${
                                  bus.isLateArrival
                                    ? 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-800'
                                    : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white border-slate-200 dark:border-slate-700'
                                }`}
                              >
                                {bus.busNumber}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  {bus.routeId}
                                </span>
                                <span className="font-medium text-slate-900 dark:text-white truncate max-w-[220px]" title={bus.routeName}>
                                  {bus.routeName}
                                </span>
                              </div>
                            </td>

                            {/* Bus In Time */}
                            <td className="py-3.5 px-4 font-mono font-semibold">
                              {bus.isLateArrival ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-xs">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  Late ({bus.firstInTime})
                                </span>
                              ) : bus.firstInTime && bus.firstInTime !== '—' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  <LogIn className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  {bus.firstInTime}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            {/* Bus Out Time */}
                            <td className="py-3.5 px-4 font-mono font-semibold">
                              {bus.lastOutTime && bus.lastOutTime !== '—' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  <LogOut className="w-3 h-3 text-indigo-500" />
                                  {bus.lastOutTime}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            {/* Total Kms */}
                            <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium">
                              {bus.totalKms ? `${bus.totalKms} km` : '0 km'}
                            </td>

                            {/* Passengers */}
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                                <Users className="w-3 h-3 text-violet-500" />
                                {bus.passengerCount}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpandBus(bus._id);
                                }}
                                className="px-3 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/60 rounded-lg border border-violet-200/80 dark:border-violet-800 transition-all"
                              >
                                {isExpanded ? 'Hide Employees' : 'View Employees'}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Child Row - Employee Attendance Table */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-200/80 dark:border-slate-800">
                              <td colSpan={9} className="p-4">
                                <div className="ml-6 space-y-3 bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-inner">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                      <Users className="w-4 h-4 text-violet-500" />
                                      Assigned Employees & Attendance Punches ({bus.employees.length})
                                    </h4>
                                    <span className="text-[11px] text-slate-400 font-mono">
                                      Bus: {bus.busNumber} | Route: {bus.routeId}
                                    </span>
                                  </div>

                                  {bus.employees.length === 0 ? (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 py-3 text-center italic">
                                      No approved employees assigned to this route / bus.
                                    </p>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/60 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            <th className="py-2.5 px-3">S.No</th>
                                            <th className="py-2.5 px-3">Employee</th>
                                            <th className="py-2.5 px-3">Department & Designation</th>
                                            <th className="py-2.5 px-3">Boarding Stage</th>
                                            <th className="py-2.5 px-3">Employee In Time</th>
                                            <th className="py-2.5 px-3">Employee Out Time</th>
                                            <th className="py-2.5 px-3">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                                          {bus.employees.map((emp, empIdx) => (
                                            <tr key={emp.emp_no || empIdx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                                              <td className="py-2.5 px-3 text-slate-400 font-semibold">{empIdx + 1}</td>
                                              <td className="py-2.5 px-3">
                                                <div className="flex items-center gap-2.5">
                                                  {emp.photo ? (
                                                    <img
                                                      src={emp.photo}
                                                      alt={emp.employee_name}
                                                      className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                                    />
                                                  ) : (
                                                    <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950 font-bold flex items-center justify-center text-[10px]">
                                                      {(emp.employee_name || 'E').substring(0, 2).toUpperCase()}
                                                    </div>
                                                  )}
                                                  <div>
                                                    <div className="font-semibold text-slate-900 dark:text-white">
                                                      {emp.employee_name}
                                                    </div>
                                                    <div className="font-mono text-[10px] text-slate-400">
                                                      #{emp.emp_no}
                                                    </div>
                                                  </div>
                                                </div>
                                              </td>

                                              <td className="py-2.5 px-3">
                                                <div className="font-medium text-slate-800 dark:text-slate-200">
                                                  {emp.department}
                                                </div>
                                                <div className="text-[10px] text-slate-400">
                                                  {emp.designation}
                                                </div>
                                              </td>

                                              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                                                <div className="flex items-center gap-1">
                                                  <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                                                  <span>{emp.stage_name}</span>
                                                </div>
                                              </td>

                                              {/* Employee Punch In */}
                                              <td className="py-2.5 px-3 font-mono">
                                                {emp.inTime && emp.inTime !== 'No Punch' ? (
                                                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                                                    <LogIn className="w-3 h-3 text-emerald-500" />
                                                    {emp.inTime}
                                                  </span>
                                                ) : (
                                                  <span className="text-slate-400 italic">No Punch</span>
                                                )}
                                              </td>

                                              {/* Employee Punch Out */}
                                              <td className="py-2.5 px-3 font-mono">
                                                {emp.outTime && emp.outTime !== 'No Punch' ? (
                                                  <span className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-400 font-bold">
                                                    <LogOut className="w-3 h-3 text-indigo-500" />
                                                    {emp.outTime}
                                                  </span>
                                                ) : (
                                                  <span className="text-slate-400 italic">No Punch</span>
                                                )}
                                              </td>

                                              <td className="py-2.5 px-3">
                                                <span
                                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    emp.attendanceStatus === 'PRESENT'
                                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                      : emp.attendanceStatus === 'PARTIAL'
                                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                                  }`}
                                                >
                                                  {emp.attendanceStatus}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {!loadingBusReports && busReports.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={limitBus}
                    onChange={(e) => {
                      setLimitBus(Number(e.target.value));
                      setPageBus(1);
                    }}
                    className="py-1 px-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>
                    Showing {(paginationBus.page - 1) * paginationBus.limit + 1} to{' '}
                    {Math.min(paginationBus.page * paginationBus.limit, paginationBus.total)} of{' '}
                    {paginationBus.total} entries
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPageBus((p) => Math.max(1, p - 1))}
                    disabled={paginationBus.page <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 font-medium text-slate-700 dark:text-slate-300">
                    Page {paginationBus.page} of {paginationBus.totalPages || 1}
                  </span>
                  <button
                    onClick={() => setPageBus((p) => Math.min(paginationBus.totalPages, p + 1))}
                    disabled={paginationBus.page >= paginationBus.totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Details Modal (For Request View) */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                  <Bus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                    Transport Request Details
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {selectedRequest.application_number || 'N/A'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-violet-500" />
                    Employee Information
                  </span>
                  {getStatusBadge(selectedRequest.status)}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Employee Name</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {selectedRequest.employeeDetails?.fullName || selectedRequest.employee_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Employee Number</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      {selectedRequest.emp_no}
                    </span>
                  </div>
                  {selectedRequest.employeeDetails?.department && (
                    <div>
                      <span className="text-slate-400 block text-[11px]">Department</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {selectedRequest.employeeDetails.department}
                      </span>
                    </div>
                  )}
                  {selectedRequest.employeeDetails?.designation && (
                    <div>
                      <span className="text-slate-400 block text-[11px]">Designation</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {selectedRequest.employeeDetails.designation}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-3">
                <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                  Route & Allocation
                </span>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Route ID</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                      {selectedRequest.route_id || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Route Name</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {selectedRequest.route_name || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Boarding Stage</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {selectedRequest.stage_name || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Assigned Bus ID</span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                      {selectedRequest.bus_id || 'Unassigned'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80 rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
