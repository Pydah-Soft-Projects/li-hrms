'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { ChevronRight, X, ExternalLink } from 'lucide-react';

export default function ComplaintsReportsTab() {
  const [allComplaints, setAllComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [historyEmployees, setHistoryEmployees] = useState<any[]>([]);
  const [historyDivFilter, setHistoryDivFilter] = useState('');
  const [historyDeptFilter, setHistoryDeptFilter] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDrilldownLevel, setHistoryDrilldownLevel] = useState<'all' | 'division' | 'department'>('all');
  const [selectedHistoryEmployee, setSelectedHistoryEmployee] = useState<any | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<any | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    api.getDivisions(true).then(res => { if (res.success) setDivisions(res.data || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getComplaints().then(res => { if (res.success) setAllComplaints(res.data || []); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.getDepartments(true, historyDivFilter || undefined).then(res => {
      if (res.success) {
        const d = res.data || [];
        setDepartments(d);
        if (historyDeptFilter && !d.some((x: any) => x._id === historyDeptFilter)) setHistoryDeptFilter('');
        if (historyDivFilter && d.length === 0) setHistoryDrilldownLevel('department');
      }
    }).catch(() => {});
  }, [historyDivFilter]);

  useEffect(() => {
    if (historyDrilldownLevel !== 'department' || !historyDivFilter) { setHistoryEmployees([]); return; }
    setHistoryLoading(true);
    const t = setTimeout(() => {
      api.getEmployeesList({ division_id: historyDivFilter, department_id: historyDeptFilter || undefined, is_active: true })
        .then(res => { if (res.success) setHistoryEmployees(res.data || []); })
        .catch(() => {})
        .finally(() => setHistoryLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [historyDrilldownLevel, historyDivFilter, historyDeptFilter]);

  const divisionSummaries = useMemo(() => {
    const map: Record<string, any> = {};
    divisions.forEach(div => { map[div._id] = { id: div._id, name: div.name, total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 }; });
    allComplaints.forEach(comp => {
      const id = comp.division_id?.toString(); if (!id) return;
      if (!map[id]) map[id] = { id, name: comp.division_name || 'Unknown', total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
      map[id].total++;
      const s = comp.status;
      if (s === 'approved') map[id].approved++; else if (s === 'rejected') map[id].rejected++; else if (s === 'cancelled') map[id].cancelled++; else map[id].pending++;
    });
    return Object.values(map);
  }, [allComplaints, divisions]);

  const departmentSummaries = useMemo(() => {
    if (historyDrilldownLevel !== 'division' || !historyDivFilter) return [];
    const map: Record<string, any> = {};
    departments.forEach(dept => { map[dept._id] = { id: dept._id, name: dept.name, total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 }; });
    allComplaints.forEach(comp => {
      if (comp.division_id?.toString() !== historyDivFilter) return;
      const id = comp.department_id?.toString(); if (!id) return;
      if (!map[id]) map[id] = { id, name: comp.department_name || 'Unknown', total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
      map[id].total++;
      const s = comp.status;
      if (s === 'approved') map[id].approved++; else if (s === 'rejected') map[id].rejected++; else if (s === 'cancelled') map[id].cancelled++; else map[id].pending++;
    });
    return Object.values(map);
  }, [allComplaints, departments, historyDivFilter, historyDrilldownLevel]);

  const employeeSummaries = useMemo(() => {
    if (historyDrilldownLevel !== 'department' || !historyDivFilter) return [];
    const map: Record<string, any> = {};
    historyEmployees.forEach(emp => {
      map[emp._id] = { id: emp._id, name: emp.employee_name || 'Unknown', emp_no: emp.emp_no || '', designation: emp.designation_id?.name || emp.designation?.name || emp.designation || 'Staff', total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    });
    allComplaints.forEach(comp => {
      if (comp.division_id?.toString() !== historyDivFilter) return;
      if (historyDeptFilter && comp.department_id?.toString() !== historyDeptFilter) return;
      const id = comp.employeeId?._id?.toString() || comp.employeeId?.toString() || ''; if (!id) return;
      if (!map[id]) map[id] = { id, name: comp.employeeName || 'Unknown', emp_no: comp.emp_no || '', designation: comp.designation || 'Staff', total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
      map[id].total++;
      const s = comp.status;
      if (s === 'approved') map[id].approved++; else if (s === 'rejected') map[id].rejected++; else if (s === 'cancelled') map[id].cancelled++; else map[id].pending++;
    });
    return Object.values(map);
  }, [allComplaints, historyDivFilter, historyDeptFilter, historyDrilldownLevel, historyEmployees]);

  const employeeComplaints = useMemo(() => {
    if (!selectedHistoryEmployee) return [];
    return allComplaints.filter(comp => {
      if ((comp.employeeId?._id?.toString() || comp.employeeId?.toString()) !== selectedHistoryEmployee._id?.toString()) return false;
      if (startDate || endDate) {
        const d = new Date(comp.appliedAt || comp.createdAt).toISOString().split('T')[0];
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    });
  }, [allComplaints, selectedHistoryEmployee, startDate, endDate]);

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    let bg = 'bg-slate-100 text-slate-700 border-slate-200'; let label = status;
    if (s === 'pending') { bg = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900'; label = 'Pending Review'; }
    else if (s === 'approved') { bg = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'; label = 'Approved'; }
    else if (s === 'rejected') { bg = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'; label = 'Rejected'; }
    else if (s === 'cancelled') { bg = 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'; label = 'Cancelled'; }
    return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${bg}`}>{label}</span>;
  };

  const pctBadge = (pct: number) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black ${pct >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : pct >= 75 ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30'}`}>{pct}%</span>
  );

  const handleBack = () => {
    if (historyDrilldownLevel === 'department') {
      if (historyDeptFilter) { setHistoryDrilldownLevel('division'); setHistoryDeptFilter(''); }
      else { setHistoryDrilldownLevel('all'); setHistoryDivFilter(''); }
    } else if (historyDrilldownLevel === 'division') {
      setHistoryDrilldownLevel('all'); setHistoryDivFilter(''); setHistoryDeptFilter('');
    }
  };

  if (selectedHistoryEmployee) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <button onClick={() => setSelectedHistoryEmployee(null)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-white transition-all shadow-sm">
            <ChevronRight className="h-4 w-4 rotate-180" />
          </button>
          <div>
            <h2 className="text-xs md:text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Complaint History — {selectedHistoryEmployee.employee_name}</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Emp No: {selectedHistoryEmployee.emp_no} | {selectedHistoryEmployee.department_id?.name || 'No Department'} | {selectedHistoryEmployee.division_id?.name || 'No Division'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/80">
          {[{ label: 'From Date', val: startDate, set: setStartDate }, { label: 'To Date', val: endDate, set: setEndDate }].map(({ label, val, set }) => (
            <div key={label} className="flex flex-col gap-1.5 w-full sm:w-auto">
              <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</label>
              <input type="date" value={val} onChange={e => set(e.target.value)} className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold focus:outline-none text-slate-900 dark:text-white" />
            </div>
          ))}
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }} className="px-4 py-2.5 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><X className="h-3 w-3" /> Clear</button>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Complaints List ({employeeComplaints.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
                  <th className="px-6 py-4">Applied Date</th><th className="px-4 py-4">Category / Type</th><th className="px-4 py-4">Remarks</th><th className="px-4 py-4 text-center">Status</th><th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {employeeComplaints.map(comp => (
                  <tr key={comp._id} onClick={() => setSelectedComplaint(comp)} className="group hover:bg-slate-50/80 dark:hover:bg-slate-900/60 transition-colors cursor-pointer">
                    <td className="px-6 py-4"><span className="text-xs font-black text-slate-900 dark:text-white">{new Date(comp.appliedAt || comp.createdAt).toLocaleDateString('en-GB')}</span></td>
                    <td className="px-4 py-4"><span className="text-xs font-bold text-slate-700 dark:text-slate-300">{comp.complaintType}</span></td>
                    <td className="px-4 py-4 max-w-xs truncate"><span className="text-xs text-slate-500 dark:text-slate-400">{comp.remarks}</span></td>
                    <td className="px-4 py-4 text-center">{getStatusBadge(comp.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={e => { e.stopPropagation(); setSelectedComplaint(comp); }} className="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 ml-auto">
                        <span>View Details</span><ExternalLink className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
                {employeeComplaints.length === 0 && <tr><td colSpan={5} className="py-20 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No complaints found for this employee</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {selectedComplaint && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedComplaint(null)}>
            <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Complaint Details</h3>
                <button onClick={() => setSelectedComplaint(null)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-all"><X className="h-4 w-4 text-slate-600 dark:text-slate-300" /></button>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between"><span className="font-bold text-slate-500 uppercase tracking-widest">Type</span><span className="font-black text-slate-900 dark:text-white">{selectedComplaint.complaintType}</span></div>
                <div className="flex justify-between"><span className="font-bold text-slate-500 uppercase tracking-widest">Status</span>{getStatusBadge(selectedComplaint.status)}</div>
                <div className="flex justify-between"><span className="font-bold text-slate-500 uppercase tracking-widest">Date</span><span className="font-black text-slate-900 dark:text-white">{new Date(selectedComplaint.appliedAt || selectedComplaint.createdAt).toLocaleDateString('en-GB')}</span></div>
                {selectedComplaint.remarks && <div className="pt-2 border-t border-slate-100 dark:border-slate-800"><span className="font-bold text-slate-500 uppercase tracking-widest block mb-1">Remarks</span><p className="text-slate-700 dark:text-slate-300 leading-relaxed">{selectedComplaint.remarks}</p></div>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const tableRows = historyDrilldownLevel === 'all' ? divisionSummaries : historyDrilldownLevel === 'division' ? departmentSummaries : employeeSummaries;
  const tableTitle = historyDrilldownLevel === 'all' ? 'Complaints by Division'
    : historyDrilldownLevel === 'division' ? `Departments in ${divisions.find(d => d._id === historyDivFilter)?.name || 'Selected Division'}`
    : historyDeptFilter ? `Employees in ${departments.find(d => d._id === historyDeptFilter)?.name || 'Selected Department'}`
    : `Employees in ${divisions.find(d => d._id === historyDivFilter)?.name || 'Selected Division'}`;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/60 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {historyDrilldownLevel !== 'all' && (
              <button onClick={handleBack} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-white transition-all text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                <ChevronRight className="h-3 w-3 rotate-180" /> Back
              </button>
            )}
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">{tableTitle}</h3>
          </div>
          {historyDrilldownLevel !== 'department' && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Click row to drill-down</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 text-[9px] font-semibold text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">{historyDrilldownLevel === 'all' ? 'Division' : historyDrilldownLevel === 'division' ? 'Department' : 'Employee'}</th>
                <th className="px-4 py-4 text-center">Total</th>
                <th className="px-4 py-4 text-center">Pending</th>
                <th className="px-4 py-4 text-center">Approved</th>
                <th className="px-4 py-4 text-center">Rejected</th>
                <th className="px-4 py-4 text-center">Cancelled</th>
                <th className="px-6 py-4 text-center">Resolution %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(loading || historyLoading) && <tr><td colSpan={7} className="py-20 text-center text-xs font-black text-slate-400 uppercase tracking-widest">Loading...</td></tr>}
              {!(loading || historyLoading) && tableRows.map((item: any) => {
                const pct = item.total > 0 ? Math.round(((item.approved + item.rejected + item.cancelled) / item.total) * 100) : 100;
                const icon = historyDrilldownLevel === 'all' ? { l: 'Div', c: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400' } : historyDrilldownLevel === 'division' ? { l: 'Dept', c: 'bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400' } : { l: 'Emp', c: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' };
                return (
                  <tr key={item.id} onClick={() => {
                    if (historyDrilldownLevel === 'all') { setHistoryDivFilter(item.id); setHistoryDrilldownLevel('division'); }
                    else if (historyDrilldownLevel === 'division') { setHistoryDeptFilter(item.id); setHistoryDrilldownLevel('department'); }
                    else { setSelectedHistoryEmployee({ _id: item.id, employee_name: item.name, emp_no: item.emp_no, department_id: { name: departments.find((d: any) => d._id === historyDeptFilter)?.name || '' }, division_id: { name: divisions.find((d: any) => d._id === historyDivFilter)?.name || '' } }); setStartDate(''); setEndDate(''); }
                  }} className="group hover:bg-slate-50/80 dark:hover:bg-slate-900/60 transition-colors cursor-pointer select-none">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-[10px] uppercase ${icon.c}`}>{icon.l}</div>
                        <div>
                          <span className="text-xs font-black text-slate-900 dark:text-white group-hover:translate-x-1 transition-transform block">{item.name}</span>
                          {historyDrilldownLevel === 'department' && <span className="text-[10px] text-slate-400 block mt-0.5">{item.designation} | No. {item.emp_no}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center text-xs font-bold text-slate-600 dark:text-slate-400">{item.total}</td>
                    <td className="px-4 py-4 text-center text-xs font-bold text-amber-600 dark:text-amber-400">{item.pending}</td>
                    <td className="px-4 py-4 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">{item.approved}</td>
                    <td className="px-4 py-4 text-center text-xs font-bold text-rose-600 dark:text-rose-400">{item.rejected}</td>
                    <td className="px-4 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400">{item.cancelled}</td>
                    <td className="px-6 py-4 text-center">{pctBadge(pct)}</td>
                  </tr>
                );
              })}
              {!(loading || historyLoading) && tableRows.length === 0 && <tr><td colSpan={7} className="py-20 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No data available at this level</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
