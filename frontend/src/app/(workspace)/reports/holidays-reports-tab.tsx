'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api, Holiday, Division, Department, EmployeeGroup } from '@/lib/api';
import { MultiSelect } from '@/components/MultiSelect';
import { Calendar, Download, Loader2, Search, Filter, CalendarDays, CheckCircle2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import { auth } from '@/lib/auth';

dayjs.extend(isSameOrAfter);

export default function HolidaysReportsTab() {
  const [loading, setLoading] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingXlsx, setLoadingXlsx] = useState(false);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employeeGroups, setEmployeeGroups] = useState<EmployeeGroup[]>([]);

  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadFilters();
  }, []);

  const loadFilters = async () => {
    try {
      const [divRes, groupRes] = await Promise.all([
        api.getDivisions(true),
        api.getEmployeeGroups(true),
      ]);
      if (divRes.success) setDivisions(divRes.data || []);
      if (groupRes?.success) setEmployeeGroups(groupRes.data || []);
    } catch (e) {
      console.error('Failed to load filters:', e);
    }
  };

  useEffect(() => {
    if (divisionIds.length > 0) {
      api.getDepartments(true, divisionIds.join(',')).then(res => {
        if (res.success) setDepartments(res.data || []);
      }).catch(() => {});
    } else {
      api.getDepartments(true).then(res => {
        if (res.success) setDepartments(res.data || []);
      }).catch(() => {});
    }
  }, [divisionIds]);

  useEffect(() => {
    fetchHolidays();
  }, [selectedYear]);

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const res = await api.getAllHolidaysAdmin(parseInt(selectedYear), { includeInactive: false });
      if (res.success && res.data) {
        setHolidays(res.data.holidays || []);
      } else {
        const myRes = await api.getMyHolidays(parseInt(selectedYear));
        if (myRes.success && myRes.data) {
          setHolidays(myRes.data || []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch holidays:', err);
      toast.error('Failed to load holidays');
    } finally {
      setLoading(false);
    }
  };

  const filteredHolidays = useMemo(() => {
    return holidays.filter(h => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (h.name || '').toLowerCase().includes(q);
        const matchType = (h.type || '').toLowerCase().includes(q);
        if (!matchName && !matchType) return false;
      }

      if (divisionIds.length > 0) {
        if (h.scope === 'GLOBAL') {
          // Global applies to all
        } else if (h.scope === 'GROUP') {
          const groupDivs = h.groupId && typeof h.groupId === 'object' && h.groupId.divisionMapping
            ? h.groupId.divisionMapping.map((m: any) => typeof m.division === 'object' ? m.division._id : m.division)
            : [];
          if (groupDivs.length > 0 && !groupDivs.some((d: string) => divisionIds.includes(d))) {
            return false;
          }
        } else if (h.scope === 'MAPPING') {
          const mappedDivs = (h.divisionMapping || []).map(m => typeof m.division === 'object' ? m.division._id : m.division);
          if (mappedDivs.length > 0 && !mappedDivs.some((d: string) => divisionIds.includes(d))) {
            return false;
          }
        }
      }

      return true;
    });
  }, [holidays, searchQuery, divisionIds]);

  const stats = useMemo(() => {
    const total = filteredHolidays.length;
    const now = dayjs().startOf('day');
    const upcoming = filteredHolidays.filter(h => dayjs(h.date).isSameOrAfter(now, 'day')).length;
    const globalCount = filteredHolidays.filter(h => h.scope === 'GLOBAL').length;
    const groupCount = filteredHolidays.filter(h => h.scope !== 'GLOBAL').length;
    return { total, upcoming, globalCount, groupCount };
  }, [filteredHolidays]);

  const getAppliedGroupsText = (h: Holiday) => {
    if (h.scope === 'GLOBAL') {
      if (h.applicableTo === 'SPECIFIC_GROUPS' && h.targetGroupIds && h.targetGroupIds.length > 0) {
        return h.targetGroupIds.map((g: any) => typeof g === 'object' ? g.name : g).join(', ');
      }
      return 'Global (All Employees & Groups)';
    }
    if (h.scope === 'GROUP') {
      return typeof h.groupId === 'object' ? h.groupId?.name || 'Holiday Group' : 'Holiday Group';
    }
    if (h.scope === 'MAPPING') {
      return (h.divisionMapping || []).map(m => {
        const divName = typeof m.division === 'object' ? m.division?.name || 'Division' : 'Division';
        const depts = (m.departments || []).map((d: any) => typeof d === 'object' ? d.name : d).filter(Boolean).join(', ');
        return depts ? `${divName} (${depts})` : divName;
      }).join('; ') || 'Custom Scope';
    }
    return 'All Groups';
  };

  const handleDownloadPDF = async () => {
    setLoadingPdf(true);
    try {
      await api.downloadHolidaysPDF({
        year: selectedYear,
        division: divisionIds.length > 0 ? divisionIds.join(',') : undefined,
        search: searchQuery || undefined,
      });
      toast.success('PDF report downloaded successfully');
    } catch (e) {
      console.error('PDF export error:', e);
      toast.error('Failed to download PDF report');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleDownloadXLSX = async () => {
    setLoadingXlsx(true);
    try {
      await api.downloadHolidaysXLSX({
        year: selectedYear,
        division: divisionIds.length > 0 ? divisionIds.join(',') : undefined,
        search: searchQuery || undefined,
      });
      toast.success('Excel report downloaded successfully');
    } catch (e) {
      console.error('Excel export error:', e);
      toast.error('Failed to download Excel report');
    } finally {
      setLoadingXlsx(false);
    }
  };

  const currentYearNum = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => (currentYearNum - 2 + i).toString());

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Holidays Report</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Scope-based holiday calendar representation and export</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={loadingPdf}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-sm disabled:opacity-50"
            >
              {loadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span>PDF Report</span>
            </button>
            <button
              onClick={handleDownloadXLSX}
              disabled={loadingXlsx}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm disabled:opacity-50"
            >
              {loadingXlsx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span>Excel Report</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full h-9 px-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Division</label>
            <MultiSelect
              options={divisions.map(d => ({ id: d._id, name: d.name }))}
              selectedIds={divisionIds}
              onChange={setDivisionIds}
              placeholder="All Divisions"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Department</label>
            <MultiSelect
              options={departments.map(d => ({ id: d._id, name: d.name }))}
              selectedIds={departmentIds}
              onChange={setDepartmentIds}
              placeholder="All Departments"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Group</label>
            <MultiSelect
              options={employeeGroups.map(g => ({ id: g._id, name: g.name }))}
              selectedIds={groupIds}
              onChange={setGroupIds}
              placeholder="All Groups"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Search Event</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by holiday name..."
                className="w-full h-9 pl-9 pr-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Holidays</p>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{stats.total}</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CalendarDays className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Upcoming</p>
            <h3 className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">{stats.upcoming}</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            <Sparkles className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Global Holidays</p>
            <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{stats.globalCount}</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scoped / Group</p>
            <h3 className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.groupCount}</h3>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <Filter className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            <p className="text-xs text-slate-500 font-medium">Loading holiday records...</p>
          </div>
        ) : filteredHolidays.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700 mb-2" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Holidays Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No holiday records match your selected filters or year.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4 w-12 text-center">S.No</th>
                  <th className="py-3 px-4 min-w-[130px]">Date of Holiday</th>
                  <th className="py-3 px-4 min-w-[100px]">Day</th>
                  <th className="py-3 px-4 min-w-[200px]">Name of the Event</th>
                  <th className="py-3 px-4 min-w-[240px]">Applied Groups</th>
                  <th className="py-3 px-4 min-w-[110px]">Type</th>
                  <th className="py-3 px-4 min-w-[110px]">Slot</th>
                  <th className="py-3 px-4 min-w-[90px] text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                {filteredHolidays.map((h, i) => {
                  const dateFormatted = h.date ? dayjs(h.date).format('DD/MM/YYYY') : '-';
                  const endDateFormatted = h.endDate ? ` - ${dayjs(h.endDate).format('DD/MM/YYYY')}` : '';
                  const dayName = h.date ? dayjs(h.date).format('dddd') : '-';
                  const isPast = h.date ? dayjs(h.date).isBefore(dayjs().startOf('day')) : false;

                  return (
                    <tr
                      key={h._id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        isPast ? 'opacity-75' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-medium text-slate-500">{i + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {dateFormatted}{endDateFormatted}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                        {dayName}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                        {h.name}
                        {h.description && (
                          <p className="text-[10px] text-slate-400 font-normal mt-0.5 line-clamp-1">{h.description}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                        <span className="inline-block bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded text-[11px]">
                          {getAppliedGroupsText(h)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                          {h.type || 'National'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                        {h.rosterApplyMode === 'HALF_DAY' ? (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            Half Day ({h.halfDayType === 'second_half' ? '2nd Half' : '1st Half'})
                          </span>
                        ) : (
                          <span>Full Day</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {h.isActive === false ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Inactive
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
